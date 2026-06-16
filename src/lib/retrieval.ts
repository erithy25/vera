import { settingsRepo, framesRepo, DbFrame } from "./db";
import { ollamaClient, cosineSimilarity } from "./ollama";

export interface TimeRange {
  startMs: number;
  endMs: number;
  label: string;
}

// Lightweight natural-language time filter for queries like "this morning".
export function parseTimeRange(query: string): TimeRange | null {
  const q = query.toLowerCase();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400000;
  const hour = 3600000;
  if (q.includes("this morning")) {
    return { startMs: startOfToday, endMs: startOfToday + 12 * hour, label: "this morning" };
  }
  if (q.includes("this afternoon")) {
    return { startMs: startOfToday + 12 * hour, endMs: startOfToday + 18 * hour, label: "this afternoon" };
  }
  if (q.includes("this evening") || q.includes("tonight")) {
    return { startMs: startOfToday + 18 * hour, endMs: startOfToday + 24 * hour, label: "this evening" };
  }
  if (q.includes("yesterday")) {
    return { startMs: startOfToday - dayMs, endMs: startOfToday, label: "yesterday" };
  }
  if (q.includes("last hour") || q.includes("past hour")) {
    return { startMs: Date.now() - hour, endMs: Date.now(), label: "the last hour" };
  }
  if (q.includes("this week") || q.includes("past week")) {
    return { startMs: Date.now() - 7 * dayMs, endMs: Date.now(), label: "this week" };
  }
  if (q.includes("today")) {
    return { startMs: startOfToday, endMs: startOfToday + dayMs, label: "today" };
  }
  return null;
}

export interface FrameHit {
  frame: DbFrame;
  score: number;
}

// How the candidate frames were found — lets the UI explain itself honestly and
// avoids presenting unrelated frames as if they answered the question.
export type RetrievalScope = "app" | "semantic" | "keyword" | "recent" | "none";

export interface RetrievalResult {
  hits: FrameHit[];
  timeRange: TimeRange | null;
  scope: RetrievalScope;
  apps: string[]; // app names the query referred to (if any)
}

// Well-known apps so a question like "which tabs in Safari" is recognized as
// app-scoped even when Safari has zero recorded frames yet — letting Vera say
// "no Safari frames" honestly instead of falling back to unrelated frames.
// Multi-word names also match on a significant word ("chrome" → Google Chrome).
const KNOWN_APPS = [
  "Safari", "Google Chrome", "Arc", "Microsoft Edge", "Firefox", "Brave Browser",
  "Visual Studio Code", "Xcode", "Slack", "Discord", "Notion", "Figma", "Spotify",
  "WhatsApp", "Telegram", "Terminal", "iTerm", "Obsidian", "Linear", "Postman",
  "Zoom", "Microsoft Teams",
];

// Words that carry no retrieval signal — dropped before keyword search.
const STOPWORDS = new Set([
  "the", "a", "an", "on", "in", "at", "of", "to", "and", "or", "for", "with",
  "my", "me", "i", "have", "has", "had", "been", "was", "were", "is", "are",
  "am", "do", "did", "does", "done", "you", "your", "which", "what", "where",
  "when", "who", "how", "that", "this", "these", "those", "about", "from",
  "it", "its", "im", "ive", "whats", "be", "can", "could", "would", "should",
  "tab", "tabs", "page", "pages", "site", "sites", "website", "websites",
  "visited", "visit", "open", "opened", "go", "gone", "went",
]);

function tokenize(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s.\-_/]/gu, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    )
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Which recorded apps does this query refer to? Matches the full app name as a
// substring (e.g. "safari") or any significant word of a multi-word name
// ("google chrome" → "chrome"). Short names (≤3, e.g. "Arc") only match in full.
function appsMentioned(query: string, apps: string[]): string[] {
  const q = ` ${query.toLowerCase()} `;
  const hits = new Set<string>();
  for (const app of apps) {
    const al = app.toLowerCase();
    if (al.length >= 4 && q.includes(al)) {
      hits.add(app);
      continue;
    }
    if (al.length <= 3 && new RegExp(`\\b${escapeRegExp(al)}\\b`).test(q)) {
      hits.add(app);
      continue;
    }
    for (const w of al.split(/\s+/)) {
      if (w.length >= 4 && new RegExp(`\\b${escapeRegExp(w)}\\b`).test(q)) {
        hits.add(app);
        break;
      }
    }
  }
  return Array.from(hits);
}

// Broad "what did I do / see" style questions where surfacing the most recent
// real frames is genuinely helpful (vs. a specific question, where unrelated
// recent frames would be misleading).
const BROAD_RE =
  /\b(today|day|morning|afternoon|evening|tonight|yesterday|week|recently|lately|see|saw|seen|doing|working|happen|happened|recap|summary|summarize|overview|screen|everything|anything|all)\b/i;

// Collapse near-duplicate frames (clicking through one page yields many): keep
// the most recent frame per distinct page (URL → window title → first OCR line).
function dedupeFrames(frames: DbFrame[], limit: number): DbFrame[] {
  const seen = new Set<string>();
  const out: DbFrame[] = [];
  for (const f of frames) {
    const key = (
      f.url ||
      f.window_title ||
      (f.ocr_text || "").slice(0, 48) ||
      String(f.id)
    )
      .toLowerCase()
      .trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

// Retrieve the best candidate frames for a query. Strategy, in order:
//   1. App-aware  — the query names a recorded app ("Safari", "Notes"): return
//      that app's distinct pages/windows (this is what makes "which tabs in
//      Safari" actually work). If the app has no frames, return NONE (honest).
//   2. Semantic   — embedding similarity over recent candidates.
//   3. Keyword    — per-word LIKE across ocr_text/app/title/url.
//   4. Recent     — only for broad "what did I do/see" questions or an explicit
//      time range; never for a specific question (so we don't show junk).
// Reads only the index (redacted ocr_text + metadata); never decrypts media.
export async function retrieveRelevantFrames(
  query: string,
  topN = 4
): Promise<RetrievalResult> {
  const timeRange = parseTimeRange(query);

  // 1) App-aware path. Detect against recorded apps ∪ well-known apps, so a
  // named-but-never-recorded app still routes here (→ honest "no frames").
  let mentioned: string[] = [];
  try {
    const recorded = await framesRepo.distinctApps();
    const detectSet = Array.from(new Set([...recorded, ...KNOWN_APPS]));
    mentioned = appsMentioned(query, detectSet);
  } catch (err) {
    console.error("distinctApps failed:", err);
  }
  if (mentioned.length > 0) {
    try {
      const appFrames = await framesRepo.byApps(
        mentioned,
        timeRange?.startMs,
        timeRange?.endMs,
        400
      );
      if (appFrames.length > 0) {
        const distinct = dedupeFrames(appFrames, Math.max(topN, 6));
        return {
          hits: distinct.map((f) => ({ frame: f, score: 1 })),
          timeRange,
          scope: "app",
          apps: mentioned,
        };
      }
    } catch (err) {
      console.error("App-scoped frame search failed:", err);
    }
    // Named an app we have not recorded → say so, don't show unrelated frames.
    return { hits: [], timeRange, scope: "none", apps: mentioned };
  }

  // 2) Semantic path.
  try {
    const embeddingModel = await settingsRepo.getEmbeddingModel();
    const installed = await ollamaClient.listModels();
    const available =
      installed.includes(embeddingModel) || installed.includes(`${embeddingModel}:latest`);
    const candidates = await framesRepo.search(undefined, timeRange?.startMs, timeRange?.endMs, 500);

    if (available && candidates.length > 0) {
      const queryVector = await ollamaClient.generateEmbedding(query, embeddingModel);
      const hits = candidates
        .map((f) => {
          if (!f.embedding) return { frame: f, score: -1 };
          try {
            return { frame: f, score: cosineSimilarity(queryVector, JSON.parse(f.embedding)) };
          } catch {
            return { frame: f, score: -1 };
          }
        })
        .filter((h) => h.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
      if (hits.length > 0) {
        return { hits, timeRange, scope: "semantic", apps: [] };
      }
    }
  } catch (err) {
    console.error("Semantic frame search failed:", err);
  }

  // 3) Tokenized keyword path.
  try {
    const tokens = tokenize(query);
    if (tokens.length > 0) {
      const kw = await framesRepo.searchAny(tokens, timeRange?.startMs, timeRange?.endMs, 80);
      if (kw.length > 0) {
        const distinct = dedupeFrames(kw, topN);
        return {
          hits: distinct.map((f) => ({ frame: f, score: 0.5 })),
          timeRange,
          scope: "keyword",
          apps: [],
        };
      }
    }
  } catch (err) {
    console.error("Keyword frame search failed:", err);
  }

  // 4) Recent fallback — only when the question is broad or time-scoped.
  if (timeRange || BROAD_RE.test(query)) {
    try {
      const recent = await framesRepo.search(undefined, timeRange?.startMs, timeRange?.endMs, topN);
      if (recent.length > 0) {
        return { hits: recent.map((f) => ({ frame: f, score: 0 })), timeRange, scope: "recent", apps: [] };
      }
    } catch (err) {
      console.error("Recent frame fallback failed:", err);
    }
  }

  return { hits: [], timeRange, scope: "none", apps: [] };
}

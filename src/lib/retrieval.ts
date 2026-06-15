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

// Retrieve the top-N candidate frames for a query: keyword + semantic + an
// optional time filter. Reads only the index (redacted ocr_text + metadata) —
// it never loads the whole store into the model and never decrypts media here
// (only the cited frames' thumbnails are decrypted later, for display).
export async function retrieveRelevantFrames(
  query: string,
  topN = 4
): Promise<{ hits: FrameHit[]; timeRange: TimeRange | null }> {
  const timeRange = parseTimeRange(query);
  let hits: FrameHit[] = [];

  try {
    const embeddingModel = await settingsRepo.getEmbeddingModel();
    const installed = await ollamaClient.listModels();
    const available =
      installed.includes(embeddingModel) || installed.includes(`${embeddingModel}:latest`);

    // Candidate set: time-bounded when a filter is present, else recent frames.
    const candidates = await framesRepo.search(undefined, timeRange?.startMs, timeRange?.endMs, 500);

    if (available && candidates.length > 0) {
      const queryVector = await ollamaClient.generateEmbedding(query, embeddingModel);
      hits = candidates
        .map((f) => {
          if (!f.embedding) return { frame: f, score: -1 };
          try {
            return { frame: f, score: cosineSimilarity(queryVector, JSON.parse(f.embedding)) };
          } catch {
            return { frame: f, score: -1 };
          }
        })
        .filter((h) => h.score > 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
    }
  } catch (err) {
    console.error("Semantic frame search failed:", err);
  }

  // Keyword fallback (or supplement) when semantic produced nothing.
  if (hits.length === 0) {
    const kw = await framesRepo.search(query, timeRange?.startMs, timeRange?.endMs, topN);
    hits = kw.map((f) => ({ frame: f, score: 0 }));
  }

  return { hits, timeRange };
}

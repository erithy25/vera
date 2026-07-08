// Pure segmentation engine: turns the raw moment stream (activity events +
// frames) of one day into contiguous work blocks. No Tauri/DB imports — this
// module is exercised by a standalone Node replica test.
//
// Rules (docs/UMBAUPLAN.md, Schicht 2):
//  - A moment's signature = app + domain (from URL) or normalized document
//    title. Consecutive moments with the same signature merge into one block.
//  - A block breaks when the context switches for longer than SWITCH_MS
//    (quick peeks shorter than that are absorbed) or on a gap ≥ GAP_MS.
//  - Blocks shorter than MIN_BLOCK_MS are absorbed into an adjacent block
//    when one is close enough, otherwise they stay as standalone short work.
//  - Evidence keeps the top window titles, domains, apps, and distinctive
//    OCR terms, so a block stays explainable after raw frames are evicted.

export interface Moment {
  t: number; // epoch ms
  durationMs: number; // >0; frames use a nominal 1s
  app: string;
  title: string | null;
  url: string | null;
  ocr: string | null;
}

export interface BlockEvidence {
  apps: string[];
  titles: string[];
  domains: string[];
  terms: string[];
}

// The evidence contract lives HERE: shape, caps, parse, and merge. Every
// other module (repos, UI) goes through these helpers so the format can
// never drift between the engine, merged blocks, and the evidence panel.
export const EVIDENCE_CAPS = { apps: 3, titles: 5, domains: 5, terms: 8 } as const;

export const EVIDENCE_KEYS = ["apps", "titles", "domains", "terms"] as const;

export function emptyEvidence(): BlockEvidence {
  return { apps: [], titles: [], domains: [], terms: [] };
}

/** Parse stored evidence JSON defensively (bad/old rows become empty lists). */
export function parseEvidenceJson(raw: string | null): BlockEvidence {
  const out = emptyEvidence();
  try {
    const parsed = JSON.parse(raw || "{}");
    for (const key of EVIDENCE_KEYS) {
      const v = parsed[key];
      if (Array.isArray(v)) out[key] = v.filter((x) => typeof x === "string");
    }
  } catch {
    // unparseable evidence → empty
  }
  return out;
}

/** Order-preserving union of several evidence sets, capped per key. */
export function mergeEvidence(list: BlockEvidence[]): BlockEvidence {
  const out = emptyEvidence();
  for (const key of EVIDENCE_KEYS) {
    const seen: string[] = [];
    for (const e of list) {
      for (const v of e[key]) {
        if (!seen.includes(v)) seen.push(v);
      }
    }
    out[key] = seen.slice(0, EVIDENCE_CAPS[key]);
  }
  return out;
}

/** All evidence values as one lowercased string — for search matching. */
export function evidenceText(e: BlockEvidence): string {
  return EVIDENCE_KEYS.flatMap((key) => e[key]).join(" ").toLowerCase();
}

export interface SegmentedBlock {
  startedAt: number;
  endedAt: number;
  appSummary: string;
  titleSummary: string;
  evidence: BlockEvidence;
}

export interface SegmentOptions {
  gapMs: number; // a pause this long always closes the block
  switchMs: number; // a context switch must persist this long to split
  minBlockMs: number; // shorter blocks get absorbed if possible
  absorbGapMs: number; // max distance to an adjacent block for absorption
  minKeepMs: number; // final blocks shorter than this are dropped as noise
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentOptions = {
  gapMs: 5 * 60 * 1000,
  switchMs: 2 * 60 * 1000,
  minBlockMs: 3 * 60 * 1000,
  absorbGapMs: 5 * 60 * 1000,
  minKeepMs: 60 * 1000,
};

/** Hostname without www., lowercased; null for unparseable/empty URLs. */
export function domainOf(url: string | null): string | null {
  if (!url) return null;
  let host = url.trim();
  if (!host) return null;
  const schemeIdx = host.indexOf("://");
  if (schemeIdx >= 0) host = host.slice(schemeIdx + 3);
  host = host.split("/")[0].split(":")[0].toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return host || null;
}

/**
 * Normalize a window title to a stable "document key": drop trailing app/
 * status segments ("UMBAUPLAN.md — vera — Code" → "umbauplan.md"), collapse
 * whitespace, lowercase. Returns null for empty titles.
 */
export function docKeyOf(title: string | null): string | null {
  if (!title) return null;
  const first = title.split(/\s+[—–|]\s+| - /)[0] ?? title;
  const key = first.replace(/\s+/g, " ").trim().toLowerCase();
  return key || null;
}

/** The context signature a block is built around. */
export function signatureOf(m: Moment): string {
  const context = domainOf(m.url) ?? docKeyOf(m.title) ?? "";
  return `${m.app.toLowerCase()}||${context}`;
}

// Small stopword list for OCR term extraction (UI noise + function words).
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "have", "has", "are",
  "was", "were", "will", "would", "your", "you", "not", "but", "all", "can",
  "file", "edit", "view", "window", "help", "close", "open", "new", "save",
  "search", "https", "http", "www", "com", "null", "undefined", "true",
  "false", "page", "back", "next", "more", "into", "about", "here", "when",
  "what", "which", "their", "there", "been", "than", "then", "them", "they",
]);

function tokenizeOcr(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zà-öø-ÿa-z0-9]+/i)
    .filter((w) => w.length >= 4 && w.length <= 30 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

interface Tally {
  apps: Map<string, number>; // weighted by ms
  titles: Map<string, number>; // weighted by ms
  domains: Map<string, number>; // weighted by ms
  terms: Map<string, number>; // by count
}

function newTally(): Tally {
  return { apps: new Map(), titles: new Map(), domains: new Map(), terms: new Map() };
}

function addMomentToTally(tally: Tally, m: Moment): void {
  const w = Math.max(1, m.durationMs);
  tally.apps.set(m.app, (tally.apps.get(m.app) ?? 0) + w);
  if (m.title && m.title.trim()) {
    const t = m.title.replace(/\s+/g, " ").trim();
    tally.titles.set(t, (tally.titles.get(t) ?? 0) + w);
  }
  const d = domainOf(m.url);
  if (d) tally.domains.set(d, (tally.domains.get(d) ?? 0) + w);
  if (m.ocr) {
    for (const term of tokenizeOcr(m.ocr)) {
      tally.terms.set(term, (tally.terms.get(term) ?? 0) + 1);
    }
  }
}

/** Fold tally b into a (in place) and return a. */
function mergeTallies(a: Tally, b: Tally): Tally {
  for (const k of EVIDENCE_KEYS) {
    for (const [key, v] of b[k]) a[k].set(key, (a[k].get(key) ?? 0) + v);
  }
  return a;
}

function top(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([k]) => k);
}

interface DraftBlock {
  startedAt: number;
  endedAt: number;
  signature: string;
  tally: Tally;
}

function draftToBlock(d: DraftBlock): SegmentedBlock {
  const apps = top(d.tally.apps, EVIDENCE_CAPS.apps);
  const titles = top(d.tally.titles, EVIDENCE_CAPS.titles);
  const domains = top(d.tally.domains, EVIDENCE_CAPS.domains);
  // The human-readable label: dominant title, else dominant domain, else app.
  const titleSummary = titles[0] ?? domains[0] ?? apps[0] ?? "";
  return {
    startedAt: d.startedAt,
    endedAt: d.endedAt,
    appSummary: apps.join(" · "),
    titleSummary,
    evidence: {
      apps,
      titles,
      domains,
      terms: top(d.tally.terms, EVIDENCE_CAPS.terms),
    },
  };
}

/**
 * Core pass: walk the moment stream (PRECONDITION: sorted by t — segmentDay's
 * sliceMoments guarantees this) and produce draft blocks. A differing
 * signature is held as "pending" and only splits the block once it has
 * persisted for switchMs; until then it is absorbed as evidence.
 */
function segmentMoments(moments: Moment[], opts: SegmentOptions): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let current: DraftBlock | null = null;
  let pending: DraftBlock | null = null;

  const closeCurrent = () => {
    if (current) blocks.push(current);
    current = null;
  };
  const promotePending = () => {
    // The pending context persisted long enough — it becomes its own block.
    if (!pending) return;
    closeCurrent();
    current = pending;
    pending = null;
  };
  const absorbPending = () => {
    // The peek was short — fold it into the current block as evidence.
    if (!pending || !current) {
      pending = null;
      return;
    }
    current.tally = mergeTallies(current.tally, pending.tally);
    current.endedAt = Math.max(current.endedAt, pending.endedAt);
    pending = null;
  };

  for (const m of moments) {
    const sig = signatureOf(m);
    const end = m.t + Math.max(1, m.durationMs);
    const lastEnd = pending?.endedAt ?? current?.endedAt ?? null;

    // A real pause always closes everything.
    if (lastEnd !== null && m.t - lastEnd >= opts.gapMs) {
      if (pending && pending.endedAt - pending.startedAt >= opts.switchMs) {
        promotePending();
      } else {
        absorbPending();
      }
      closeCurrent();
    }

    if (!current) {
      pending = null;
      current = { startedAt: m.t, endedAt: end, signature: sig, tally: newTally() };
      addMomentToTally(current.tally, m);
      continue;
    }

    if (sig === current.signature && !pending) {
      current.endedAt = Math.max(current.endedAt, end);
      addMomentToTally(current.tally, m);
      continue;
    }

    if (pending) {
      if (sig === pending.signature) {
        pending.endedAt = Math.max(pending.endedAt, end);
        addMomentToTally(pending.tally, m);
        if (pending.endedAt - pending.startedAt >= opts.switchMs) {
          promotePending();
        }
        continue;
      }
      if (sig === current.signature) {
        // Returned to the original context before the switch threshold.
        absorbPending();
        current.endedAt = Math.max(current.endedAt, end);
        addMomentToTally(current.tally, m);
        continue;
      }
      // A third context: the old peek gets absorbed, the new one is pending.
      absorbPending();
    }
    pending = { startedAt: m.t, endedAt: end, signature: sig, tally: newTally() };
    addMomentToTally(pending.tally, m);
    if (pending.endedAt - pending.startedAt >= opts.switchMs) {
      promotePending();
    }
  }

  if (pending && pending.endedAt - pending.startedAt >= opts.switchMs) {
    promotePending();
  } else {
    absorbPending();
  }
  closeCurrent();
  return blocks;
}

/** Absorb too-short blocks into a close-enough neighbour. */
function absorbFragments(blocks: DraftBlock[], opts: SegmentOptions): DraftBlock[] {
  const out: DraftBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const isShort = b.endedAt - b.startedAt < opts.minBlockMs;
    const prev = out[out.length - 1];
    if (isShort && prev && b.startedAt - prev.endedAt < opts.absorbGapMs) {
      prev.tally = mergeTallies(prev.tally, b.tally);
      prev.endedAt = Math.max(prev.endedAt, b.endedAt);
      continue;
    }
    const next = blocks[i + 1];
    if (isShort && next && next.startedAt - b.endedAt < opts.absorbGapMs) {
      next.tally = mergeTallies(next.tally, b.tally);
      next.startedAt = Math.min(next.startedAt, b.startedAt);
      continue;
    }
    out.push({ ...b });
  }
  return out;
}

// Long activity events are sliced into sub-minute moments so they interleave
// naturally with point-sample frames, and slices without a URL inherit the
// URL of the nearest same-app frame. This aligns the two streams on one
// signature (activity events carry no URL; frames do), so browser work is
// grouped by domain as the plan specifies — and a real domain change inside
// one long "Safari" event still splits the block.
const SLICE_MS = 60 * 1000;
const URL_ENRICH_TOLERANCE_MS = 90 * 1000;

function sliceMoments(moments: Moment[]): Moment[] {
  const out: Moment[] = [];
  for (const m of moments) {
    if (m.durationMs <= SLICE_MS) {
      out.push(m); // frames and short events pass through unchanged
      continue;
    }
    let t = m.t;
    let remaining = m.durationMs;
    while (remaining > 0) {
      const d = Math.min(remaining, SLICE_MS);
      out.push({ ...m, t, durationMs: d });
      t += d;
      remaining -= d;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function enrichUrls(moments: Moment[]): Moment[] {
  // Sorted URL carriers per app (frames from browsers).
  const carriers = new Map<string, { t: number; url: string }[]>();
  for (const m of moments) {
    if (!m.url) continue;
    const key = m.app.toLowerCase();
    if (!carriers.has(key)) carriers.set(key, []);
    carriers.get(key)!.push({ t: m.t, url: m.url });
  }
  if (carriers.size === 0) return moments;
  return moments.map((m) => {
    if (m.url) return m;
    const list = carriers.get(m.app.toLowerCase());
    if (!list) return m;
    // Binary search for the nearest carrier in time.
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t < m.t) lo = mid + 1;
      else hi = mid;
    }
    let best = list[lo];
    if (lo > 0 && Math.abs(list[lo - 1].t - m.t) < Math.abs(best.t - m.t)) {
      best = list[lo - 1];
    }
    if (Math.abs(best.t - m.t) <= URL_ENRICH_TOLERANCE_MS) {
      return { ...m, url: best.url };
    }
    return m;
  });
}

/**
 * Public entry: segment one day's moments into blocks, clamped to
 * [dayStartMs, dayEndMs). Deterministic and side-effect free.
 */
export function segmentDay(
  moments: Moment[],
  dayStartMs: number,
  dayEndMs: number,
  options?: Partial<SegmentOptions>
): SegmentedBlock[] {
  const opts = { ...DEFAULT_SEGMENT_OPTIONS, ...options };
  const clamped: Moment[] = [];
  for (const m of moments) {
    const end = m.t + Math.max(1, m.durationMs);
    if (end <= dayStartMs || m.t >= dayEndMs) continue;
    const start = Math.max(m.t, dayStartMs);
    clamped.push({ ...m, t: start, durationMs: Math.min(end, dayEndMs) - start });
  }
  const prepared = enrichUrls(sliceMoments(clamped));
  const drafts = absorbFragments(segmentMoments(prepared, opts), opts);
  return drafts
    .filter((d) => d.endedAt - d.startedAt >= opts.minKeepMs)
    .map(draftToBlock);
}

export interface Interval {
  startedAt: number;
  endedAt: number;
}

/**
 * Subtract preserved (user-edited/confirmed) block intervals from freshly
 * computed blocks, so a recompute never double-counts time the user already
 * owns. A computed block overlapping a preserved one is trimmed or split;
 * remainders shorter than minKeepMs are dropped.
 */
export function subtractPreserved(
  blocks: SegmentedBlock[],
  preserved: Interval[],
  minKeepMs: number = DEFAULT_SEGMENT_OPTIONS.minKeepMs
): SegmentedBlock[] {
  if (preserved.length === 0) return blocks;
  const sorted = [...preserved].sort((a, b) => a.startedAt - b.startedAt);
  const out: SegmentedBlock[] = [];
  for (const block of blocks) {
    let pieces: Interval[] = [{ startedAt: block.startedAt, endedAt: block.endedAt }];
    for (const p of sorted) {
      const next: Interval[] = [];
      for (const piece of pieces) {
        if (p.endedAt <= piece.startedAt || p.startedAt >= piece.endedAt) {
          next.push(piece); // no overlap
          continue;
        }
        if (p.startedAt > piece.startedAt) {
          next.push({ startedAt: piece.startedAt, endedAt: p.startedAt });
        }
        if (p.endedAt < piece.endedAt) {
          next.push({ startedAt: p.endedAt, endedAt: piece.endedAt });
        }
      }
      pieces = next;
    }
    for (const piece of pieces) {
      if (piece.endedAt - piece.startedAt >= minKeepMs) {
        out.push({ ...block, startedAt: piece.startedAt, endedAt: piece.endedAt });
      }
    }
  }
  return out;
}

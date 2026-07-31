/* ===========================================================================
   The reader, ported.
   ---------------------------------------------------------------------------
   This file is the browser's copy of two things the Rust engine does:

     1. how a credential comes back out of a video once the glyphs run short of
        pixels — the damage model, and
     2. whether the engine still recognises what came back — a faithful port of
        `ocr.rs`, `entropy.rs` and the pattern gate in `detect.rs`.

   It exists so the demonstration on the site computes its answer instead of
   playing one back. A canned animation would be a claim; this is the rule.

   Because a second copy of a rule is a rule that can drift, the port is pinned:
   `scripts/reader-corpus.mjs` enumerates every damaged string the demonstration
   can produce, `src-tauri/core/examples/reader_oracle.rs` runs the real engine
   over that list, and `scripts/check-reader.mjs` asserts the two agree on all
   of them. See website/README.md.

   Scope, stated honestly: this ports the *pattern* path for one pattern, the
   OpenAI project key. It does not port the assignment, PEM or connection-string
   detectors, nor the negative filters — none of which can fire on the single
   token the demonstration evaluates. The check above is run over exactly the
   inputs the demonstration can reach, and no further claim is made.
   =========================================================================== */

/* --- ocr.rs ---------------------------------------------------------------- */

const UNICODE_FOLD: Record<string, string> = {
  // Hyphen variants (en/em dash, minus, non-breaking hyphen, figure dash, bar)
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
  "―": "-", "−": "-", "﹘": "-", "﹣": "-", "－": "-",
  // Underscore variants
  "＿": "_", "﹍": "_", "﹎": "_", "﹏": "_",
  // Quotation marks
  "‘": "'", "’": "'", "‛": "'", "′": "'", "＇": "'",
  "“": '"', "”": '"', "‟": '"', "″": '"', "＂": '"',
  // Full-width colon / equals / period
  "：": ":", "＝": "=", "．": ".",
  // Assorted spaces
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  " ": " ", " ": " ", "　": " ",
};

const ZERO_WIDTH = new Set(["​", "‌", "‍", "﻿", "­"]);

/** Folds the Unicode a renderer or a reader substitutes for ASCII. */
export function normalizeUnicode(s: string): string {
  let out = "";
  for (const c of s) {
    if (ZERO_WIDTH.has(c)) continue;
    out += UNICODE_FOLD[c] ?? c;
  }
  return out;
}

/**
 * A character's confusion class — glyph collisions that actually happen in
 * monospace faces. The table is `ocr.rs::confusion_class`, character for
 * character; changing one here without changing it there is a bug in both.
 */
export function confusionClass(c: string): string {
  if ("0OoQD".includes(c)) return "0";
  if ("1lIi|!jL".includes(c)) return "1";
  if ("5Ss$".includes(c)) return "5";
  if ("8B".includes(c)) return "8";
  if ("2Zz".includes(c)) return "2";
  if ("6Gb".includes(c)) return "6";
  if ("9gq".includes(c)) return "9";
  if ("7Tt".includes(c)) return "7";
  if ("UuVv".includes(c)) return "u";
  if ("Cc(".includes(c)) return "c";
  return c >= "A" && c <= "Z" ? c.toLowerCase() : c;
}

/** Confusion space, with the multi-character collisions resolved first. */
export function normalizeConfusable(s: string): string {
  const pre = s
    .split("rn").join("m")
    .split("RN").join("m")
    .split("vv").join("w")
    .split("VV").join("w")
    .split("cl").join("d");
  let out = "";
  for (const c of pre) out += confusionClass(c);
  return out;
}

/** Levenshtein distance, bounded. Returns null past the bound. */
export function levenshteinWithin(a: string, b: string, max: number): number | null {
  const A = [...a];
  const B = [...b];
  if (Math.abs(A.length - B.length) > max) return null;
  if (A.length === 0) return B.length <= max ? B.length : null;
  if (B.length === 0) return A.length <= max ? A.length : null;

  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  let cur = new Array<number>(B.length + 1).fill(0);

  for (let i = 1; i <= A.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return null;
    [prev, cur] = [cur, prev];
  }
  const d = prev[B.length];
  return d <= max ? d : null;
}

/**
 * Does `text` begin with `prefix`, allowing for a misread?
 * Returns how many characters the prefix consumed, so the body can be sliced
 * off exactly — an insertion or deletion inside the prefix moves that boundary,
 * which is why the window is varied by ±maxDist and the best fit wins.
 */
export function fuzzyPrefixMatch(text: string, prefix: string, maxDist: number): number | null {
  const first = [...text][0];
  const firstPrefix = [...prefix][0];
  if (first === undefined || firstPrefix === undefined) return null;
  // The anchor is security-critical: without it `pk_live_` (publishable, and
  // harmless) matches `sk_live_` (secret) at a distance of one.
  if (confusionClass(first) !== confusionClass(firstPrefix)) return null;

  const normPrefix = normalizeConfusable(prefix);
  const plen = [...prefix].length;
  const tlen = [...text].length;
  const lo = Math.max(Math.max(plen - maxDist, 0), 1);
  const hi = Math.min(plen + maxDist, tlen);
  if (lo > hi) return null;

  let best: { d: number; take: number } | null = null;
  for (let take = lo; take <= hi; take++) {
    const head = [...text].slice(0, take).join("");
    const d = levenshteinWithin(normalizeConfusable(head), normPrefix, maxDist);
    if (d === null) continue;
    const better =
      best === null ||
      d < best.d ||
      (d === best.d && Math.abs(take - plen) < Math.abs(best.take - plen));
    if (better) best = { d, take };
  }
  return best ? best.take : null;
}

/* --- entropy.rs ------------------------------------------------------------ */

export function shannon(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  let len = 0;
  for (const c of s) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
    len++;
  }
  let h = 0;
  for (const n of counts.values()) {
    const p = n / len;
    h += p * Math.log2(p);
  }
  return -h;
}

const SPECIAL = new Set(["-", "_", "+", "/", "=", "."]);

interface Composition {
  lower: number;
  upper: number;
  digit: number;
  special: number;
  len: number;
}

function composition(s: string): Composition {
  const c: Composition = { lower: 0, upper: 0, digit: 0, special: 0, len: 0 };
  for (const ch of s) {
    c.len++;
    if (ch >= "a" && ch <= "z") c.lower++;
    else if (ch >= "A" && ch <= "Z") c.upper++;
    else if (ch >= "0" && ch <= "9") c.digit++;
    else if (SPECIAL.has(ch)) c.special++;
  }
  return c;
}

const classesPresent = (c: Composition) =>
  [c.lower, c.upper, c.digit, c.special].filter((n) => n > 0).length;

const isWordlike = (c: Composition) =>
  c.len > 0 && c.digit === 0 && c.special === 0 && c.upper <= 1;

export function longestSameCharRun(s: string): number {
  let best = 0;
  let cur = 0;
  let last: string | null = null;
  for (const c of s) {
    cur = c === last ? cur + 1 : 1;
    last = c;
    best = Math.max(best, cur);
  }
  return best;
}

export function distinctRatio(s: string): number {
  const chars = [...s];
  if (chars.length === 0) return 0;
  return new Set(chars).size / chars.length;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Randomness in [0,1]. Every signal in here survives a single misread
 * character, which is the whole reason the body is judged by shape rather than
 * matched.
 */
export function randomnessScore(s: string): number {
  const comp = composition(s);
  if (comp.len < 8) return 0;

  const ent = shannon(s);
  const maxPossible = Math.min(Math.log2(comp.len), 6);
  const entNorm = maxPossible > 0 ? clamp(ent / maxPossible, 0, 1) : 0;

  const present = classesPresent(comp);
  const classScore = present <= 1 ? 0 : present === 2 ? 0.45 : present === 3 ? 0.85 : 1;

  const distinctScore = clamp(distinctRatio(s) / 0.6, 0, 1);

  const run = longestSameCharRun(s);
  const runPenalty = run >= 5 ? 0.3 : run >= 4 ? 0.7 : 1;
  const wordPenalty = isWordlike(comp) ? 0.35 : 1;

  return (0.45 * entNorm + 0.35 * classScore + 0.2 * distinctScore) * runPenalty * wordPenalty;
}

/* --- patterns.rs + detect.rs ----------------------------------------------- */

/** Base64Url: A-Za-z0-9 plus `-` and `_`. */
function base64UrlRatio(s: string): number {
  const chars = [...s];
  if (chars.length === 0) return 0;
  const ok = chars.filter(
    (c) => /[A-Za-z0-9]/.test(c) || c === "-" || c === "_"
  ).length;
  return ok / chars.length;
}

/** The `openai_project` entry of `PATTERNS`, verbatim. */
export const OPENAI_PROJECT = {
  label: "OpenAI Project Key",
  prefix: "sk-proj-",
  bodyMin: 20,
  bodyMax: 200,
  severity: "Critical",
  prefixTolerance: 2,
  minRandomness: 0.42,
} as const;

export type Verdict =
  | { found: true; label: string; confidence: number; prefixLen: number }
  | { found: false; reason: "nothing legible" | "prefix" | "length" | "charset" | "randomness" };

/**
 * The pattern gate, as `detect.rs::match_pattern` runs it.
 *
 * `reason` is not in the Rust — there, a failed gate is just a `continue`. It is
 * added here because the demonstration has to be able to say *why* a key stopped
 * being found, and saying "it did not match" would teach nobody anything.
 */
export function veraVerdict(token: string): Verdict {
  const text = normalizeUnicode(token);
  if (text.length === 0) return { found: false, reason: "nothing legible" };

  const consumed = fuzzyPrefixMatch(text, OPENAI_PROJECT.prefix, OPENAI_PROJECT.prefixTolerance);
  if (consumed === null) return { found: false, reason: "prefix" };

  const body = [...text].slice(consumed).join("");
  const bodyLen = [...body].length;
  if (bodyLen < OPENAI_PROJECT.bodyMin || bodyLen > OPENAI_PROJECT.bodyMax) {
    return { found: false, reason: "length" };
  }

  const csRatio = base64UrlRatio(body);
  if (csRatio < 0.85) return { found: false, reason: "charset" };

  const rand = randomnessScore(body);
  if (rand < OPENAI_PROJECT.minRandomness) return { found: false, reason: "randomness" };

  const prefixScore = text.startsWith(OPENAI_PROJECT.prefix) ? 1 : 0.75;
  const confidence = clamp(0.45 * prefixScore + 0.3 * csRatio + 0.25 * rand, 0, 1);

  return { found: true, label: OPENAI_PROJECT.label, confidence, prefixLen: consumed };
}

/**
 * What a scanner built on an exact pattern sees. This is the comparison the
 * whole section is about, so it is the real expression: the published regex for
 * an OpenAI project key, applied to the text as it came back.
 */
export function exactVerdict(token: string): boolean {
  return /^sk-proj-[A-Za-z0-9_-]{20,}$/.test(token);
}

/* --- The damage model ------------------------------------------------------ */

/**
 * Which glyphs go first.
 *
 * Not a random sprinkle: a character is fragile in proportion to how many other
 * glyphs share its confusion class, because that class *is* the list of things
 * a reader confuses it with. `o` sits in a class of five and goes early; `k`
 * has no twin and survives to the end.
 */
const CLASS_MEMBERS: Record<string, string> = {
  "0": "0OoQD",
  "1": "1lIijL",
  "5": "5Ss",
  "8": "8B",
  "2": "2Zz",
  "6": "6Gb",
  "9": "9gq",
  "7": "7Tt",
  u: "UuVv",
  c: "Cc",
};

/**
 * What the reader returns instead. Curated rather than derived: `o`→`0` is what
 * happens, `o`→`Q` is not, even though both share a class.
 */
const SUBSTITUTION: Record<string, string> = {
  o: "0", O: "0", "0": "O", Q: "O", D: "0",
  l: "1", I: "1", i: "l", "1": "l", j: "i", L: "I",
  s: "5", S: "5", "5": "S",
  B: "8", "8": "B",
  Z: "2", z: "2", "2": "Z",
  G: "6", b: "6", "6": "G",
  g: "9", q: "9", "9": "g",
  T: "7", t: "7", "7": "T",
  U: "V", u: "v", V: "U", v: "u",
  C: "c", c: "C",
};

/**
 * Substitutions that only appear once the glyphs are genuinely small, and that
 * cost the body its character set rather than just its shape. These are what
 * turns a survivable misreading into a lost one.
 */
const DEEP_SUBSTITUTION: Record<string, string> = {
  l: "|", i: "!", s: "$", S: "$", "1": "|",
};

/** A stable scatter, so damage does not crawl across the string left to right. */
function scatter(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export interface ReadResult {
  /** What the reader returned. Empty when nothing was legible. */
  text: string;
  /** Per character of `text`: was this one misread? */
  damaged: boolean[];
  /** How many characters the reader dropped entirely. */
  dropped: number;
  /** 0 = perfect, 1 = the edge of legibility. */
  severity: number;
}

/** Above this many pixels per glyph, a reader makes no mistakes worth having. */
export const CLEAN_PX = 13;
/** Below this, nothing comes back at all. */
export const BLIND_PX = 4.5;

/**
 * Read `source` back out of a frame whose glyphs are `px` pixels tall.
 *
 * Deterministic: the same pixel height always returns the same string. That
 * matters more than realism here — a demonstration that reshuffles its own
 * answer while you hold the control still is one nobody can learn from.
 */
export function readBack(source: string, px: number): ReadResult {
  const chars = [...source];
  if (px <= BLIND_PX) {
    return { text: "", damaged: [], dropped: chars.length, severity: 1 };
  }
  const severity = clamp((CLEAN_PX - px) / (CLEAN_PX - BLIND_PX), 0, 1);
  if (severity <= 0) {
    return { text: source, damaged: chars.map(() => false), dropped: 0, severity: 0 };
  }

  // Rank the positions a reader would lose first.
  const fragile = chars
    .map((c, i) => ({
      i,
      size: (CLASS_MEMBERS[confusionClass(c)] ?? "").length,
      jitter: scatter(i),
    }))
    .filter((p) => p.size >= 2)
    .sort((a, b) => b.size - a.size || a.jitter - b.jitter);

  const nSub = Math.round(severity * fragile.length);
  const hit = new Set(fragile.slice(0, nSub).map((p) => p.i));
  // The deepest damage costs the body its character set, not just its shape.
  const deepFrom = 0.72;
  const deep =
    severity > deepFrom
      ? new Set(
          fragile
            .slice(0, Math.round(((severity - deepFrom) / (1 - deepFrom)) * fragile.length))
            .map((p) => p.i)
        )
      : new Set<number>();

  // Below roughly nine pixels a reader stops substituting and starts losing
  // characters outright — two glyphs merge into one. That is what eventually
  // takes the body under its minimum length, and it is the honest failure.
  const dropFrom = 0.6;
  const nDrop =
    severity > dropFrom ? Math.round(((severity - dropFrom) / (1 - dropFrom)) * 9) : 0;
  const dropCandidates = chars
    .map((_, i) => ({ i, jitter: scatter(i + 1000) }))
    .sort((a, b) => a.jitter - b.jitter)
    .slice(0, nDrop);
  const dropped = new Set(dropCandidates.map((p) => p.i));

  let text = "";
  const damaged: boolean[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (dropped.has(i)) continue;
    const c = chars[i];
    let out = c;
    if (hit.has(i)) {
      out = (deep.has(i) ? DEEP_SUBSTITUTION[c] : undefined) ?? SUBSTITUTION[c] ?? c;
    }
    text += out;
    damaged.push(out !== c);
  }

  // A renderer's en dash is its own kind of misreading, and one the engine folds
  // back before it looks at anything. Worth showing precisely because it is
  // survivable.
  if (severity > 0.3 && text.includes("-")) {
    const at = text.indexOf("-");
    text = text.slice(0, at) + "–" + text.slice(at + 1);
    damaged[at] = true;
  }

  return { text, damaged, dropped: dropped.size, severity };
}

/**
 * How many pixels tall a glyph is, given how far the frame has been turned and
 * how small it has been scaled.
 *
 * `cos(yaw) · cos(pitch)` is the projected-area factor: turning a plane away
 * from the camera costs it pixels in exactly that proportion, which is why a
 * key that is perfectly readable head-on stops being readable on a slide filmed
 * from the third row.
 */
export function glyphPixels(baseline: number, yawDeg: number, pitchDeg: number, zoom: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  return baseline * zoom * Math.cos(rad(yawDeg)) * Math.cos(rad(pitchDeg));
}

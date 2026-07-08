// Pure billing-narrative logic (Schicht 4): rounding, draft grouping, prompt
// building, reply parsing, the result redaction filter, and the deterministic
// no-LLM fallback. No Tauri/DB imports — replica-tested via
// npm run test:narratives.

import { BlockEvidence, mergeEvidence, parseEvidenceJson } from "./segmentation";

export type RoundingMode = "nearest" | "up" | "down";
export type EntryLanguage = "en" | "de";
export type EntryTone = "concise" | "detailed";
export type EntryTemplate = "agency" | "consulting" | "law";

// ---------- Rounding ----------

/**
 * Round real minutes to the billing increment (0 = exact). Never rounds a
 * non-zero duration to zero: real work must stay billable, so "down"/"nearest"
 * results are floored at one increment.
 */
export function roundMinutes(minutes: number, increment: number, mode: RoundingMode): number {
  if (increment <= 0) return minutes;
  if (minutes <= 0) return 0;
  const units = minutes / increment;
  let rounded: number;
  switch (mode) {
    case "up":
      rounded = Math.ceil(units);
      break;
    case "down":
      rounded = Math.floor(units);
      break;
    default:
      rounded = Math.round(units);
  }
  return Math.max(1, rounded) * increment;
}

// ---------- Draft grouping ----------

export interface BlockLike {
  id: number;
  started_at: number;
  ended_at: number;
  project_id: number | null;
  status: string;
  evidence: string | null;
}

export interface EntryDraftInput {
  project_id: number;
  minutes: number;
  block_ids: number[];
  evidence: BlockEvidence;
}

/**
 * Group a day's CONFIRMED, PROJECT-ASSIGNED blocks into one draft per
 * project: minutes summed, evidence merged. Unconfirmed or unassigned blocks
 * never become billing entries.
 */
export function groupBlocksIntoDrafts(blocks: BlockLike[]): EntryDraftInput[] {
  const byProject = new Map<number, { minutes: number; block_ids: number[]; evidences: BlockEvidence[] }>();
  for (const b of blocks) {
    if (b.status !== "confirmed" || b.project_id === null) continue;
    const minutes = Math.round((b.ended_at - b.started_at) / 60000);
    if (minutes <= 0) continue;
    const entry = byProject.get(b.project_id) ?? { minutes: 0, block_ids: [], evidences: [] };
    entry.minutes += minutes;
    entry.block_ids.push(b.id);
    entry.evidences.push(parseEvidenceJson(b.evidence));
    byProject.set(b.project_id, entry);
  }
  return [...byProject.entries()]
    .map(([project_id, e]) => ({
      project_id,
      minutes: e.minutes,
      block_ids: e.block_ids,
      evidence: mergeEvidence(e.evidences),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Local 'YYYY-MM-DD' for a day's local-midnight timestamp. */
export function entryDateOf(dayStartMs: number): string {
  const d = new Date(dayStartMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ---------- Result redaction ----------

function isLuhnValid(s: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c < "0" || c > "9") return false;
    let d = c.charCodeAt(0) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Defense in depth over the GENERATED text (mirrors the Rust capture-side
 * filter): even if sensitive strings survived into evidence, they never
 * reach a billing narrative. Credit cards (Luhn-checked), IBANs, long digit
 * runs, and API-key shapes become [redacted].
 */
export function redactNarrative(text: string): string {
  let out = text;
  out = out.replace(/\b(?:\d[ -]?){13,16}\b/g, (m) => {
    const clean = m.replace(/[^0-9]/g, "");
    return isLuhnValid(clean) ? "[redacted]" : m;
  });
  out = out.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, "[redacted]");
  out = out.replace(/\b\d{10,}\b/g, "[redacted]");
  for (const p of [
    /sk-(proj-)?[a-zA-Z0-9]{48,}/g,
    /rk_live_[a-zA-Z0-9]{24}/g,
    /sk_live_[a-zA-Z0-9]{24}/g,
    /ghp_[a-zA-Z0-9]{36,}/g,
    /AKIA[0-9A-Z]{16}/g,
  ]) {
    out = out.replace(p, "[redacted]");
  }
  return out;
}

// ---------- Prompt + parse ----------

const TEMPLATE_STYLE: Record<EntryTemplate, string> = {
  agency:
    "Agency style: deliverable-focused, names the design/dev artifacts worked on.",
  consulting:
    "Consulting style: outcome-focused, names analyses, documents, and client communication.",
  law:
    "Law-firm style: formal activity description (review of, correspondence regarding, preparation of), no colloquialisms.",
};

function evidenceLines(e: BlockEvidence): string {
  const lines: string[] = [];
  if (e.titles.length) lines.push(`windows/documents: ${e.titles.join(" | ")}`);
  if (e.domains.length) lines.push(`domains: ${e.domains.join(", ")}`);
  if (e.apps.length) lines.push(`apps: ${e.apps.join(", ")}`);
  if (e.terms.length) lines.push(`seen on screen: ${e.terms.join(", ")}`);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "- (no evidence)";
}

export function buildNarrativeMessages(
  projectLabel: string,
  draft: EntryDraftInput,
  opts: { language: EntryLanguage; tone: EntryTone; template: EntryTemplate },
  styleExamples: string[]
): { role: string; content: string }[] {
  const language = opts.language === "de" ? "German" : "English";
  const tone =
    opts.tone === "detailed"
      ? "2-3 sentences with concrete specifics"
      : "1-2 tight sentences";
  const style = styleExamples.length
    ? `\n\nThe user rewrote earlier narratives like this — match their voice:\n${styleExamples.map((s) => `- "${s}"`).join("\n")}`
    : "";
  return [
    {
      role: "system",
      content:
        "You write the billing narrative for one time entry, based on captured work evidence. " +
        'Respond with ONLY a JSON object: {"narrative": "<text>"}. ' +
        `Write in ${language}, past tense, ${tone}. ${TEMPLATE_STYLE[opts.template]} ` +
        "Describe the work, never the tools' UI chrome. Never include numbers that look like accounts, cards, or credentials. Do not mention minutes or prices.",
    },
    {
      role: "user",
      content: `PROJECT: ${projectLabel}\nTIME WORKED: ${draft.minutes} minutes\nEVIDENCE:\n${evidenceLines(draft.evidence)}${style}`,
    },
  ];
}

/** Strict, defensive parsing of the model's JSON reply. */
export function parseNarrativeReply(raw: string): string | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    const parsed = JSON.parse(text);
    const narrative = parsed?.narrative;
    if (typeof narrative !== "string") return null;
    const cleaned = narrative.replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    return cleaned.slice(0, 600);
  } catch {
    return null;
  }
}

// ---------- Deterministic fallback (no LLM available) ----------

/**
 * A plain, honest narrative built directly from evidence — used when Ollama
 * is offline so the daily close never blocks on the model.
 */
export function fallbackNarrative(draft: EntryDraftInput, language: EntryLanguage): string {
  const subjects = [...draft.evidence.titles, ...draft.evidence.domains].slice(0, 3);
  const apps = draft.evidence.apps.slice(0, 2).join(", ");
  if (language === "de") {
    const what = subjects.length ? subjects.join(", ") : apps || "erfasste Tätigkeiten";
    return redactNarrative(`Arbeit an ${what}${apps && subjects.length ? ` (${apps})` : ""}.`);
  }
  const what = subjects.length ? subjects.join(", ") : apps || "captured activities";
  return redactNarrative(`Worked on ${what}${apps && subjects.length ? ` (${apps})` : ""}.`);
}

/** Resolve the effective rounding increment: project override, else global. */
export function effectiveIncrement(projectOverride: number | null, globalIncrement: number): number {
  return projectOverride === null || projectOverride === undefined ? globalIncrement : projectOverride;
}

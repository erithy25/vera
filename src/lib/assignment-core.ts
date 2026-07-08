// Pure assignment logic (Schicht 3): rule matching, few-shot selection,
// prompt building, reply parsing, and rule suggestions. No Tauri/DB imports —
// this module is exercised by a standalone Node replica test
// (npm run test:assignment).

import { BlockEvidence, parseEvidenceJson } from "./segmentation";

export type RuleMatcherType = "domain" | "app" | "title_keyword" | "path";

export const LLM_CONFIDENCE_THRESHOLD = 0.6;
const FEW_SHOT_LIMIT = 10;
export const SUGGESTION_MIN_CORRECTIONS = 3;

// ---------- Rules ----------

/** Does a rule match a block's evidence? Case-insensitive, value-based. */
export function ruleMatches(
  rule: { matcher_type: RuleMatcherType; pattern: string },
  evidence: BlockEvidence
): boolean {
  const pattern = rule.pattern.trim().toLowerCase();
  if (!pattern) return false;
  switch (rule.matcher_type) {
    case "domain":
      return evidence.domains.some(
        (d) => d.toLowerCase() === pattern || d.toLowerCase().endsWith(`.${pattern}`)
      );
    case "app":
      return evidence.apps.some((a) => a.toLowerCase() === pattern);
    case "title_keyword":
    case "path":
      // Both match inside window titles today (path fragments appear there,
      // via editors and terminals); "path" stays a distinct type so a real
      // evidence.paths field can specialize it later.
      return evidence.titles.some((t) => t.toLowerCase().includes(pattern));
    default:
      return false;
  }
}

/**
 * First matching rule wins (rules are listed newest-first). Rules pointing at
 * an archived/invalid project are skipped, so an older still-valid rule for
 * the same pattern can take over.
 */
export function chooseRule(
  rules: Array<{ matcher_type: RuleMatcherType; pattern: string; project_id: number }>,
  evidence: BlockEvidence,
  validProjectIds?: Set<number>
): { project_id: number } | null {
  for (const rule of rules) {
    if (validProjectIds && !validProjectIds.has(rule.project_id)) continue;
    if (ruleMatches(rule, evidence)) return { project_id: rule.project_id };
  }
  return null;
}

// ---------- LLM classification (prompt + parse) ----------

export interface ClassifyResult {
  project_id: number | null;
  confidence: number;
  reason: string;
}

function evidenceLines(e: BlockEvidence): string {
  const lines: string[] = [];
  if (e.apps.length) lines.push(`apps: ${e.apps.join(", ")}`);
  if (e.titles.length) lines.push(`windows/documents: ${e.titles.join(" | ")}`);
  if (e.domains.length) lines.push(`domains: ${e.domains.join(", ")}`);
  if (e.terms.length) lines.push(`seen on screen: ${e.terms.join(", ")}`);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "- (no evidence)";
}

/**
 * Few-shot selection: only corrections that actually share a domain or app
 * with the block (zero-similarity examples would just teach the model a
 * majority-label bias), most similar first, then most recent.
 */
export function selectFewShot(
  feedback: Array<{ block_evidence: string; correct_project_id: number }>,
  evidence: BlockEvidence,
  limit = FEW_SHOT_LIMIT
): Array<{ evidence: BlockEvidence; project_id: number }> {
  const scored = feedback.map((f, idx) => {
    const e = parseEvidenceJson(f.block_evidence);
    let score = 0;
    for (const d of e.domains) if (evidence.domains.includes(d)) score += 2;
    for (const a of e.apps) if (evidence.apps.includes(a)) score += 1;
    return { e, project_id: f.correct_project_id, score, idx };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx) // similar first, then recent
    .slice(0, limit)
    .map(({ e, project_id }) => ({ evidence: e, project_id }));
}

export function buildClassifyMessages(
  projects: Array<{ id: number; client_name: string; name: string }>,
  fewShot: Array<{ evidence: BlockEvidence; project_id: number }>,
  blockEvidence: BlockEvidence,
  durationMinutes: number
): { role: string; content: string }[] {
  const projectList = projects
    .map((p) => `- id ${p.id}: ${p.client_name} — ${p.name}`)
    .join("\n");
  const examples = fewShot.length
    ? fewShot
        .map((f) => `${evidenceLines(f.evidence)}\n  → project_id ${f.project_id}`)
        .join("\n")
    : "(none yet)";
  return [
    {
      role: "system",
      content:
        "You assign a work block to one of the user's projects based on its evidence. " +
        'Respond with ONLY a JSON object: {"project_id": <number or null>, "confidence": <number 0..1>, "reason": "<short>"}. ' +
        "Use project_id null with low confidence when no listed project clearly fits. Never invent project ids.",
    },
    {
      role: "user",
      content: `PROJECTS:\n${projectList}\n\nUSER-VERIFIED PAST ASSIGNMENTS:\n${examples}\n\nBLOCK (${durationMinutes} min):\n${evidenceLines(blockEvidence)}`,
    },
  ];
}

/** Strict, defensive parsing of the model's JSON reply. */
export function parseClassifyReply(
  raw: string,
  validProjectIds: Set<number>
): ClassifyResult | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    const parsed = JSON.parse(text);
    const idRaw = parsed.project_id;
    const asNumber =
      typeof idRaw === "number" ? idRaw : Number.isInteger(Number(idRaw)) ? Number(idRaw) : NaN;
    const project_id =
      idRaw === null || idRaw === undefined
        ? null
        : !isNaN(asNumber) && validProjectIds.has(asNumber)
          ? asNumber
          : null;
    const confRaw = Number(parsed.confidence);
    const confidence = isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "";
    return { project_id, confidence, reason };
  } catch {
    return null;
  }
}

// ---------- Rule suggestions ----------

export interface RuleSuggestion {
  matcher_type: RuleMatcherType;
  pattern: string;
  project_id: number;
}

/**
 * After a manual correction: if the recent corrections show the same dominant
 * domain (or app, when there is no domain) mapped to the same project at
 * least SUGGESTION_MIN_CORRECTIONS times, and no rule covers it yet, suggest
 * a one-click rule.
 */
export function suggestRule(
  feedback: Array<{ block_evidence: string; correct_project_id: number }>,
  rules: Array<{ matcher_type: RuleMatcherType; pattern: string }>,
  justCorrected: { evidence: BlockEvidence; project_id: number }
): RuleSuggestion | null {
  const dominantDomain = justCorrected.evidence.domains[0] ?? null;
  const dominantApp = justCorrected.evidence.apps[0] ?? null;
  const matcher_type: RuleMatcherType | null = dominantDomain ? "domain" : dominantApp ? "app" : null;
  const pattern = (dominantDomain ?? dominantApp ?? "").toLowerCase();
  if (!matcher_type || !pattern) return null;

  if (rules.some((r) => r.matcher_type === matcher_type && r.pattern.toLowerCase() === pattern)) {
    return null; // already covered
  }

  let count = 0;
  for (const f of feedback) {
    if (f.correct_project_id !== justCorrected.project_id) continue;
    const e = parseEvidenceJson(f.block_evidence);
    const key = matcher_type === "domain" ? e.domains[0] ?? "" : e.apps[0] ?? "";
    if (key.toLowerCase() === pattern) count++;
  }
  if (count < SUGGESTION_MIN_CORRECTIONS) return null;
  return { matcher_type, pattern, project_id: justCorrected.project_id };
}

import {
  blocksRepo,
  feedbackRepo,
  rulesRepo,
  projectsRepo,
  isActiveProject,
  DbAssignmentFeedback,
  DbWorkBlock,
} from "./db";
import { generateJson, prepareEngine, EngineUnavailableError } from "./engine";
import { parseEvidenceJson } from "./segmentation";
import {
  buildClassifyMessages,
  chooseRule,
  parseClassifyReply,
  selectFewShot,
  LLM_CONFIDENCE_THRESHOLD,
} from "./assignment-core";

// The assignment engine (Schicht 3): after every segmentation run it walks
// the day's open, engine-owned blocks in a fixed order —
//   1. user-edited blocks are never touched (they are not engine-owned),
//   2. deterministic rules assign with confidence 1.0 (they also override an
//      earlier LLM assignment: a rule is the user's explicit instruction),
//   3. the local LLM classifies whatever is still unattempted; verdicts below
//      the confidence threshold stay unassigned — honest beats wrong — and
//      the attempt is remembered so the identical block is not re-sent every
//      run (reconciliation clears the marker when evidence changes).
//
// Assignment runs on its OWN serialized queue, decoupled from the (fast)
// segmentation queue: a minutes-long LLM pass never delays a recompute or a
// manual refresh. Runs are coalesced per day; capped passes loop until the
// day is fully attempted.

const MAX_LLM_CALLS_PER_PASS = 25;
const MAX_PASSES_PER_RUN = 20; // safety backstop (500 blocks/day)
const FEEDBACK_POOL = 50;

// Status of the last run, surfaced by DayView ("AI offline" hint).
let lastEngineUnavailable: string | null = null;
export function assignmentEngineUnavailableReason(): string | null {
  return lastEngineUnavailable;
}

// Own queue + per-day coalescing.
let queue: Promise<void> = Promise.resolve();
const pendingDays = new Set<number>();

/**
 * Queue an assignment run for one day. Coalesced: if a run for this day is
 * already waiting, the existing completion promise is returned.
 */
export function queueAssignment(dayStartMs: number, dayEndMs: number): Promise<void> {
  if (pendingDays.has(dayStartMs)) return queue;
  pendingDays.add(dayStartMs);
  const next = queue.then(async () => {
    pendingDays.delete(dayStartMs); // a re-queue during the run is allowed
    for (let pass = 0; pass < MAX_PASSES_PER_RUN; pass++) {
      const outcome = await assignPass(dayStartMs, dayEndMs);
      if (outcome !== "leftover") break;
    }
    window.dispatchEvent(new CustomEvent("blocks-updated"));
  });
  queue = next.catch((err) => {
    console.error("[Vera Assign] run failed:", err);
  });
  return next;
}

type PassOutcome = "done" | "leftover" | "unavailable";

async function assignPass(dayStartMs: number, dayEndMs: number): Promise<PassOutcome> {
  const [blocks, rules, projects] = await Promise.all([
    blocksRepo.engineOwnedForDay(dayStartMs, dayEndMs),
    rulesRepo.list(),
    projectsRepo.listWithClients(true),
  ]);
  const projectPool = projects.filter(isActiveProject);
  if (blocks.length === 0 || projectPool.length === 0) {
    // Nothing assignable — any old "engine offline" hint is moot now.
    lastEngineUnavailable = null;
    return "done";
  }
  const validIds = new Set(projectPool.map((p) => p.id));

  // 1) Deterministic rules, batched per project.
  const ruleHits = new Map<number, number[]>();
  const needLlm: DbWorkBlock[] = [];
  for (const b of blocks) {
    const evidence = parseEvidenceJson(b.evidence);
    const ruleHit = chooseRule(rules, evidence, validIds);
    if (ruleHit) {
      if (b.project_id !== ruleHit.project_id || b.assignment_source !== "rule") {
        if (!ruleHits.has(ruleHit.project_id)) ruleHits.set(ruleHit.project_id, []);
        ruleHits.get(ruleHit.project_id)!.push(b.id);
      }
      continue;
    }
    // Only blocks never attempted by the LLM (reconciliation clears the
    // marker when evidence changes materially). Newest first — today's
    // fresh work gets classified before the morning's leftovers.
    if (b.project_id === null && b.assignment_source === null) {
      needLlm.push(b);
    }
  }
  for (const [projectId, ids] of ruleHits) {
    await blocksRepo.assignAutoBatch(ids, projectId, "rule", 1.0);
  }
  needLlm.sort((a, b) => b.started_at - a.started_at);

  if (needLlm.length === 0) {
    lastEngineUnavailable = null;
    return "done";
  }

  // 2) Local LLM for the rest.
  let model: string;
  try {
    model = await prepareEngine();
  } catch (err) {
    if (err instanceof EngineUnavailableError) {
      lastEngineUnavailable = err.message;
      console.log(`[Vera Assign] ${err.message}`);
      return "unavailable";
    }
    throw err;
  }

  let feedback: DbAssignmentFeedback[] = [];
  try {
    feedback = await feedbackRepo.recent(FEEDBACK_POOL);
  } catch (err) {
    console.error("[Vera Assign] failed to load feedback:", err);
  }

  const batch = needLlm.slice(0, MAX_LLM_CALLS_PER_PASS);
  for (const b of batch) {
    const evidence = parseEvidenceJson(b.evidence);
    const messages = buildClassifyMessages(
      projectPool,
      selectFewShot(feedback, evidence),
      evidence,
      Math.round((b.ended_at - b.started_at) / 60000)
    );
    try {
      const raw = await generateJson(model, messages);
      const result = parseClassifyReply(raw, validIds);
      lastEngineUnavailable = null;
      if (result && result.project_id !== null && result.confidence >= LLM_CONFIDENCE_THRESHOLD) {
        await blocksRepo.assignAuto(b.id, result.project_id, "llm", result.confidence);
      } else {
        // Below threshold or unparseable → stays unassigned (honest beats
        // wrong), and the attempt is remembered so it is not retried on
        // byte-identical evidence.
        await blocksRepo.markLlmAttempt(b.id, result?.confidence ?? 0);
      }
    } catch (err: any) {
      if (err?.name === "TimeoutError") {
        lastEngineUnavailable = "The local model timed out — Vera retries on the next run.";
        console.log("[Vera Assign] LLM call timed out; stopping this pass");
        return "unavailable";
      }
      console.error("[Vera Assign] classification failed:", err);
    }
  }
  return needLlm.length > batch.length ? "leftover" : "done";
}

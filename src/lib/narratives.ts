import {
  blocksRepo,
  entriesRepo,
  projectsRepo,
  projectLabel,
  settingsRepo,
  DbProjectWithClient,
  DbTimeEntry,
} from "./db";
import { nextDayStart } from "./format";
import { generateJson, prepareEngine, EngineUnavailableError } from "./engine";
import { emptyEvidence } from "./segmentation";
import {
  buildNarrativeMessages,
  dayStartMsOf,
  entryDateOf,
  effectiveIncrement,
  fallbackNarrative,
  groupBlocksIntoDrafts,
  parseNarrativeReply,
  redactNarrative,
  roundMinutes,
  EntryDraftInput,
  EntryLanguage,
  EntryTone,
  EntryTemplate,
} from "./narrative-core";

// The narrative engine (Schicht 4): one draft entry per project+day, built
// from the day's confirmed, assigned blocks. The local LLM writes the
// narrative (style-matched to the user's past edits); when it is offline, a
// deterministic evidence-based fallback keeps the daily close fully usable.
//
// Ownership model: AMOUNTS (minutes, block ids) always follow the blocks —
// they are engine data and are refreshed on every run, even on user-edited
// drafts, so late-confirmed time is never silently unbilled. The NARRATIVE
// text belongs to the user once edited and to the engine otherwise.
// Confirmed/exported entries are part of the billing record and are never
// touched at all.

export interface GeneratedEntries {
  entries: DbTimeEntry[];
  usedFallback: boolean;
  engineHint: string | null;
}

interface NarrativeOpts {
  language: EntryLanguage;
  tone: EntryTone;
  template: EntryTemplate;
}

async function prepareEngineOrNull(): Promise<{ model: string | null; hint: string | null }> {
  try {
    return { model: await prepareEngine(), hint: null };
  } catch (err) {
    if (err instanceof EngineUnavailableError) return { model: null, hint: err.message };
    throw err;
  }
}

// One LLM attempt; null when the model failed or replied garbage — the
// caller decides whether to fall back (bulk generation) or keep the existing
// text (single regenerate).
async function llmNarrative(
  model: string,
  project: DbProjectWithClient,
  draft: EntryDraftInput,
  opts: NarrativeOpts
): Promise<string | null> {
  try {
    const styleExamples = await entriesRepo.recentEditedNarratives(project.id);
    const raw = await generateJson(
      model,
      buildNarrativeMessages(projectLabel(project), draft, opts, styleExamples)
    );
    const parsed = parseNarrativeReply(raw);
    if (parsed) return redactNarrative(parsed);
  } catch (err) {
    console.error("[Vera Narratives] generation failed:", err);
  }
  return null;
}

/**
 * (Re)generate the draft entries for one day from its confirmed blocks.
 * User-edited drafts keep their text but get fresh amounts; untouched drafts
 * whose blocks did not change keep their narrative without a new LLM pass;
 * confirmed/exported entries are left alone entirely.
 */
export function generateEntriesForDay(dayStartMs: number): Promise<GeneratedEntries> {
  // Serialized: concurrent runs (double-click, Back mid-generation) would
  // race the delete+insert cycle into duplicate — double-billed — rows.
  const run = generationChain.then(() => generateEntriesInner(dayStartMs));
  generationChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
let generationChain: Promise<unknown> = Promise.resolve();

async function generateEntriesInner(dayStartMs: number): Promise<GeneratedEntries> {
  const dayEndMs = nextDayStart(dayStartMs);
  const entryDate = entryDateOf(dayStartMs);

  const [blocks, projects, language, tone, template, globalIncrement, roundingMode] =
    await Promise.all([
      blocksRepo.forDay(dayStartMs, dayEndMs),
      projectsRepo.listWithClients(true),
      settingsRepo.getEntryLanguage(),
      settingsRepo.getEntryTone(),
      settingsRepo.getEntryTemplate(),
      settingsRepo.getRoundingIncrement(),
      settingsRepo.getRoundingMode(),
    ]);
  const opts: NarrativeOpts = { language, tone, template };

  const drafts = groupBlocksIntoDrafts(blocks);
  const sameBlocks = (e: DbTimeEntry, d: EntryDraftInput) =>
    e.minutes === d.minutes && e.source_block_ids === JSON.stringify(d.block_ids);

  const existing = await entriesRepo.forDate(entryDate);
  const closedProjectIds = new Set(
    existing.filter((e) => e.status !== "draft").map((e) => e.project_id)
  );
  const editedDrafts = existing.filter((e) => e.status === "draft" && e.user_edited === 1);
  // Untouched drafts from the previous run: reusable narratives keyed by
  // project — if the block set and minutes are unchanged, the previous text
  // is still exactly right and the LLM pass would be wasted work.
  const previous = new Map<number, DbTimeEntry>(
    existing
      .filter((e) => e.status === "draft" && e.user_edited === 0)
      .map((e) => [e.project_id, e])
  );
  await entriesRepo.deleteUntouchedDrafts(entryDate);

  const { model, hint: engineHint } = await prepareEngineOrNull();

  let usedFallback = false;
  const seenEditedIds = new Set<number>();
  for (const draft of drafts) {
    if (closedProjectIds.has(draft.project_id)) continue; // billing record wins
    const project = projects.find((p) => p.id === draft.project_id);
    if (!project) continue;
    const increment = effectiveIncrement(project.rounding_increment, globalIncrement);
    const rounded = roundMinutes(draft.minutes, increment, roundingMode);

    const edited = editedDrafts.find((e) => e.project_id === draft.project_id);
    if (edited) {
      // The user's text wins — but the amounts follow the blocks.
      seenEditedIds.add(edited.id);
      if (!sameBlocks(edited, draft)) {
        await entriesRepo.updateAmounts(edited.id, draft.minutes, rounded, draft.block_ids);
      }
      continue;
    }

    const prev = previous.get(draft.project_id);
    let text: string;
    if (prev && sameBlocks(prev, draft)) {
      text = prev.narrative; // unchanged input → keep the previous narrative
    } else if (model !== null) {
      const generated = await llmNarrative(model, project, draft, opts);
      usedFallback = usedFallback || generated === null;
      text = generated ?? fallbackNarrative(draft, language);
    } else {
      usedFallback = true;
      text = fallbackNarrative(draft, language);
    }
    await entriesRepo.create({
      project_id: draft.project_id,
      entry_date: entryDate,
      minutes: draft.minutes,
      rounded_minutes: rounded,
      narrative: text,
      source_block_ids: draft.block_ids,
    });
  }

  // Edited drafts whose project group vanished (blocks reopened, discarded,
  // or reassigned): the text stays — it is the user's — but the amounts
  // honestly drop to zero so nothing phantom-billed survives.
  for (const e of editedDrafts) {
    if (seenEditedIds.has(e.id) || closedProjectIds.has(e.project_id)) continue;
    if (e.minutes !== 0) await entriesRepo.updateAmounts(e.id, 0, 0, []);
  }

  return {
    entries: await entriesRepo.forDate(entryDate),
    usedFallback,
    engineHint: model === null ? engineHint : null,
  };
}

/**
 * Regenerate a single entry's narrative (the ↻ button in the review step).
 * Returns null — leaving the existing text untouched — when the model is
 * unavailable or fails: a regenerate must never replace a good narrative
 * with the generic fallback.
 */
export async function regenerateNarrative(entry: DbTimeEntry): Promise<string | null> {
  const [projects, language, tone, template] = await Promise.all([
    projectsRepo.listWithClients(true),
    settingsRepo.getEntryLanguage(),
    settingsRepo.getEntryTone(),
    settingsRepo.getEntryTemplate(),
  ]);
  const project = projects.find((p) => p.id === entry.project_id);
  if (!project) return null;

  let blockIds: number[] = [];
  try {
    blockIds = JSON.parse(entry.source_block_ids) ?? [];
  } catch {
    blockIds = [];
  }
  // Rebuild the draft evidence from the source blocks (they may be gone if
  // very old — the prompt then works from an empty evidence set).
  const dayStart = dayStartMsOf(entry.entry_date);
  const blocks = await blocksRepo.forDay(dayStart, nextDayStart(dayStart));
  const source = blocks.filter((b) => blockIds.includes(b.id));
  const drafts = groupBlocksIntoDrafts(source);
  const draft: EntryDraftInput =
    drafts.find((d) => d.project_id === entry.project_id) ?? {
      project_id: entry.project_id,
      minutes: entry.minutes,
      block_ids: blockIds,
      evidence: emptyEvidence(),
    };

  const { model } = await prepareEngineOrNull();
  if (model === null) return null;
  return llmNarrative(model, project, draft, { language, tone, template });
}

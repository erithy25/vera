import {
  blocksRepo,
  entriesRepo,
  projectsRepo,
  settingsRepo,
  DbProjectWithClient,
  DbTimeEntry,
} from "./db";
import { nextDayStart } from "./format";
import { generateJson, prepareEngine, EngineUnavailableError } from "./engine";
import {
  buildNarrativeMessages,
  entryDateOf,
  effectiveIncrement,
  fallbackNarrative,
  groupBlocksIntoDrafts,
  parseNarrativeReply,
  redactNarrative,
  roundMinutes,
  EntryDraftInput,
} from "./narrative-core";

// The narrative engine (Schicht 4): one draft entry per project+day, built
// from the day's confirmed, assigned blocks. The local LLM writes the
// narrative (style-matched to the user's past edits); when it is offline, a
// deterministic evidence-based fallback keeps the daily close fully usable.
// Regeneration replaces ONLY untouched drafts — user-edited drafts and
// confirmed/exported entries are never overwritten.

export interface GeneratedEntries {
  entries: DbTimeEntry[];
  usedFallback: boolean;
  engineHint: string | null;
}

function projectLabelOf(p: DbProjectWithClient): string {
  return `${p.client_name} — ${p.name}`;
}

async function narrativeFor(
  model: string | null,
  project: DbProjectWithClient,
  draft: EntryDraftInput,
  opts: { language: "en" | "de"; tone: "concise" | "detailed"; template: "agency" | "consulting" | "law" }
): Promise<{ text: string; fallback: boolean }> {
  if (model === null) {
    return { text: fallbackNarrative(draft, opts.language), fallback: true };
  }
  try {
    const styleExamples = await entriesRepo.recentEditedNarratives(project.id);
    const raw = await generateJson(
      model,
      buildNarrativeMessages(projectLabelOf(project), draft, opts, styleExamples)
    );
    const parsed = parseNarrativeReply(raw);
    if (parsed) return { text: redactNarrative(parsed), fallback: false };
  } catch (err) {
    console.error("[Vera Narratives] generation failed:", err);
  }
  return { text: fallbackNarrative(draft, opts.language), fallback: true };
}

/**
 * (Re)generate the draft entries for one day from its confirmed blocks.
 * Existing user-edited drafts keep their text (only minutes are refreshed if
 * the same project group still exists); confirmed/exported entries are left
 * alone entirely.
 */
export async function generateEntriesForDay(dayStartMs: number): Promise<GeneratedEntries> {
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
  const opts = { language, tone, template };

  const drafts = groupBlocksIntoDrafts(blocks);

  // Never regenerate what the user already touched or closed.
  const existing = await entriesRepo.forDate(entryDate);
  const keep = existing.filter((e) => e.status !== "draft" || e.user_edited === 1);
  const keptProjectIds = new Set(keep.map((e) => e.project_id));
  await entriesRepo.deleteUntouchedDrafts(entryDate);

  let model: string | null = null;
  let engineHint: string | null = null;
  try {
    model = await prepareEngine();
  } catch (err) {
    if (err instanceof EngineUnavailableError) {
      engineHint = err.message;
    } else {
      throw err;
    }
  }

  let usedFallback = false;
  for (const draft of drafts) {
    if (keptProjectIds.has(draft.project_id)) continue; // user's version wins
    const project = projects.find((p) => p.id === draft.project_id);
    if (!project) continue;
    const increment = effectiveIncrement(project.rounding_increment, globalIncrement);
    const rounded = roundMinutes(draft.minutes, increment, roundingMode);
    const { text, fallback } = await narrativeFor(model, project, draft, opts);
    usedFallback = usedFallback || fallback;
    await entriesRepo.create({
      project_id: draft.project_id,
      entry_date: entryDate,
      minutes: draft.minutes,
      rounded_minutes: rounded,
      narrative: text,
      source_block_ids: draft.block_ids,
    });
  }

  return {
    entries: await entriesRepo.forDate(entryDate),
    usedFallback,
    engineHint,
  };
}

/** Regenerate a single entry's narrative (the ↻ button in the review step). */
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
  // very old — the fallback then works from an empty evidence set).
  const dayStart = new Date(entry.entry_date + "T00:00:00").getTime();
  const blocks = await blocksRepo.forDay(dayStart, nextDayStart(dayStart));
  const source = blocks.filter((b) => blockIds.includes(b.id));
  const drafts = groupBlocksIntoDrafts(source);
  const draft: EntryDraftInput =
    drafts.find((d) => d.project_id === entry.project_id) ?? {
      project_id: entry.project_id,
      minutes: entry.minutes,
      block_ids: blockIds,
      evidence: { apps: [], titles: [], domains: [], terms: [] },
    };

  let model: string | null = null;
  try {
    model = await prepareEngine();
  } catch (err) {
    if (!(err instanceof EngineUnavailableError)) throw err;
  }
  const { text } = await narrativeFor(model, project, draft, { language, tone, template });
  return text;
}

import { IntegrationAdapter, ProviderId, PushableEntry } from "./types";
import { mocoAdapter } from "./moco";
import { aworkAdapter } from "./awork";
import { clioAdapter } from "./clio";

// The adapter registry — Settings and the push runner render exactly this
// list. Future providers only append here. (Lexoffice/sevDesk are accounting/
// invoicing systems with no time-entry API — they belong to a later invoice
// adapter, not this time-entry push, and are intentionally not listed.)
export const integrationAdapters: IntegrationAdapter[] = [mocoAdapter, aworkAdapter, clioAdapter];

export function adapterFor(id: ProviderId): IntegrationAdapter | undefined {
  return integrationAdapters.find((a) => a.id === id);
}

// A single entry's push plan: it must be confirmed/exported, have a project
// mapping for this provider, and not already have been pushed to it.
export interface PushCandidate {
  entry: PushableEntry;
  remoteId: string;
}

export type SkipReason = "no-mapping" | "already-pushed";

export interface PushPlan {
  toPush: PushCandidate[];
  skipped: { entryId: number; reason: SkipReason }[];
}

/**
 * Decide, purely, which entries to push. `mappingFor` returns the remote id a
 * project is mapped to (or null); `alreadyPushed` is the set of entry ids
 * already synced to this provider (idempotency / duplicate protection).
 */
export function planPush(
  entries: { id: number; project_id: number; entry_date: string; rounded_minutes: number; narrative: string }[],
  mappingFor: (projectId: number) => string | null,
  alreadyPushed: Set<number>
): PushPlan {
  const toPush: PushCandidate[] = [];
  const skipped: { entryId: number; reason: SkipReason }[] = [];
  for (const e of entries) {
    if (alreadyPushed.has(e.id)) {
      skipped.push({ entryId: e.id, reason: "already-pushed" });
      continue;
    }
    const remoteId = mappingFor(e.project_id);
    if (!remoteId) {
      skipped.push({ entryId: e.id, reason: "no-mapping" });
      continue;
    }
    toPush.push({
      entry: {
        id: e.id,
        entry_date: e.entry_date,
        rounded_minutes: e.rounded_minutes,
        narrative: e.narrative,
      },
      remoteId,
    });
  }
  return { toPush, skipped };
}

import { entriesRepo, integrationsRepo, DbTimeEntry } from "./db";
import { IntegrationAdapter, AccountConfig, planPush, sendEntry } from "./integrations";

// The push transport (Schicht 7): sends confirmed entries to a target billing
// API over the frontend fetch (the webview has no CSP restriction). This is
// the app's only outbound content transmission, and it is fully user-driven:
// it fires only when the user clicks "Push", sends ONLY the whitelisted entry
// fields the adapter builds, and records each push so nothing is sent twice.

export type PushOutcome =
  | { entryId: number; status: "pushed"; remoteId: string }
  | { entryId: number; status: "skipped"; reason: "no-mapping" | "already-pushed" }
  | { entryId: number; status: "error"; message: string };

export interface PushSummary {
  pushed: number;
  skipped: number;
  errors: number;
  outcomes: PushOutcome[];
}

/**
 * Push every confirmed entry in [fromDate, toDate] that is mapped for this
 * provider and not already synced. Records each success and flips the entry to
 * 'exported'. Entries stay serialized (one at a time) so a mid-run failure
 * leaves a clean, resumable state.
 */
export async function pushRange(
  adapter: IntegrationAdapter,
  account: AccountConfig,
  fromDate: string,
  toDate: string
): Promise<PushSummary> {
  const [entries, links, alreadyPushed] = await Promise.all([
    entriesRepo.forRange(fromDate, toDate),
    integrationsRepo.linksFor(adapter.id),
    integrationsRepo.pushedEntryIds(adapter.id),
  ]);

  const mapping = new Map(links.map((l) => [l.project_id, l.remote_id]));
  const billable = entries.filter((e: DbTimeEntry) => e.status === "confirmed" || e.status === "exported");
  const plan = planPush(billable, (pid) => mapping.get(pid) ?? null, alreadyPushed);

  const outcomes: PushOutcome[] = plan.skipped.map((s) => ({
    entryId: s.entryId,
    status: "skipped" as const,
    reason: s.reason,
  }));

  for (const cand of plan.toPush) {
    const result = await sendEntry(adapter, account, cand.entry, cand.remoteId, (url, init) =>
      fetch(url, init)
    );
    if (!result.ok) {
      outcomes.push({ entryId: cand.entry.id, status: "error", message: result.message });
      continue;
    }
    // The POST succeeded — the entry now lives in the target system. Record it
    // (dedup) and mark it exported. If that local write fails, DON'T let it
    // abort the batch or vanish silently: surface a clear warning so the user
    // knows this one landed remotely but isn't recorded (do not re-push it).
    try {
      await integrationsRepo.recordPush(cand.entry.id, adapter.id, result.remoteId);
      await entriesRepo.markExported([cand.entry.id]);
      outcomes.push({ entryId: cand.entry.id, status: "pushed", remoteId: result.remoteId });
    } catch (err: any) {
      outcomes.push({
        entryId: cand.entry.id,
        status: "error",
        message: `Sent to ${adapter.label} but could not be recorded locally (${
          err?.message || String(err)
        }) — do NOT push again to avoid a duplicate.`,
      });
    }
  }

  window.dispatchEvent(new CustomEvent("entries-updated"));
  return {
    pushed: outcomes.filter((o) => o.status === "pushed").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    errors: outcomes.filter((o) => o.status === "error").length,
    outcomes,
  };
}

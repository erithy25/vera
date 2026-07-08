import { IntegrationAdapter, AccountConfig, PushableEntry } from "./types";

export type SendResult = { ok: true; remoteId: string } | { ok: false; message: string };

// Minimal fetch surface, so the transport is testable with an injected impl.
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/**
 * Send ONE confirmed entry to a target billing API. Pure of DB and globals —
 * the caller injects fetch. Response handling: non-2xx → error with a short
 * body excerpt; an empty body on success is tolerated (falls back to the
 * mapped remote id).
 */
export async function sendEntry(
  adapter: IntegrationAdapter,
  account: AccountConfig,
  entry: PushableEntry,
  remoteId: string,
  fetchImpl: FetchLike
): Promise<SendResult> {
  const req = adapter.buildEntryRequest(entry, remoteId, account);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body });
  } catch (err: any) {
    return { ok: false, message: `Network error: ${err?.message || String(err)}` };
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      message: `${adapter.label} rejected the entry (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* some APIs return an empty body on success */
  }
  return { ok: true, remoteId: adapter.extractRemoteId(json) ?? remoteId };
}

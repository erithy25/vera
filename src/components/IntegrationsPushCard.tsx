import React, { useEffect, useState } from "react";
import { UploadCloud, Lock } from "lucide-react";
import { settingsRepo } from "../lib/db";
import { integrationAdapters, IntegrationAdapter } from "../lib/integrations";
import { pushRange, PushSummary } from "../lib/integrations-push";
import { currentEntitlement, licenseGateMessage } from "../lib/license";

interface Props {
  fromDate: string;
  toDate: string;
}

// Reports → "Push to billing tool" (Schicht 7). Sends this period's confirmed,
// mapped entries to a connected provider. Opt-in and gated like the file
// export; entries already synced to that provider are skipped automatically.
export const IntegrationsPushCard: React.FC<Props> = ({ fromDate, toDate }) => {
  const [connected, setConnected] = useState<IntegrationAdapter[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [pushing, setPushing] = useState(false);
  const [summary, setSummary] = useState<PushSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const results = await Promise.all(
        integrationAdapters.map(async (a) => {
          const cfg = await settingsRepo.getIntegrationAccount(a.id);
          return cfg && a.isConfigured(cfg) ? a : null;
        })
      );
      const live = results.filter((a): a is IntegrationAdapter => a !== null);
      setConnected(live);
      setProviderId((prev) => (live.some((a) => a.id === prev) ? prev : live[0]?.id ?? ""));
    })();
  }, []);

  const push = async () => {
    const adapter = connected.find((a) => a.id === providerId);
    if (!adapter) return;
    setPushing(true);
    setError(null);
    setSummary(null);
    try {
      const gate = licenseGateMessage(await currentEntitlement(), "push to your billing tool");
      if (gate) {
        setError(gate);
        return;
      }
      const account = await settingsRepo.getIntegrationAccount(adapter.id);
      if (!account) {
        setError("This integration is no longer connected.");
        return;
      }
      setSummary(await pushRange(adapter, account, fromDate, toDate));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setPushing(false);
    }
  };

  if (connected.length === 0) {
    return (
      <div className="card-style px-6 py-5 flex flex-col gap-1">
        <span className="font-serif text-[17px] font-normal text-text-primary">Push to billing tool</span>
        <span className="font-sans text-[12px] text-text-faint">
          Connect MOCO, awork or Clio in Settings → Integrations to push confirmed entries with one click.
        </span>
      </div>
    );
  }

  const adapter = connected.find((a) => a.id === providerId);

  return (
    <div className="card-style px-6 py-5 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-serif text-[17px] font-normal text-text-primary">Push to billing tool</span>
        <span className="font-sans text-[12px] text-text-faint">
          Sends this period's confirmed, mapped entries. Already-synced entries are skipped.
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          className="px-2 py-1.5 border border-border-hairline rounded-lg font-sans text-[12px] outline-none cursor-pointer bg-card-surface text-text-primary"
        >
          {connected.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          onClick={push}
          disabled={pushing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-text-primary text-card-surface font-sans text-[12px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
        >
          <UploadCloud size={13} strokeWidth={1.5} />
          {pushing ? `Pushing to ${adapter?.label}…` : `Push to ${adapter?.label}`}
        </button>
      </div>

      {summary && (
        <div className="flex flex-col gap-1">
          <span className="font-sans text-[12px] text-emerald-700">
            {summary.pushed} pushed
            {summary.skipped > 0 && ` · ${summary.skipped} skipped (unmapped or already synced)`}
            {summary.errors > 0 && ` · ${summary.errors} failed`}
          </span>
          {summary.outcomes
            .filter((o) => o.status === "error")
            .slice(0, 5)
            .map((o) => (
              <span key={o.entryId} className="font-sans text-[11px] text-red-600">
                Entry #{o.entryId}: {o.status === "error" ? o.message : ""}
              </span>
            ))}
        </div>
      )}
      {error && <span className="font-sans text-[12px] text-red-600">{error}</span>}

      <span className="flex items-center gap-1.5 font-sans text-[11px] text-text-faint">
        <Lock size={11} strokeWidth={1.5} />
        Only the entry (date, project, billed minutes, narrative) is sent — never your captured activity.
      </span>
    </div>
  );
};

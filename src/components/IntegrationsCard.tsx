import React, { useEffect, useState } from "react";
import { Plug, Check, Lock } from "lucide-react";
import {
  integrationsRepo,
  projectsRepo,
  settingsRepo,
  isActiveProject,
  DbProjectWithClient,
  DbIntegrationLink,
} from "../lib/db";
import { integrationAdapters, IntegrationAdapter, AccountConfig } from "../lib/integrations";

// The "Integrations" settings card (Schicht 7): connect a billing tool, then
// map each Vera project to a target project/matter. Pushing entries happens
// from Reports. Strictly opt-in — nothing is sent until you connect AND push.
export const IntegrationsCard: React.FC = () => {
  const [providerId, setProviderId] = useState<string>(integrationAdapters[0].id);
  const adapter = integrationAdapters.find((a) => a.id === providerId)!;

  const [account, setAccount] = useState<AccountConfig>({});
  const [connected, setConnected] = useState(false);
  const [projects, setProjects] = useState<DbProjectWithClient[]>([]);
  const [links, setLinks] = useState<DbIntegrationLink[]>([]);
  const [mapDraft, setMapDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async (a: IntegrationAdapter) => {
    try {
      const [saved, projs, lnks] = await Promise.all([
        settingsRepo.getIntegrationAccount(a.id),
        projectsRepo.listWithClients(true),
        integrationsRepo.linksFor(a.id),
      ]);
      setAccount(saved ?? {});
      setConnected(!!saved && a.isConfigured(saved));
      setProjects(projs);
      setLinks(lnks);
      setMapDraft(Object.fromEntries(lnks.map((l) => [l.project_id, l.remote_id])));
    } catch (err) {
      console.error("Failed to load integration state:", err);
    }
  };

  useEffect(() => {
    load(adapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const connect = async () => {
    if (!adapter.isConfigured(account)) return;
    setBusy(true);
    try {
      await settingsRepo.setIntegrationAccount(adapter.id, account);
      setConnected(true);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await settingsRepo.clearIntegrationAccount(adapter.id);
      setAccount({});
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  const saveMapping = async (project: DbProjectWithClient) => {
    const remoteId = (mapDraft[project.id] ?? "").trim();
    try {
      if (remoteId) {
        await integrationsRepo.setLink(adapter.id, project.id, remoteId, `${project.client_name} — ${project.name}`);
      } else {
        await integrationsRepo.removeLink(adapter.id, project.id);
      }
      setLinks(await integrationsRepo.linksFor(adapter.id));
    } catch (err) {
      console.error("Failed to save project mapping:", err);
    }
  };

  const activeProjects = projects.filter(isActiveProject);
  const mappedCount = links.filter((l) => l.remote_id).length;

  return (
    <div id="settings-integrations" className="card-style p-6 flex flex-col gap-5 scroll-mt-6">
      <div className="flex flex-col gap-0.5 border-b border-border-hairline pb-4">
        <div className="flex items-center gap-2">
          <Plug size={17} strokeWidth={1.5} className="text-text-muted" />
          <h2 className="font-serif text-[20px] font-normal text-text-primary">Integrations</h2>
        </div>
        <p className="font-sans text-[13px] text-text-faint leading-relaxed">
          Push confirmed entries straight into your billing tool. Opt-in and one-way: Vera
          sends only the entry (date, project, billed minutes, narrative) when you push from
          Reports — never your captured activity, screenshots, or evidence.
        </p>
      </div>

      {/* Provider picker */}
      <div className="flex items-center gap-2 flex-wrap">
        {integrationAdapters.map((a) => (
          <button
            key={a.id}
            onClick={() => setProviderId(a.id)}
            className={`px-3.5 py-2 rounded-lg border font-sans text-[13px] cursor-pointer transition-colors ${
              a.id === providerId
                ? "bg-text-primary text-card-surface border-text-primary"
                : "bg-bg-warm text-text-muted border-border-hairline hover:text-text-primary"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Connect */}
      <div className="flex flex-col gap-3">
        <span className="font-sans text-[13px] font-medium text-text-primary">
          {adapter.label} account
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {adapter.fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="font-sans text-[12px] text-text-muted">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                value={account[f.key] ?? ""}
                onChange={(e) => setAccount((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                autoComplete="off"
                className="px-3 py-2 bg-bg-warm border border-border-hairline rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-text-muted"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1 border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 rounded-full font-sans text-[11px] font-medium uppercase">
                <Check size={12} strokeWidth={2} /> Connected
              </span>
              <button
                onClick={connect}
                disabled={busy || !adapter.isConfigured(account)}
                className="px-3 py-1.5 rounded-lg border border-border-hairline font-sans text-[12px] text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                Update credentials
              </button>
              <button
                onClick={disconnect}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg font-sans text-[12px] text-text-faint hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={busy || !adapter.isConfigured(account)}
              className="px-4 py-2 rounded-lg bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
            >
              Connect
            </button>
          )}
        </div>
        <span className="flex items-center gap-1.5 font-sans text-[11px] text-text-faint">
          <Lock size={11} strokeWidth={1.5} />
          Stored on this Mac. It leaves your device only as the auth header when you push to {adapter.label}.
        </span>
      </div>

      {/* Project mapping */}
      {connected && (
        <div className="flex flex-col gap-3 border-t border-border-hairline pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[13px] font-medium text-text-primary">
              Project mapping <span className="text-text-faint font-normal">({mappedCount} mapped)</span>
            </span>
            <span className="font-sans text-[12px] text-text-faint">{adapter.remoteIdHelp}</span>
          </div>
          {activeProjects.length === 0 && (
            <span className="font-sans text-[13px] text-text-faint italic">
              No active projects yet — add clients and projects first.
            </span>
          )}
          <div className="flex flex-col gap-2">
            {activeProjects.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="flex-1 min-w-0 font-sans text-[13px] text-text-primary truncate">
                  {p.client_name} — {p.name}
                </span>
                <input
                  type="text"
                  value={mapDraft[p.id] ?? ""}
                  onChange={(e) => setMapDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onBlur={() => saveMapping(p)}
                  placeholder="remote id"
                  className="w-52 px-3 py-1.5 bg-bg-warm border border-border-hairline rounded-lg font-sans text-[12px] text-text-primary outline-none focus:border-text-muted"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

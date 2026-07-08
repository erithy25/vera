import React, { useEffect, useState } from "react";
import { Plus, Archive, ArchiveRestore, Pencil, Check, X, Trash2, Wand2 } from "lucide-react";
import {
  clientsRepo,
  projectsRepo,
  rulesRepo,
  DbAssignmentRule,
  DbClient,
  DbProjectWithClient,
  RuleMatcherType,
} from "../lib/db";
import { queueAssignment } from "../lib/assign";
import {
  dayStartOf,
  nextDayStart,
  prevDayStart,
  formatEuroFromCents,
  parseEuroToCents,
} from "../lib/format";

const MATCHER_LABELS: Record<RuleMatcherType, string> = {
  domain: "Domain",
  app: "App",
  title_keyword: "Title contains",
  path: "Path contains",
};

const PALETTE = ["#8A8A82", "#B0785C", "#7C8C6E", "#6E7C8C", "#9C7C8C", "#B09A5C"];

// Clients & Projects — the entities work blocks get assigned to. Hourly rates
// live here (client default, optional per-project override) so later layers
// can price confirmed time.
export const ClientsProjects: React.FC = () => {
  const [clients, setClients] = useState<DbClient[]>([]);
  const [projects, setProjects] = useState<DbProjectWithClient[]>([]);
  const [rules, setRules] = useState<DbAssignmentRule[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Add-rule form
  const [newRuleType, setNewRuleType] = useState<RuleMatcherType>("domain");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleProject, setNewRuleProject] = useState<string>("");

  // Add-client form
  const [newClientName, setNewClientName] = useState("");
  const [newClientRate, setNewClientRate] = useState("");
  const [newClientColor, setNewClientColor] = useState(PALETTE[0]);

  // Add-project form (per client id)
  const [projectFormClient, setProjectFormClient] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectRate, setNewProjectRate] = useState("");
  const [newProjectBillable, setNewProjectBillable] = useState(true);

  // Inline client editing
  const [editingClient, setEditingClient] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");

  const load = async () => {
    try {
      const [c, p, r] = await Promise.all([
        clientsRepo.list(true),
        projectsRepo.listWithClients(true),
        rulesRepo.list(),
      ]);
      setClients(c);
      setProjects(p);
      setRules(r);
    } catch (err) {
      console.error("Failed to load clients/projects:", err);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const pattern = newRulePattern.trim().toLowerCase();
    const projectId = newRuleProject === "" ? null : Number(newRuleProject);
    if (!pattern || projectId === null) return;
    await rulesRepo.add(newRuleType, pattern, projectId, "user");
    setNewRulePattern("");
    // The card promises immediate effect: run the assignment engine for
    // today and yesterday right away (rules also apply on days whose raw
    // capture already expired — assignment works from blocks).
    const today = dayStartOf(Date.now());
    queueAssignment(prevDayStart(today), today).catch(() => undefined);
    queueAssignment(today, nextDayStart(today)).catch(() => undefined);
    await load();
  };

  useEffect(() => {
    load();
  }, []);

  const visibleClients = clients.filter((c) => showArchived || !c.archived);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newClientName.trim();
    if (!name) return;
    await clientsRepo.add(name, newClientColor, parseEuroToCents(newClientRate));
    setNewClientName("");
    setNewClientRate("");
    await load();
  };

  const handleAddProject = async (e: React.FormEvent, clientId: number) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    await projectsRepo.add(clientId, name, newProjectBillable, parseEuroToCents(newProjectRate));
    setNewProjectName("");
    setNewProjectRate("");
    setNewProjectBillable(true);
    setProjectFormClient(null);
    await load();
  };

  const startEditClient = (c: DbClient) => {
    setEditingClient(c.id);
    setEditName(c.name);
    setEditRate(c.hourly_rate_cents !== null ? String(c.hourly_rate_cents / 100) : "");
  };

  const saveEditClient = async (c: DbClient) => {
    const name = editName.trim();
    if (name) {
      await clientsRepo.update(c.id, name, c.color, parseEuroToCents(editRate));
    }
    setEditingClient(null);
    await load();
  };

  return (
    <div className="w-full max-w-[900px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      <div className="flex items-end justify-between border-b border-border-hairline pb-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
            Clients & Projects
          </h1>
          <p className="font-sans text-[14px] text-text-muted leading-relaxed">
            Work blocks get assigned to these. Rates price your confirmed time.
          </p>
        </div>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="px-3 py-1.5 border border-border-hairline rounded-xl font-sans text-[12px] text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer mb-1"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      {/* Add client */}
      <form onSubmit={handleAddClient} className="card-style p-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setNewClientColor(color)}
              className={`w-5 h-5 rounded-full cursor-pointer transition-transform ${newClientColor === color ? "scale-110 ring-2 ring-offset-1 ring-text-primary" : ""}`}
              style={{ backgroundColor: color }}
              title="Client color"
            />
          ))}
        </div>
        <input
          type="text"
          value={newClientName}
          onChange={(e) => setNewClientName(e.target.value)}
          placeholder="New client name…"
          className="flex-1 min-w-[180px] px-3 py-2 bg-bg-warm border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
        />
        <input
          type="text"
          value={newClientRate}
          onChange={(e) => setNewClientRate(e.target.value)}
          placeholder="Rate €/h (optional)"
          className="w-[140px] px-3 py-2 bg-bg-warm border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium cursor-pointer active:scale-[0.98]"
        >
          <Plus size={14} strokeWidth={2} />
          Add client
        </button>
      </form>

      {visibleClients.length === 0 && (
        <div className="card-style px-8 py-12 flex flex-col items-center text-center gap-2">
          <h2 className="font-serif text-[20px] text-text-primary">No clients yet.</h2>
          <p className="font-sans text-[13px] text-text-muted max-w-[400px] leading-relaxed">
            Add your first client above — then assign today's work blocks to
            their projects in the Today view.
          </p>
        </div>
      )}

      {/* Clients */}
      {visibleClients.map((c) => {
        const clientProjects = projects.filter(
          (p) => p.client_id === c.id && (showArchived || !p.archived)
        );
        return (
          <div key={c.id} className={`card-style p-5 flex flex-col gap-3 ${c.archived ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color || PALETTE[0] }} />
              {editingClient === c.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 px-2 py-1 border border-border-hairline rounded-lg font-sans text-[14px] outline-none bg-bg-warm"
                  />
                  <input
                    type="text"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    placeholder="€/h"
                    className="w-[90px] px-2 py-1 border border-border-hairline rounded-lg font-sans text-[13px] outline-none bg-bg-warm"
                  />
                  <button onClick={() => saveEditClient(c)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/5 cursor-pointer" title="Save">
                    <Check size={15} strokeWidth={2} />
                  </button>
                  <button onClick={() => setEditingClient(null)} className="p-1.5 rounded-lg text-text-muted hover:bg-active-hover cursor-pointer" title="Cancel">
                    <X size={15} strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="font-serif text-[19px] text-text-primary">{c.name}</span>
                  <span className="font-sans text-[12px] text-text-faint">
                    {c.hourly_rate_cents !== null ? `${formatEuroFromCents(c.hourly_rate_cents)}/h` : "no rate"}
                  </span>
                  <div className="flex-1" />
                  <button onClick={() => startEditClient(c)} title="Edit client" className="p-1.5 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer">
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={async () => {
                      await clientsRepo.setArchived(c.id, !c.archived);
                      await load();
                    }}
                    title={c.archived ? "Restore client" : "Archive client"}
                    className="p-1.5 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
                  >
                    {c.archived ? <ArchiveRestore size={14} strokeWidth={1.5} /> : <Archive size={14} strokeWidth={1.5} />}
                  </button>
                </>
              )}
            </div>

            {/* Projects */}
            <div className="flex flex-col gap-1.5 pl-6">
              {clientProjects.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 py-1 ${p.archived ? "opacity-60" : ""}`}>
                  <span className="font-sans text-[13.5px] text-text-primary">{p.name}</span>
                  {!p.billable ? (
                    <span className="font-sans text-[11px] px-1.5 py-0.5 rounded bg-active-hover text-text-faint border border-border-hairline">non-billable</span>
                  ) : (
                    <span className="font-sans text-[11px] text-text-faint">
                      {p.hourly_rate_cents !== null
                        ? `${formatEuroFromCents(p.hourly_rate_cents)}/h`
                        : c.hourly_rate_cents !== null
                          ? `${formatEuroFromCents(c.hourly_rate_cents)}/h (client rate)`
                          : "no rate"}
                    </span>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={async () => {
                      await projectsRepo.setArchived(p.id, !p.archived);
                      await load();
                    }}
                    title={p.archived ? "Restore project" : "Archive project"}
                    className="p-1 rounded-lg text-text-faint hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
                  >
                    {p.archived ? <ArchiveRestore size={13} strokeWidth={1.5} /> : <Archive size={13} strokeWidth={1.5} />}
                  </button>
                </div>
              ))}
              {clientProjects.length === 0 && (
                <span className="font-sans text-[12px] text-text-faint italic py-1">No projects yet.</span>
              )}

              {projectFormClient === c.id ? (
                <form onSubmit={(e) => handleAddProject(e, c.id)} className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newProjectName}
                    autoFocus
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name…"
                    className="flex-1 min-w-[160px] px-3 py-1.5 bg-bg-warm border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
                  />
                  <input
                    type="text"
                    value={newProjectRate}
                    onChange={(e) => setNewProjectRate(e.target.value)}
                    placeholder="Rate €/h (optional)"
                    className="w-[140px] px-3 py-1.5 bg-bg-warm border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
                  />
                  <label className="flex items-center gap-1.5 font-sans text-[12px] text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newProjectBillable}
                      onChange={(e) => setNewProjectBillable(e.target.checked)}
                      className="cursor-pointer w-3.5 h-3.5 accent-text-primary"
                    />
                    billable
                  </label>
                  <button type="submit" className="px-3 py-1.5 rounded-xl bg-text-primary text-card-surface font-sans text-[12px] font-medium cursor-pointer">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectFormClient(null)}
                    className="px-2 py-1.5 rounded-xl font-sans text-[12px] text-text-muted hover:bg-active-hover cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                !c.archived && (
                  <button
                    onClick={() => {
                      setProjectFormClient(c.id);
                      setNewProjectName("");
                      setNewProjectRate("");
                      setNewProjectBillable(true);
                    }}
                    className="self-start flex items-center gap-1 font-sans text-[12px] text-text-muted hover:text-text-primary transition-colors cursor-pointer pt-1"
                  >
                    <Plus size={13} strokeWidth={1.5} />
                    Add project
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}

      {/* Assignment rules — deterministic auto-assignment, confidence 100% */}
      <div className="card-style p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Wand2 size={16} strokeWidth={1.5} className="text-text-muted" />
          <div className="flex flex-col">
            <span className="font-serif text-[19px] text-text-primary">Assignment rules</span>
            <span className="font-sans text-[12px] text-text-faint">
              Blocks matching a rule are assigned automatically — before the local model is even asked.
            </span>
          </div>
        </div>

        <form onSubmit={handleAddRule} className="flex flex-wrap items-center gap-2">
          <select
            value={newRuleType}
            onChange={(e) => setNewRuleType(e.target.value as RuleMatcherType)}
            className="px-2.5 py-2 border border-border-hairline rounded-xl font-sans text-[13px] bg-bg-warm outline-none cursor-pointer"
          >
            {(Object.keys(MATCHER_LABELS) as RuleMatcherType[]).map((t) => (
              <option key={t} value={t}>
                {MATCHER_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newRulePattern}
            onChange={(e) => setNewRulePattern(e.target.value)}
            placeholder={newRuleType === "domain" ? "client-site.com" : newRuleType === "app" ? "Figma" : "keyword…"}
            className="flex-1 min-w-[160px] px-3 py-2 bg-bg-warm border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
          />
          <span className="font-sans text-[13px] text-text-faint">→</span>
          <select
            value={newRuleProject}
            onChange={(e) => setNewRuleProject(e.target.value)}
            className="px-2.5 py-2 border border-border-hairline rounded-xl font-sans text-[13px] bg-bg-warm outline-none cursor-pointer max-w-[240px]"
          >
            <option value="">Choose project…</option>
            {projects
              .filter((p) => !p.archived && !p.client_archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client_name} — {p.name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium cursor-pointer active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2} />
            Add rule
          </button>
        </form>

        <div className="flex flex-col gap-1.5">
          {rules.map((r) => {
            const project = projects.find((p) => p.id === r.project_id);
            return (
              <div key={r.id} className="flex items-center gap-3 py-1">
                <span className="font-sans text-[11px] px-1.5 py-0.5 rounded bg-active-hover text-text-muted border border-border-hairline uppercase tracking-wide shrink-0">
                  {MATCHER_LABELS[r.matcher_type] ?? r.matcher_type}
                </span>
                <span className="font-sans text-[13px] text-text-primary font-medium">{r.pattern}</span>
                <span className="font-sans text-[12px] text-text-faint">→</span>
                <span className="font-sans text-[13px] text-text-muted truncate">
                  {project ? `${project.client_name} — ${project.name}` : `project #${r.project_id}`}
                </span>
                {r.created_from === "suggestion" && (
                  <span className="font-sans text-[10px] px-1.5 py-0.5 rounded border border-sky-500/20 bg-sky-500/5 text-sky-700 uppercase tracking-wide shrink-0">
                    learned
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={async () => {
                    await rulesRepo.remove(r.id);
                    await load();
                  }}
                  title="Delete rule"
                  className="p-1 rounded-lg text-text-faint hover:bg-red-500/5 hover:text-red-600 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            );
          })}
          {rules.length === 0 && (
            <span className="font-sans text-[12px] text-text-faint italic py-1">
              No rules yet. Correct a block's project three times and Vera will suggest one — or add one above.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

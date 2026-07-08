import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  Scissors,
  Merge,
  Info,
  Search,
  Clock,
  Lock,
  Code,
  FileText,
  Globe,
  MessageSquare,
  PenTool,
  RotateCcw,
} from "lucide-react";
import {
  blocksRepo,
  feedbackRepo,
  projectsRepo,
  rulesRepo,
  settingsRepo,
  isActiveProject,
  BlockStatus,
  DbWorkBlock,
  DbProjectWithClient,
} from "../lib/db";
import { recomputeDay } from "../lib/blocks";
import { assignmentEngineUnavailableReason, queueAssignment } from "../lib/assign";
import { suggestRule, RuleSuggestion } from "../lib/assignment-core";

const suggestionKey = (s: RuleSuggestion) =>
  `${s.matcher_type}|${s.pattern}|${s.project_id}`;

// A block whose assignment came from the engine (rule/LLM) and is still open
// — exactly what the per-client "confirm all" chips act on.
const isEngineSuggestion = (b: DbWorkBlock) =>
  b.status === "open" &&
  (b.assignment_source === "rule" || b.assignment_source === "llm") &&
  b.project_id !== null;
import {
  dayStartOf,
  nextDayStart,
  prevDayStart,
  formatDuration,
  formatTimeOfDay,
} from "../lib/format";
import { parseEvidenceJson, evidenceText } from "../lib/segmentation";

// How a block got its project: user, rule, or the local model (with its
// confidence). Rendered next to the project picker.
const SourceBadge: React.FC<{ block: DbWorkBlock }> = ({ block }) => {
  if (block.project_id === null || !block.assignment_source) return null;
  const label =
    block.assignment_source === "manual"
      ? "Manual"
      : block.assignment_source === "rule"
        ? "Rule"
        : `AI ${Math.round((block.confidence ?? 0) * 100)}%`;
  return (
    <span
      title={
        block.assignment_source === "manual"
          ? "Assigned by you"
          : block.assignment_source === "rule"
            ? "Assigned by one of your rules"
            : "Suggested by the local model — confirm or correct it"
      }
      className={`font-sans text-[10px] px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-wide ${
        block.assignment_source === "manual"
          ? "border-border-hairline bg-active-hover text-text-muted"
          : block.assignment_source === "rule"
            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
            : "border-sky-500/20 bg-sky-500/5 text-sky-700"
      }`}
    >
      {label}
    </span>
  );
};

function AppIcon({ appSummary }: { appSummary: string | null }) {
  const name = (appSummary || "").toLowerCase();
  const cls = "text-text-muted shrink-0";
  if (/(code|xcode|terminal|warp|iterm)/.test(name)) return <Code size={16} strokeWidth={1.5} className={cls} />;
  if (/(figma|sketch|framer|photoshop|illustrator)/.test(name)) return <PenTool size={16} strokeWidth={1.5} className={cls} />;
  if (/(slack|mail|message|discord|whatsapp|telegram)/.test(name)) return <MessageSquare size={16} strokeWidth={1.5} className={cls} />;
  if (/(safari|chrome|arc|firefox|edge|browser)/.test(name)) return <Globe size={16} strokeWidth={1.5} className={cls} />;
  return <FileText size={16} strokeWidth={1.5} className={cls} />;
}

// "Today" — the daily review: the day as a sequence of work blocks with
// confirm / assign / merge / split / discard, an evidence panel per block
// ("why does Vera think this?"), search, and day navigation.
export const DayView: React.FC = () => {
  const [dayStart, setDayStart] = useState<number>(() => dayStartOf(Date.now()));
  const [blocks, setBlocks] = useState<DbWorkBlock[]>([]);
  const [projects, setProjects] = useState<DbProjectWithClient[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState<number | null>(null);
  const [splitting, setSplitting] = useState<{ id: number; time: string; error: string | null } | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Learning loop: a one-click rule proposal after repeated matching corrections.
  const [suggestion, setSuggestion] = useState<RuleSuggestion | null>(null);
  // Why the local model is not assigning right now (Ollama offline / no model).
  const [engineHint, setEngineHint] = useState<string | null>(null);

  const isToday = dayStart === dayStartOf(Date.now());
  // Recompute is only offered where raw capture is guaranteed fresh — the
  // engine's own working window (today + yesterday). Older days keep their
  // blocks even after raw recordings expired.
  const canRefresh = dayStart >= prevDayStart(dayStartOf(Date.now()));

  // Projects change only in the Clients & Projects view (separate route, this
  // component remounts on return) — one fetch per mount is enough. Includes
  // archived so blocks assigned to a since-archived project still render it.
  useEffect(() => {
    projectsRepo
      .listWithClients(true)
      .then(setProjects)
      .catch((err) => console.error("Failed to load projects:", err));
  }, []);

  const loadBlocks = async () => {
    try {
      const b = await blocksRepo.forDay(dayStart, nextDayStart(dayStart));
      setBlocks(b);
      // The engine may have replaced rows since the user selected them —
      // drop ids that no longer exist so actions never hit stale rows.
      const ids = new Set(b.map((x) => x.id));
      setSelected((prev) => prev.filter((id) => ids.has(id)));
      setEvidenceOpen((prev) => (prev !== null && ids.has(prev) ? prev : null));
      setSplitting((prev) => (prev && ids.has(prev.id) ? prev : null));
      setEngineHint(assignmentEngineUnavailableReason());
      setLoaded(true);
    } catch (err) {
      console.error("Failed to load day blocks:", err);
      setLoaded(true);
    }
  };

  useEffect(() => {
    setLoaded(false);
    setSelected([]);
    setEvidenceOpen(null);
    setSplitting(null);
    loadBlocks();
    const onBlocksUpdated = () => loadBlocks();
    window.addEventListener("blocks-updated", onBlocksUpdated);
    return () => window.removeEventListener("blocks-updated", onBlocksUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStart]);

  const search = searchInput.trim().toLowerCase();
  const matchesSearch = (b: DbWorkBlock) =>
    !search ||
    (b.title_summary || "").toLowerCase().includes(search) ||
    (b.app_summary || "").toLowerCase().includes(search) ||
    evidenceText(parseEvidenceJson(b.evidence)).includes(search);

  const active = blocks.filter((b) => b.status !== "discarded" && matchesSearch(b));
  const discarded = blocks.filter((b) => b.status === "discarded" && matchesSearch(b));

  const clientOf = (b: DbWorkBlock): { id: number; name: string } | null => {
    if (b.project_id === null) return null;
    const p = projects.find((x) => x.id === b.project_id);
    return p ? { id: p.client_id, name: p.client_name } : null;
  };

  // "Unassigned" first — that is where review attention belongs.
  const unassigned = active.filter((b) => b.project_id === null);
  const assigned = active.filter((b) => b.project_id !== null);

  // Per-client bulk confirmation of engine suggestions, grouped by client ID
  // (names are not unique — an archived and a re-created client may share one).
  const confirmableClients = (() => {
    const counts = new Map<number, { name: string; count: number }>();
    for (const b of active) {
      if (!isEngineSuggestion(b)) continue;
      const client = clientOf(b);
      if (!client) continue;
      const entry = counts.get(client.id) ?? { name: client.name, count: 0 };
      entry.count++;
      counts.set(client.id, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  })();

  // Merging is only meaningful for a consecutive run of blocks — otherwise
  // the merged block would span (and double-count) unselected time between.
  const selectionIsAdjacent = useMemo(() => {
    if (selected.length < 2) return false;
    const indices = selected
      .map((id) => active.findIndex((b) => b.id === id))
      .sort((a, b) => a - b);
    if (indices[0] < 0) return false;
    return indices[indices.length - 1] - indices[0] === indices.length - 1;
  }, [selected, active]);

  const totals = useMemo(() => {
    const sum = (list: DbWorkBlock[]) =>
      list.reduce((acc, b) => acc + (b.ended_at - b.started_at), 0);
    return {
      captured: sum(blocks.filter((b) => b.status !== "discarded")),
      confirmed: sum(blocks.filter((b) => b.status === "confirmed")),
    };
  }, [blocks]);

  const dayLabel = new Date(dayStart).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const refresh = async () => {
    try {
      await recomputeDay(dayStart);
      await loadBlocks();
    } catch (err) {
      console.error("Failed to recompute day:", err);
    }
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const setBlockStatus = async (id: number, status: BlockStatus) => {
    await blocksRepo.setStatus(id, status);
    await loadBlocks();
  };

  const handleAssign = async (id: number, value: string) => {
    const projectId = value === "" ? null : Number(value);
    const block = blocks.find((b) => b.id === id);
    // A recompute may have replaced this row while the picker was open — the
    // repo tells us whether the assignment actually landed; phantom
    // corrections must never become feedback or rule-suggestion counts.
    const applied = await blocksRepo.assignProject(id, projectId);
    if (applied && projectId !== null && block) {
      try {
        await feedbackRepo.add(block.evidence || "{}", projectId);
        const [feedback, rules, dismissed] = await Promise.all([
          feedbackRepo.recent(),
          rulesRepo.list(),
          settingsRepo.getDismissedSuggestions(),
        ]);
        const s = suggestRule(feedback, rules, {
          evidence: parseEvidenceJson(block.evidence),
          project_id: projectId,
        });
        setSuggestion(s && !dismissed.includes(suggestionKey(s)) ? s : null);
      } catch (err) {
        console.error("Failed to record assignment feedback:", err);
      }
    }
    await loadBlocks();
  };

  const acceptSuggestion = async () => {
    if (!suggestion) return;
    try {
      await rulesRepo.add(suggestion.matcher_type, suggestion.pattern, suggestion.project_id, "suggestion");
      setSuggestion(null);
      // Assignment (not segmentation) applies the rule — this also works on
      // days whose raw capture has already expired.
      await queueAssignment(dayStart, nextDayStart(dayStart));
      await loadBlocks();
    } catch (err) {
      console.error("Failed to create suggested rule:", err);
    }
  };

  const dismissSuggestion = async () => {
    if (!suggestion) return;
    const key = suggestionKey(suggestion);
    setSuggestion(null);
    try {
      await settingsRepo.addDismissedSuggestion(key); // never re-nag this combo
    } catch (err) {
      console.error("Failed to persist dismissed suggestion:", err);
    }
  };

  const confirmAllForClient = async (clientId: number) => {
    const targets = active.filter(
      (b) => isEngineSuggestion(b) && clientOf(b)?.id === clientId
    );
    for (const b of targets) {
      await blocksRepo.setStatus(b.id, "confirmed");
    }
    await loadBlocks();
  };

  const handleMerge = async () => {
    if (!selectionIsAdjacent) return;
    await blocksRepo.merge(selected);
    setSelected([]);
    await loadBlocks();
  };

  const openSplit = (b: DbWorkBlock) => {
    setSplitting({
      id: b.id,
      time: formatTimeOfDay((b.started_at + b.ended_at) / 2),
      error: null,
    });
  };

  const handleSplit = async (b: DbWorkBlock) => {
    if (!splitting) return;
    const [hh, mm] = splitting.time.split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) return;
    // Wall-clock → epoch via Date, so DST-transition days stay correct.
    const d = new Date(dayStart);
    d.setHours(hh, mm, 0, 0);
    const atMs = d.getTime();
    if (atMs <= b.started_at || atMs >= b.ended_at) {
      setSplitting({ ...splitting, error: "Time must be inside the block." });
      return;
    }
    await blocksRepo.split(splitting.id, atMs);
    setSplitting(null);
    await loadBlocks();
  };

  // Picker options: every active project, plus the (archived) project a block
  // is currently assigned to — so archiving never masks an assignment.
  const optionsForBlock = (b: DbWorkBlock): DbProjectWithClient[] => {
    const activeProjects = projects.filter(isActiveProject);
    if (b.project_id !== null && !activeProjects.some((p) => p.id === b.project_id)) {
      const assigned = projects.find((p) => p.id === b.project_id);
      if (assigned) return [...activeProjects, assigned];
    }
    return activeProjects;
  };

  const projectLabel = (p: DbProjectWithClient) =>
    `${p.client_name} — ${p.name}${p.archived || p.client_archived ? " (archived)" : ""}`;

  const renderBlock = (b: DbWorkBlock) => {
    const evidence = parseEvidenceJson(b.evidence);
    const isSelected = selected.includes(b.id);
    const confirmed = b.status === "confirmed";
    return (
      <div
        key={b.id}
        className={`card-style px-4 py-3 flex flex-col gap-2 ${isSelected ? "border-text-primary" : ""}`}
      >
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelected(b.id)}
            title="Select for merging"
            className="cursor-pointer w-3.5 h-3.5 accent-text-primary shrink-0"
          />
          <div className="flex flex-col min-w-[96px] shrink-0">
            <span className="font-sans text-[12px] text-text-muted tabular-nums">
              {formatTimeOfDay(b.started_at)} – {formatTimeOfDay(b.ended_at)}
            </span>
            <span className="font-sans text-[11px] text-text-faint tabular-nums">
              {formatDuration(b.ended_at - b.started_at)}
            </span>
          </div>
          <AppIcon appSummary={b.app_summary} />
          <div className="flex-1 min-w-0 flex flex-col">
            <span className="font-sans text-[13px] text-text-primary font-medium truncate">
              {b.title_summary || "Untitled block"}
            </span>
            <span className="font-sans text-[11px] text-text-faint truncate">{b.app_summary}</span>
          </div>

          {/* Project assignment + how it was assigned */}
          <SourceBadge block={b} />
          <select
            value={b.project_id ?? ""}
            onChange={(e) => handleAssign(b.id, e.target.value)}
            className={`max-w-[220px] px-2 py-1.5 border border-border-hairline rounded-lg font-sans text-[12px] outline-none cursor-pointer bg-card-surface ${
              b.project_id === null ? "text-text-faint" : "text-text-primary"
            }`}
          >
            <option value="">Unassigned</option>
            {optionsForBlock(b).map((p) => (
              <option key={p.id} value={p.id}>
                {projectLabel(p)}
              </option>
            ))}
          </select>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEvidenceOpen(evidenceOpen === b.id ? null : b.id)}
              title="Why does Vera think this?"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                evidenceOpen === b.id ? "bg-active-hover text-text-primary" : "text-text-muted hover:bg-active-hover hover:text-text-primary"
              }`}
            >
              <Info size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => openSplit(b)}
              title="Split block"
              className="p-1.5 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              <Scissors size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setBlockStatus(b.id, "discarded")}
              title="Discard (not work time)"
              className="p-1.5 rounded-lg text-text-muted hover:bg-red-500/5 hover:text-red-600 transition-colors cursor-pointer"
            >
              <Trash2 size={15} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setBlockStatus(b.id, confirmed ? "open" : "confirmed")}
              title={confirmed ? "Confirmed — click to reopen" : "Confirm block"}
              className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg font-sans text-[12px] font-medium transition-all cursor-pointer ${
                confirmed
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                  : "border-border-hairline text-text-muted hover:text-text-primary hover:bg-active-hover"
              }`}
            >
              <Check size={13} strokeWidth={2} />
              {confirmed ? "Confirmed" : "Confirm"}
            </button>
          </div>
        </div>

        {/* Split input */}
        {splitting?.id === b.id && (
          <div className="flex flex-col gap-1.5 pl-8 pt-1 border-t border-border-hairline mt-1">
            <div className="flex items-center gap-2">
              <span className="font-sans text-[12px] text-text-muted">Split at</span>
              <input
                type="time"
                value={splitting.time}
                onChange={(e) => setSplitting({ id: b.id, time: e.target.value, error: null })}
                className="px-2 py-1 border border-border-hairline rounded-lg font-sans text-[12px] bg-card-surface"
              />
              <button
                onClick={() => handleSplit(b)}
                className="px-3 py-1 rounded-lg bg-text-primary text-card-surface font-sans text-[12px] font-medium cursor-pointer"
              >
                Split
              </button>
              <button
                onClick={() => setSplitting(null)}
                className="px-2 py-1 rounded-lg font-sans text-[12px] text-text-muted hover:bg-active-hover cursor-pointer"
              >
                Cancel
              </button>
            </div>
            {splitting.error && (
              <span className="font-sans text-[12px] text-red-600">{splitting.error}</span>
            )}
          </div>
        )}

        {/* Evidence panel */}
        {evidenceOpen === b.id && (
          <div className="flex flex-col gap-2 pl-8 pt-2 border-t border-border-hairline mt-1">
            {evidence.titles.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">Windows & documents</span>
                <div className="flex flex-wrap gap-1.5">
                  {evidence.titles.map((t) => (
                    <span key={t} className="font-sans text-[11px] px-2 py-0.5 rounded bg-active-hover text-text-muted border border-border-hairline max-w-[320px] truncate">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {evidence.domains.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">Domains</span>
                <div className="flex flex-wrap gap-1.5">
                  {evidence.domains.map((d) => (
                    <span key={d} className="font-sans text-[11px] px-2 py-0.5 rounded bg-active-hover text-text-muted border border-border-hairline">{d}</span>
                  ))}
                </div>
              </div>
            )}
            {evidence.terms.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">Seen on screen</span>
                <div className="flex flex-wrap gap-1.5">
                  {evidence.terms.map((t) => (
                    <span key={t} className="font-sans text-[11px] px-2 py-0.5 rounded bg-active-hover text-text-faint border border-border-hairline">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {evidence.titles.length === 0 && evidence.domains.length === 0 && evidence.terms.length === 0 && (
              <span className="font-sans text-[12px] text-text-faint italic">No evidence recorded for this block.</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-5 px-8 pb-16 mt-8 select-none">
      {/* Header: day navigation + totals */}
      <div className="flex items-end justify-between border-b border-border-hairline pb-4 gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
            {isToday ? "Today" : dayLabel}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDayStart(prevDayStart(dayStart))}
              title="Previous day"
              className="p-1 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <span className="font-sans text-[13px] text-text-muted min-w-[170px] text-center">{dayLabel}</span>
            <button
              onClick={() => setDayStart(nextDayStart(dayStart))}
              disabled={isToday}
              title="Next day"
              className="p-1 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            {!isToday && (
              <button
                onClick={() => setDayStart(dayStartOf(Date.now()))}
                className="px-2.5 py-1 rounded-lg border border-border-hairline font-sans text-[12px] text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
              >
                Today
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 pb-1">
          <div className="flex flex-col items-end">
            <span className="font-serif text-[22px] text-text-primary tabular-nums">{formatDuration(totals.captured)}</span>
            <span className="font-sans text-[11px] text-text-faint uppercase tracking-wider">Captured</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-serif text-[22px] text-emerald-600 tabular-nums">{formatDuration(totals.confirmed)}</span>
            <span className="font-sans text-[11px] text-text-faint uppercase tracking-wider">Confirmed</span>
          </div>
          {canRefresh && (
            <button
              onClick={refresh}
              title="Recompute this day from raw capture"
              className="p-2 rounded-lg border border-border-hairline text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
            >
              <RotateCcw size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Search + merge bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-card-surface border border-border-hairline rounded-xl">
          <Search size={14} strokeWidth={1.5} className="text-text-faint shrink-0" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search blocks (titles, domains, screen text)…"
            className="flex-1 bg-transparent font-sans text-[13px] text-text-primary outline-none placeholder:text-text-faint"
          />
        </div>
        {selected.length >= 2 && (
          <button
            onClick={handleMerge}
            disabled={!selectionIsAdjacent}
            title={selectionIsAdjacent ? "Merge the selected blocks" : "Only consecutive blocks can be merged"}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-text-primary text-card-surface font-sans text-[12px] font-medium cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-default"
          >
            <Merge size={14} strokeWidth={1.5} />
            {selectionIsAdjacent ? `Merge ${selected.length} blocks` : "Select consecutive blocks"}
          </button>
        )}
      </div>

      {/* Rule suggestion (learning loop) */}
      {suggestion && (
        <div className="card-style px-4 py-3 flex items-center gap-3 border-emerald-500/30">
          <span className="flex-1 font-sans text-[13px] text-text-primary">
            Always assign <strong>{suggestion.pattern}</strong> to{" "}
            <strong>
              {(() => {
                const p = projects.find((x) => x.id === suggestion.project_id);
                return p ? projectLabel(p) : "this project";
              })()}
            </strong>
            ? You corrected this {""}
            {suggestion.matcher_type === "domain" ? "domain" : "app"} three times.
          </span>
          <button
            onClick={acceptSuggestion}
            className="px-3 py-1.5 rounded-lg bg-text-primary text-card-surface font-sans text-[12px] font-medium cursor-pointer"
          >
            Create rule
          </button>
          <button
            onClick={dismissSuggestion}
            className="px-2 py-1.5 rounded-lg font-sans text-[12px] text-text-muted hover:bg-active-hover cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Local model unavailable → blocks stay unassigned */}
      {engineHint && unassigned.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
          <span className="font-sans text-[12.5px] text-amber-800">
            {engineHint} Until then, new blocks stay unassigned.
          </span>
        </div>
      )}

      {/* Per-client bulk confirmation of engine suggestions */}
      {confirmableClients.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-[12px] text-text-faint">Confirm all suggestions:</span>
          {confirmableClients.map(([clientId, entry]) => (
            <button
              key={clientId}
              onClick={() => confirmAllForClient(clientId)}
              className="px-2.5 py-1 rounded-lg border border-emerald-500/25 bg-emerald-500/5 font-sans text-[12px] text-emerald-700 hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              {entry.name} ({entry.count})
            </button>
          ))}
        </div>
      )}

      {/* Blocks */}
      {loaded && active.length === 0 && (
        <div className="card-style px-8 py-14 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">
            <Clock size={20} strokeWidth={1.5} />
          </div>
          <h2 className="font-serif text-[20px] text-text-primary tracking-tight">
            {search
              ? "No blocks match your search."
              : isToday
                ? "No work blocks yet today."
                : "No work blocks for this day."}
          </h2>
          {!search && isToday && (
            <p className="font-sans text-[13px] text-text-muted leading-relaxed max-w-[420px]">
              Vera builds blocks from your captured activity every 15 minutes.
              Work a little — or hit the refresh arrow above — and your day
              shows up here.
            </p>
          )}
          {!search && !isToday && (
            <p className="font-sans text-[13px] text-text-muted leading-relaxed max-w-[420px]">
              Nothing was captured for this day, or its blocks were discarded.
            </p>
          )}
        </div>
      )}

      {/* Unassigned first — that's where review attention belongs */}
      {unassigned.length > 0 && assigned.length > 0 && (
        <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">
          Unassigned ({unassigned.length})
        </span>
      )}
      <div className="flex flex-col gap-2">{unassigned.map(renderBlock)}</div>
      {unassigned.length > 0 && assigned.length > 0 && (
        <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase mt-2">
          Assigned ({assigned.length})
        </span>
      )}
      <div className="flex flex-col gap-2">{assigned.map(renderBlock)}</div>

      {/* Discarded */}
      {discarded.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={() => setShowDiscarded(!showDiscarded)}
            className="self-start font-sans text-[12px] text-text-faint hover:text-text-muted transition-colors cursor-pointer"
          >
            {showDiscarded ? "Hide" : "Show"} {discarded.length} discarded block{discarded.length > 1 ? "s" : ""}
          </button>
          {showDiscarded &&
            discarded.map((b) => (
              <div key={b.id} className="card-style px-4 py-2.5 flex items-center gap-3 opacity-60">
                <span className="font-sans text-[12px] text-text-muted tabular-nums min-w-[96px]">
                  {formatTimeOfDay(b.started_at)} – {formatTimeOfDay(b.ended_at)}
                </span>
                <span className="flex-1 font-sans text-[13px] text-text-muted truncate line-through">
                  {b.title_summary || "Untitled block"}
                </span>
                <button
                  onClick={() => setBlockStatus(b.id, "open")}
                  className="px-2.5 py-1 border border-border-hairline rounded-lg font-sans text-[12px] text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
                >
                  Restore
                </button>
              </div>
            ))}
        </div>
      )}

      <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-faint mt-2">
        <Lock size={12} strokeWidth={1.5} />
        Built on this Mac from your local capture · raw recordings expire, blocks and their evidence remain · not a single byte leaves your device
      </span>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Check,
  Trash2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Lock,
} from "lucide-react";
import {
  blocksRepo,
  entriesRepo,
  projectsRepo,
  isEngineSuggestion,
  projectLabel,
  DbProjectWithClient,
  DbTimeEntry,
  DbWorkBlock,
} from "../lib/db";
import { generateEntriesForDay, regenerateNarrative } from "../lib/narratives";
import { entryDateOf } from "../lib/narrative-core";
import { effectiveRateCents, amountCents } from "../lib/billing-core";
import {
  nextDayStart,
  formatDayLabel,
  formatDuration,
  formatTimeOfDay,
  formatEuroFromCents,
} from "../lib/format";

interface DailyCloseProps {
  dayStart: number;
  onDone: () => void; // close the overlay (after finishing or cancelling)
}

// The daily close — the product's core ritual, designed for under 5 minutes:
//  1. sweep the day's open blocks (confirm / discard),
//  2. review the generated narrative per project (edit = future style example),
//  3. see hours + money, close the day.
export const DailyClose: React.FC<DailyCloseProps> = ({ dayStart, onDone }) => {
  const dayEnd = nextDayStart(dayStart);
  const entryDate = entryDateOf(dayStart);

  const [step, setStep] = useState(1);
  const [blocks, setBlocks] = useState<DbWorkBlock[]>([]);
  const [projects, setProjects] = useState<DbProjectWithClient[]>([]);
  const [entries, setEntries] = useState<DbTimeEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [engineHint, setEngineHint] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [narrativeDrafts, setNarrativeDrafts] = useState<Record<number, string>>({});
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  const loadBlocks = async () => {
    try {
      setBlocks(await blocksRepo.forDay(dayStart, dayEnd));
    } catch (err) {
      console.error("Failed to load daily-close blocks:", err);
    }
  };

  // Projects can't change while this overlay is open — one fetch is enough.
  useEffect(() => {
    projectsRepo
      .listWithClients(true)
      .then(setProjects)
      .catch((err) => console.error("Failed to load daily-close projects:", err));
  }, []);

  useEffect(() => {
    loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStart]);

  const openBlocks = blocks.filter((b) => b.status === "open");
  const confirmedUnassigned = blocks.filter((b) => b.status === "confirmed" && b.project_id === null);
  const suggested = blocks.filter(isEngineSuggestion);

  const projectOf = (id: number) => projects.find((p) => p.id === id);
  const labelOf = (id: number) => {
    const p = projectOf(id);
    return p ? projectLabel(p) : `project #${id}`;
  };
  // null = billable but unpriced (nudge to set a rate); non-billable projects
  // are deliberate and must not be counted as "missing a rate".
  const rateCentsOf = (id: number): number | null => {
    const p = projectOf(id);
    return p ? effectiveRateCents(p) : null;
  };
  const isBillable = (id: number): boolean => projectOf(id)?.billable === 1;
  const centsFor = (e: DbTimeEntry): number | null => {
    const rate = rateCentsOf(e.project_id);
    return rate === null ? null : amountCents(e.rounded_minutes, rate);
  };

  // Every block write is announced so the TopBar anchor (and DayView behind
  // this overlay) stay live.
  const notifyBlocksUpdated = () => window.dispatchEvent(new CustomEvent("blocks-updated"));

  const setBlockStatus = async (id: number, status: "confirmed" | "discarded" | "open") => {
    await blocksRepo.setStatus(id, status);
    notifyBlocksUpdated();
    await loadBlocks();
  };

  const confirmAllSuggested = async () => {
    await blocksRepo.setStatusMany(
      suggested.map((b) => b.id),
      "confirmed"
    );
    notifyBlocksUpdated();
    await loadBlocks();
  };

  const goToReview = async () => {
    setStep(2);
    setGenerating(true);
    try {
      const result = await generateEntriesForDay(dayStart);
      setEntries(result.entries);
      setEngineHint(result.engineHint);
      setUsedFallback(result.usedFallback);
      setNarrativeDrafts(Object.fromEntries(result.entries.map((e) => [e.id, e.narrative])));
    } catch (err) {
      console.error("Failed to generate entries:", err);
    } finally {
      setGenerating(false);
    }
  };

  const saveNarrative = async (entry: DbTimeEntry) => {
    const text = (narrativeDrafts[entry.id] ?? "").trim();
    if (!text) {
      // An emptied textarea must not silently keep the old text in the DB —
      // restore it visibly instead.
      setNarrativeDrafts((prev) => ({ ...prev, [entry.id]: entry.narrative }));
      return;
    }
    if (text === entry.narrative) return;
    try {
      await entriesRepo.updateNarrative(entry.id, text);
      setEntries(await entriesRepo.forDate(entryDate));
    } catch (err) {
      console.error("Failed to save narrative:", err);
    }
  };

  const handleRegenerate = async (entry: DbTimeEntry) => {
    setRegenerating(entry.id);
    try {
      // null = model unavailable/failed → keep the existing text. The write
      // is a machine write: it must NOT mark the entry user-edited (that
      // would poison the style examples and freeze the entry).
      const text = await regenerateNarrative(entry);
      if (text) {
        setNarrativeDrafts((prev) => ({ ...prev, [entry.id]: text }));
        await entriesRepo.setNarrative(entry.id, text);
        setEntries(await entriesRepo.forDate(entryDate));
      }
    } catch (err) {
      console.error("Failed to regenerate narrative:", err);
    } finally {
      setRegenerating(null);
    }
  };

  const closeDay = async () => {
    try {
      await entriesRepo.setStatusForDate(entryDate, "draft", "confirmed");
      setClosed(true);
      window.dispatchEvent(new CustomEvent("entries-updated"));
    } catch (err) {
      console.error("Failed to close the day:", err);
    }
  };

  const totals = useMemo(() => {
    let minutes = 0;
    let cents = 0;
    let unpriced = 0; // billable projects WITHOUT a rate — not non-billable ones
    for (const e of entries) {
      minutes += e.rounded_minutes;
      const entryCents = centsFor(e);
      if (entryCents !== null) {
        cents += entryCents;
      } else if (isBillable(e.project_id)) {
        unpriced++;
      }
    }
    return { minutes, cents, unpriced };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, projects]);

  const dayLabel = formatDayLabel(dayStart);

  return (
    <div className="fixed inset-0 z-50 bg-bg-warm flex flex-col items-center overflow-y-auto py-10 select-none">
      <div className="w-full max-w-[760px] flex flex-col gap-6 px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="font-serif text-[32px] font-normal text-text-primary tracking-tight">
              Close the day
            </h1>
            <span className="font-sans text-[13px] text-text-muted">{dayLabel}</span>
          </div>
          <button
            onClick={onDone}
            title="Close"
            className="p-2 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Step 1 — sweep open blocks */}
        {step === 1 && !closed && (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-[14px] text-text-muted leading-relaxed">
              Confirm what was real work, discard what wasn't. Confirmed blocks
              with a project become billing entries in the next step.
            </p>

            {suggested.length > 0 && (
              <button
                onClick={confirmAllSuggested}
                className="self-start flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 font-sans text-[12px] text-emerald-700 hover:bg-emerald-500/10 transition-colors cursor-pointer"
              >
                <Check size={13} strokeWidth={2} />
                Confirm all {suggested.length} suggested assignments
              </button>
            )}

            {openBlocks.length === 0 && (
              <div className="card-style px-6 py-8 text-center">
                <span className="font-sans text-[14px] text-text-muted">
                  No open blocks left — everything is reviewed.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {openBlocks.map((b) => (
                <div key={b.id} className="card-style px-4 py-2.5 flex items-center gap-3">
                  <span className="font-sans text-[12px] text-text-muted tabular-nums min-w-[92px]">
                    {formatTimeOfDay(b.started_at)} – {formatTimeOfDay(b.ended_at)}
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="font-sans text-[13px] text-text-primary truncate">
                      {b.title_summary || "Untitled block"}
                    </span>
                    <span className="font-sans text-[11px] text-text-faint truncate">
                      {b.project_id !== null ? labelOf(b.project_id) : "Unassigned"}
                      {" · "}
                      {formatDuration(b.ended_at - b.started_at)}
                    </span>
                  </div>
                  <button
                    onClick={() => setBlockStatus(b.id, "discarded")}
                    title="Discard (not work time)"
                    className="p-1.5 rounded-lg text-text-muted hover:bg-red-500/5 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => setBlockStatus(b.id, "confirmed")}
                    className="flex items-center gap-1 px-2.5 py-1.5 border border-border-hairline rounded-lg font-sans text-[12px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
                  >
                    <Check size={13} strokeWidth={2} />
                    Confirm
                  </button>
                </div>
              ))}
            </div>

            {confirmedUnassigned.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                <span className="font-sans text-[12.5px] text-amber-800">
                  {confirmedUnassigned.length} confirmed block
                  {confirmedUnassigned.length > 1 ? "s have" : " has"} no project and will be
                  skipped — assign {confirmedUnassigned.length > 1 ? "them" : "it"} in the Today
                  view to bill {confirmedUnassigned.length > 1 ? "them" : "it"}.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Step 2 — review narratives */}
        {step === 2 && !closed && (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-[14px] text-text-muted leading-relaxed">
              One entry per project. Edit any narrative — Vera learns your voice
              from your edits.
            </p>

            {generating && (
              <div className="card-style px-6 py-10 flex flex-col items-center gap-3">
                <Sparkles size={20} strokeWidth={1.5} className="text-text-muted animate-pulse" />
                <span className="font-serif text-[16px] text-text-muted italic animate-pulse">
                  Writing your narratives locally…
                </span>
              </div>
            )}

            {!generating && (engineHint || usedFallback) && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                <span className="font-sans text-[12.5px] text-amber-800">
                  {engineHint ?? "The local model was unavailable for some entries."} Plain
                  evidence-based drafts were used — edit them or regenerate later.
                </span>
              </div>
            )}

            {!generating && entries.length === 0 && (
              <div className="card-style px-6 py-8 text-center">
                <span className="font-sans text-[14px] text-text-muted">
                  No billable entries — no confirmed blocks with a project yet.
                </span>
              </div>
            )}

            {!generating &&
              entries.map((e) => (
                <div key={e.id} className="card-style px-5 py-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-sans text-[13px] font-medium text-text-primary flex-1 truncate">
                      {labelOf(e.project_id)}
                    </span>
                    <span className="font-sans text-[12px] text-text-faint tabular-nums">
                      {formatDuration(e.minutes * 60000)}
                      {e.rounded_minutes !== e.minutes && (
                        <> → <span className="text-text-primary">{formatDuration(e.rounded_minutes * 60000)}</span></>
                      )}
                    </span>
                    {e.status !== "draft" && (
                      <span className="font-sans text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 uppercase tracking-wide">
                        {e.status}
                      </span>
                    )}
                    {e.status === "draft" && (
                      <button
                        onClick={() => handleRegenerate(e)}
                        disabled={regenerating !== null}
                        title="Regenerate this narrative"
                        className={`p-1.5 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer ${
                          regenerating === e.id ? "animate-spin" : ""
                        } disabled:opacity-40`}
                      >
                        <RotateCcw size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                  {/* Confirmed/exported entries are the billing record — read-only. */}
                  <textarea
                    value={narrativeDrafts[e.id] ?? e.narrative}
                    onChange={(ev) =>
                      setNarrativeDrafts((prev) => ({ ...prev, [e.id]: ev.target.value }))
                    }
                    onBlur={() => saveNarrative(e)}
                    disabled={e.status !== "draft"}
                    rows={2}
                    className="w-full px-3 py-2 bg-bg-warm border border-border-hairline rounded-xl font-sans text-[13px] text-text-primary outline-none focus:border-text-muted resize-y leading-relaxed disabled:opacity-60 disabled:resize-none"
                  />
                </div>
              ))}
          </div>
        )}

        {/* Step 3 — totals + close */}
        {step === 3 && !closed && (
          <div className="flex flex-col gap-4">
            <div className="card-style px-6 py-5 flex flex-col gap-3">
              {entries.map((e) => {
                const entryCents = centsFor(e);
                return (
                  <div key={e.id} className="flex items-center gap-3">
                    <span className="flex-1 font-sans text-[13px] text-text-primary truncate">
                      {labelOf(e.project_id)}
                      {!isBillable(e.project_id) && (
                        <span className="text-text-faint"> · non-billable</span>
                      )}
                    </span>
                    <span className="font-sans text-[13px] text-text-muted tabular-nums">
                      {formatDuration(e.rounded_minutes * 60000)}
                    </span>
                    <span className="font-sans text-[13px] text-text-primary tabular-nums min-w-[80px] text-right">
                      {entryCents !== null ? formatEuroFromCents(entryCents) : "—"}
                    </span>
                  </div>
                );
              })}
              <div className="h-px bg-border-hairline w-full" />
              <div className="flex items-center gap-3">
                <span className="flex-1 font-serif text-[17px] text-text-primary">Total</span>
                <span className="font-serif text-[17px] text-text-primary tabular-nums">
                  {formatDuration(totals.minutes * 60000)}
                </span>
                <span className="font-serif text-[17px] text-emerald-600 tabular-nums min-w-[80px] text-right">
                  {formatEuroFromCents(totals.cents)}
                </span>
              </div>
              {totals.unpriced > 0 && (
                <span className="font-sans text-[12px] text-text-faint">
                  {totals.unpriced} entr{totals.unpriced > 1 ? "ies" : "y"} without a rate — set
                  rates in Clients & Projects to price them.
                </span>
              )}
            </div>
            <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-faint">
              <Lock size={12} strokeWidth={1.5} />
              Written locally by your model · not a single byte leaves your device
            </span>
          </div>
        )}

        {/* Closed! */}
        {closed && (
          <div className="card-style px-8 py-14 flex flex-col items-center text-center gap-3">
            <span className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <Check size={22} strokeWidth={2} />
            </span>
            <h2 className="font-serif text-[24px] text-text-primary tracking-tight">Day closed.</h2>
            <p className="font-sans text-[14px] text-text-muted max-w-[380px] leading-relaxed">
              {formatDuration(totals.minutes * 60000)}
              {totals.cents > 0 ? ` · ${formatEuroFromCents(totals.cents)}` : ""} confirmed and
              ready for export.
            </p>
            <button
              onClick={onDone}
              className="mt-2 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {/* Footer nav */}
        {!closed && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                    s === step ? "bg-text-primary scale-125" : "bg-border-hairline"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={() => setStep(step - 1)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-hairline font-sans text-[13px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer disabled:opacity-40"
                >
                  <ArrowLeft size={14} strokeWidth={1.5} />
                  Back
                </button>
              )}
              {step === 1 && (
                <button
                  onClick={goToReview}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer"
                >
                  Generate entries
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={() => setStep(3)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
                >
                  Review totals
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              )}
              {step === 3 && (
                <button
                  onClick={closeDay}
                  disabled={entries.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
                >
                  <Check size={14} strokeWidth={2} />
                  Close the day
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

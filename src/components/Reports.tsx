import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Image,
  Info,
  Lock,
} from "lucide-react";
import {
  blocksRepo,
  entriesRepo,
  projectsRepo,
  DbProjectWithClient,
  DbTimeEntry,
} from "../lib/db";
import {
  aggregateEntries,
  recoveredTimeMs,
  monthRangeOf,
  weekRangeOf,
  shiftRange,
  RECOVERED_TIME_DEFINITION,
  RecoveredBlockLike,
  ReportRange,
} from "../lib/reports-core";
import { buildExportRows, exportAdapters } from "../lib/export";
import { currentEntitlement } from "../lib/license";
import { entryDateOf } from "../lib/narrative-core";
import { prevDayStart, formatDuration, formatEuroFromCents } from "../lib/format";

type RangeMode = "week" | "month";

type ExportState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; path: string; marked: number }
  | { status: "error"; message: string };

const monthLabel = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shortDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// "Reports" — the value made visible: confirmed hours and € per client,
// utilization, unbilled time, and the headline metric "recovered time".
// Everything is computed from local data; export goes through the adapter
// registry (CSV / Toggl / Harvest) and a native save dialog.
export const Reports: React.FC = () => {
  const [mode, setMode] = useState<RangeMode>("week");
  const [range, setRange] = useState<ReportRange>(() => weekRangeOf(Date.now()));
  const [entries, setEntries] = useState<DbTimeEntry[]>([]);
  const [blocks, setBlocks] = useState<RecoveredBlockLike[]>([]);
  const [projects, setProjects] = useState<DbProjectWithClient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adapterId, setAdapterId] = useState(exportAdapters[0].id);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [showDefinition, setShowDefinition] = useState(false);
  // Monotonic load id: a slow response for an old range must never clobber a
  // newer one (fast prev/next clicks, or an update event mid-navigation).
  const loadSeq = useRef(0);

  const fromDate = entryDateOf(range.startMs);
  const toDate = entryDateOf(prevDayStart(range.endMs)); // forRange is inclusive

  const load = async () => {
    const seq = ++loadSeq.current;
    try {
      const [e, b, p] = await Promise.all([
        entriesRepo.forRange(fromDate, toDate),
        blocksRepo.confirmedInRange(range.startMs, range.endMs),
        projectsRepo.listWithClients(true),
      ]);
      if (seq !== loadSeq.current) return; // superseded by a newer range/reload
      setEntries(e);
      setBlocks(b);
      setProjects(p);
      setLoaded(true);
    } catch (err) {
      console.error("Failed to load report data:", err);
      if (seq === loadSeq.current) setLoaded(true);
    }
  };

  useEffect(() => {
    setLoaded(false);
    setExportState({ status: "idle" });
    load();
    // Engine passes and daily-close writes fire these; coalesce a burst
    // (startup backfill) into one trailing reload.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdated = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    };
    window.addEventListener("entries-updated", onUpdated);
    window.addEventListener("blocks-updated", onUpdated);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("entries-updated", onUpdated);
      window.removeEventListener("blocks-updated", onUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.startMs, range.endMs]);

  const { clients, totals } = useMemo(
    () => aggregateEntries(entries, projects),
    [entries, projects]
  );
  const recoveredMs = useMemo(() => recoveredTimeMs(blocks), [blocks]);

  const switchMode = (m: RangeMode) => {
    setMode(m);
    setRange(m === "week" ? weekRangeOf(Date.now()) : monthRangeOf(Date.now()));
  };

  const isCurrent =
    range.startMs ===
    (mode === "week" ? weekRangeOf(Date.now()).startMs : monthRangeOf(Date.now()).startMs);

  const rangeLabel =
    mode === "month"
      ? monthLabel(range.startMs)
      : `${shortDay(range.startMs)} – ${shortDay(prevDayStart(range.endMs))}`;

  const handleExport = async () => {
    const adapter = exportAdapters.find((a) => a.id === adapterId);
    if (!adapter) return;
    setExportState({ status: "working" });
    try {
      // Billing-format export is the paid feature. The full-data backup in the
      // profile menu stays free — your data is always yours.
      const ent = await currentEntitlement();
      if (!ent.entitled) {
        setExportState({
          status: "error",
          message:
            ent.status === "trial_expired"
              ? "Your trial has ended. Add a license in Settings to export billing files."
              : "Your license has lapsed. Renew it in Settings to export billing files.",
        });
        return;
      }
      const rows = buildExportRows(entries, projects);
      if (rows.length === 0) {
        setExportState({ status: "error", message: "No confirmed entries in this period." });
        return;
      }
      const path = await save({
        title: "Export time entries",
        defaultPath: `vera-${adapter.id}-${fromDate}-to-${toDate}.${adapter.extension}`,
        filters: [{ name: "CSV", extensions: [adapter.extension] }],
      });
      if (!path) {
        setExportState({ status: "idle" }); // cancelled
        return;
      }
      await invoke("write_text_file_at", { path, contents: adapter.serialize(rows) });
      // Only after the file is really on disk: mark exactly the confirmed rows
      // that went INTO the file (derived from the serialized rows, so the
      // mark set can never drift from the file content).
      const confirmedIds = rows.filter((r) => r.status === "confirmed").map((r) => r.id);
      await entriesRepo.markExported(confirmedIds);
      window.dispatchEvent(new CustomEvent("entries-updated"));
      setExportState({ status: "done", path, marked: confirmedIds.length });
    } catch (err: any) {
      setExportState({
        status: "error",
        message: typeof err === "string" ? err : err?.message || String(err),
      });
    }
  };

  // The shareable PNG — a clean stat card drawn on a canvas (no DOM
  // screenshot, no extra dependency, nothing leaves the device).
  const handleShareCard = async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#faf7f2";
      ctx.fillRect(0, 0, 1200, 630);
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "500 34px Newsreader, serif";
      ctx.fillText("Vera", 80, 105);
      ctx.fillStyle = "#8a8378";
      ctx.font = "400 24px Inter, sans-serif";
      ctx.fillText(mode === "week" ? `Week of ${shortDay(range.startMs)}` : monthLabel(range.startMs), 80, 150);

      ctx.fillStyle = "#1a1a1a";
      ctx.font = "400 92px Newsreader, serif";
      ctx.fillText(formatDuration(recoveredMs), 80, 300);
      ctx.fillStyle = "#8a8378";
      ctx.font = "400 28px Inter, sans-serif";
      ctx.fillText("recovered time — work a manual timesheet would have lost", 80, 350);

      // Confirmed HOURS only — never the € value: this card is meant to be
      // posted publicly, and revenue is sensitive business data.
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "400 44px Newsreader, serif";
      ctx.fillText(formatDuration(totals.confirmedMinutes * 60000), 80, 460);
      ctx.fillStyle = "#8a8378";
      ctx.font = "400 22px Inter, sans-serif";
      ctx.fillText("confirmed and tracked automatically", 80, 495);

      ctx.fillStyle = "#8a8378";
      ctx.font = "400 22px Inter, sans-serif";
      ctx.fillText("100% on-device · Vera", 80, 575);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const path = await save({
        title: "Save report image",
        defaultPath: `vera-report-${fromDate}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke("write_binary_file_at", { path, contents: bytes });
    } catch (err) {
      console.error("Failed to save the report image:", err);
    }
  };

  const metricCard = (label: string, value: string, sub?: string) => (
    <div className="card-style px-5 py-4 flex flex-col gap-1">
      <span className="font-sans text-[11px] text-text-faint uppercase tracking-wider">{label}</span>
      <span className="font-serif text-[26px] text-text-primary tabular-nums leading-tight">{value}</span>
      {sub && <span className="font-sans text-[12px] text-text-faint">{sub}</span>}
    </div>
  );

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-5 px-8 pb-16 mt-8 select-none">
      {/* Header: range navigation */}
      <div className="flex items-end justify-between border-b border-border-hairline pb-4 gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
            Reports
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRange(shiftRange(range, mode, -1))}
              title={`Previous ${mode}`}
              className="p-1 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <span className="font-sans text-[13px] text-text-muted min-w-[170px] text-center">
              {rangeLabel}
            </span>
            <button
              onClick={() => setRange(shiftRange(range, mode, 1))}
              disabled={isCurrent}
              title={`Next ${mode}`}
              className="p-1 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            {!isCurrent && (
              <button
                onClick={() => switchMode(mode)}
                className="px-2.5 py-1 rounded-lg border border-border-hairline font-sans text-[12px] text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
              >
                {mode === "week" ? "This week" : "This month"}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pb-1">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`px-3 py-1.5 rounded-lg font-sans text-[12px] transition-all cursor-pointer ${
                mode === m
                  ? "bg-active-hover text-text-primary font-medium"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {m === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metricCard(
          "Confirmed",
          formatDuration(totals.confirmedMinutes * 60000),
          formatEuroFromCents(totals.confirmedCents)
        )}
        {metricCard(
          "Unbilled",
          formatDuration(totals.unbilledMinutes * 60000),
          totals.unbilledCents > 0 ? `${formatEuroFromCents(totals.unbilledCents)} not exported yet` : "everything exported"
        )}
        {metricCard(
          "Utilization",
          totals.utilization === null ? "—" : `${Math.round(totals.utilization * 100)}%`,
          "billable share of confirmed time"
        )}
        <div className="card-style px-5 py-4 flex flex-col gap-1 border-emerald-500/25">
          <span className="font-sans text-[11px] text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            Recovered time
            <button
              onClick={() => setShowDefinition(!showDefinition)}
              title="How is this counted?"
              className="cursor-pointer text-emerald-700/70 hover:text-emerald-700"
            >
              <Info size={12} strokeWidth={2} />
            </button>
          </span>
          <span className="font-serif text-[26px] text-emerald-600 tabular-nums leading-tight">
            {formatDuration(recoveredMs)}
          </span>
          <span className="font-sans text-[12px] text-text-faint">
            work a manual timesheet loses
          </span>
        </div>
      </div>

      {showDefinition && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
          <span className="font-sans text-[12.5px] text-emerald-800">{RECOVERED_TIME_DEFINITION}</span>
        </div>
      )}

      {/* Per-client table */}
      {loaded && clients.length === 0 && (
        <div className="card-style px-8 py-14 flex flex-col items-center text-center gap-3">
          <h2 className="font-serif text-[20px] text-text-primary tracking-tight">
            No confirmed entries in this period.
          </h2>
          <p className="font-sans text-[13px] text-text-muted leading-relaxed max-w-[420px]">
            Close your days in the Today view — confirmed entries show up here
            as billable hours per client.
          </p>
        </div>
      )}

      {clients.length > 0 && (
        <div className="card-style px-6 py-5 flex flex-col gap-3">
          {clients.map((c) => (
            <div key={c.client_id} className="flex items-center gap-3">
              <span className="flex-1 font-sans text-[13px] text-text-primary truncate">
                {c.client_name}
                {c.unpricedMinutes > 0 && (
                  <span className="text-text-faint">
                    {" "}· {formatDuration(c.unpricedMinutes * 60000)} unpriced
                  </span>
                )}
              </span>
              <span className="font-sans text-[13px] text-text-muted tabular-nums">
                {formatDuration(c.minutes * 60000)}
              </span>
              <span className="font-sans text-[13px] text-text-primary tabular-nums min-w-[90px] text-right">
                {c.cents > 0 ? formatEuroFromCents(c.cents) : "—"}
              </span>
            </div>
          ))}
          <div className="h-px bg-border-hairline w-full" />
          <div className="flex items-center gap-3">
            <span className="flex-1 font-serif text-[16px] text-text-primary">Total</span>
            <span className="font-serif text-[16px] text-text-primary tabular-nums">
              {formatDuration(totals.confirmedMinutes * 60000)}
            </span>
            <span className="font-serif text-[16px] text-emerald-600 tabular-nums min-w-[90px] text-right">
              {formatEuroFromCents(totals.confirmedCents)}
            </span>
          </div>
        </div>
      )}

      {/* Export */}
      <div className="card-style px-6 py-5 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-[17px] font-normal text-text-primary">Export</span>
          <span className="font-sans text-[12px] text-text-faint">
            Confirmed entries of this period as a file — exporting marks them
            as exported.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={adapterId}
            onChange={(e) => setAdapterId(e.target.value)}
            className="px-2 py-1.5 border border-border-hairline rounded-lg font-sans text-[12px] outline-none cursor-pointer bg-card-surface text-text-primary"
          >
            {exportAdapters.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleExport}
            disabled={exportState.status === "working"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-text-primary text-card-surface font-sans text-[12px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
          >
            <Download size={13} strokeWidth={1.5} />
            {exportState.status === "working" ? "Exporting…" : "Export…"}
          </button>
          <button
            onClick={handleShareCard}
            title="Save a shareable PNG of this period's numbers"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border-hairline font-sans text-[12px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
          >
            <Image size={13} strokeWidth={1.5} />
            Save report image…
          </button>
        </div>
        {exportState.status === "done" && (
          <span className="font-sans text-[12px] text-emerald-700">
            Exported to {exportState.path}
            {exportState.marked > 0 &&
              ` · ${exportState.marked} entr${exportState.marked > 1 ? "ies" : "y"} marked as exported`}
          </span>
        )}
        {exportState.status === "error" && (
          <span className="font-sans text-[12px] text-red-600">{exportState.message}</span>
        )}
      </div>

      <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-faint mt-2">
        <Lock size={12} strokeWidth={1.5} />
        Computed on this Mac from your local entries · not a single byte leaves your device
      </span>
    </div>
  );
};

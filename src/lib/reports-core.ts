// Pure report math (Schicht 5): calendar ranges, per-client aggregation,
// utilization, unbilled time, and the headline metric "recovered time".
// No Tauri/DB imports — replica-tested via npm run test:reports.

import { dayStartOf, nextDayStart } from "./format";
import { effectiveRateCents, amountCents } from "./billing-core";

// ---------- Calendar ranges (DST-safe via Date arithmetic) ----------

export type ReportRange = { startMs: number; endMs: number }; // [start, end)

/** Monday 00:00 of the week containing ms. */
function weekStartOf(ms: number): number {
  const d = new Date(dayStartOf(ms));
  // getDay(): 0 = Sunday … 6 = Saturday; walk back to Monday. setDate keeps
  // local midnight across DST (unlike raw ±ms arithmetic).
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** First-of-month 00:00 of the month containing ms. */
function monthStartOf(ms: number): number {
  const d = new Date(dayStartOf(ms));
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function weekRangeOf(ms: number): ReportRange {
  const startMs = weekStartOf(ms);
  let end = startMs;
  for (let i = 0; i < 7; i++) end = nextDayStart(end);
  return { startMs, endMs: end };
}

export function monthRangeOf(ms: number): ReportRange {
  const startMs = monthStartOf(ms);
  const d = new Date(startMs);
  return { startMs, endMs: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
}

/** The same range shifted one period back/forward (delta = ±1). */
export function shiftRange(range: ReportRange, mode: "week" | "month", delta: number): ReportRange {
  const d = new Date(range.startMs);
  if (mode === "week") {
    d.setDate(d.getDate() + delta * 7); // setDate keeps local midnight through DST
    return weekRangeOf(d.getTime());
  }
  return monthRangeOf(new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime());
}

// ---------- Aggregation over time entries ----------

export interface ReportEntryLike {
  project_id: number;
  entry_date: string; // 'YYYY-MM-DD' (already range-filtered by the caller)
  rounded_minutes: number;
  status: string; // 'draft' | 'confirmed' | 'exported'
}

export interface ReportProjectLike {
  id: number;
  name: string;
  billable: number;
  hourly_rate_cents: number | null;
  client_id: number;
  client_name: string;
  client_rate_cents: number | null;
}

export interface ClientReportRow {
  client_id: number;
  client_name: string;
  minutes: number; // billed (rounded) minutes, confirmed+exported
  cents: number; // priced value (billable projects with a rate)
  unpricedMinutes: number; // billable but no rate — visible, not hidden
}

export interface ReportTotals {
  confirmedMinutes: number; // confirmed + exported
  confirmedCents: number;
  unbilledMinutes: number; // confirmed but NOT yet exported
  unbilledCents: number;
  billableMinutes: number;
  utilization: number | null; // billable share of confirmed time, 0..1; null when no time
}

/** Per-client rows (sorted by value, then minutes) + range totals. Draft entries are ignored. */
export function aggregateEntries(
  entries: ReportEntryLike[],
  projects: ReportProjectLike[]
): { clients: ClientReportRow[]; totals: ReportTotals } {
  const byClient = new Map<number, ClientReportRow>();
  const totals: ReportTotals = {
    confirmedMinutes: 0,
    confirmedCents: 0,
    unbilledMinutes: 0,
    unbilledCents: 0,
    billableMinutes: 0,
    utilization: null,
  };

  const byId = new Map(projects.map((p) => [p.id, p]));
  for (const e of entries) {
    if (e.status !== "confirmed" && e.status !== "exported") continue;
    const p = byId.get(e.project_id);
    if (!p) continue;
    const rate = effectiveRateCents(p);
    const cents = rate === null ? 0 : amountCents(e.rounded_minutes, rate);

    const row = byClient.get(p.client_id) ?? {
      client_id: p.client_id,
      client_name: p.client_name,
      minutes: 0,
      cents: 0,
      unpricedMinutes: 0,
    };
    row.minutes += e.rounded_minutes;
    row.cents += cents;
    if (p.billable && rate === null) row.unpricedMinutes += e.rounded_minutes;
    byClient.set(p.client_id, row);

    totals.confirmedMinutes += e.rounded_minutes;
    totals.confirmedCents += cents;
    if (p.billable) totals.billableMinutes += e.rounded_minutes;
    if (e.status === "confirmed") {
      totals.unbilledMinutes += e.rounded_minutes;
      totals.unbilledCents += cents;
    }
  }

  totals.utilization =
    totals.confirmedMinutes > 0 ? totals.billableMinutes / totals.confirmedMinutes : null;

  return {
    clients: [...byClient.values()].sort((a, b) => b.cents - a.cents || b.minutes - a.minutes),
    totals,
  };
}

// ---------- Recovered time (the headline metric) ----------

const RECOVERED_SHORT_BLOCK_MS = 15 * 60_000;
const WORK_WINDOW_START_HOUR = 8; // 08:00 local
const WORK_WINDOW_END_HOUR = 18; // 18:00 local

/** Shown verbatim in the report — the metric is only credible if its definition is. */
export const RECOVERED_TIME_DEFINITION =
  "Confirmed work that manual timesheets typically lose: blocks under 15 minutes " +
  "(counted in full), plus the part of longer blocks worked outside 08:00–18:00. " +
  "Each block counts once.";

export interface RecoveredBlockLike {
  started_at: number;
  ended_at: number;
  status: string;
}

/**
 * Milliseconds a block overlaps the daily 08:00–18:00 work window. Iterates
 * day by day so blocks crossing midnight (and DST days) are handled exactly.
 */
function insideWorkWindowMs(start: number, end: number): number {
  let inside = 0;
  let cursor = dayStartOf(start);
  while (cursor < end) {
    const d = new Date(cursor);
    const winStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), WORK_WINDOW_START_HOUR).getTime();
    const winEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), WORK_WINDOW_END_HOUR).getTime();
    const lo = Math.max(start, winStart);
    const hi = Math.min(end, winEnd);
    if (hi > lo) inside += hi - lo;
    cursor = nextDayStart(cursor);
  }
  return inside;
}

/**
 * Milliseconds of confirmed block time that manual tracking typically loses:
 * short fragments (< 15 min) counted in full, plus — for longer blocks — only
 * the portion worked outside the 08:00–18:00 window (never the whole block).
 * A block is either short (full) or long (out-of-window part), so it counts once.
 */
export function recoveredTimeMs(blocks: RecoveredBlockLike[]): number {
  let ms = 0;
  for (const b of blocks) {
    if (b.status !== "confirmed") continue;
    const duration = b.ended_at - b.started_at;
    if (duration <= 0) continue;
    if (duration < RECOVERED_SHORT_BLOCK_MS) {
      ms += duration; // a short fragment is forgettable in full
    } else {
      ms += duration - insideWorkWindowMs(b.started_at, b.ended_at); // only the out-of-hours part
    }
  }
  return ms;
}

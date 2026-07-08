// Pure report math (Schicht 5): calendar ranges, per-client aggregation,
// utilization, unbilled time, and the headline metric "recovered time".
// No Tauri/DB imports — replica-tested via npm run test:reports.

import { dayStartOf, nextDayStart } from "./format";

// ---------- Calendar ranges (DST-safe via Date arithmetic) ----------

export type ReportRange = { startMs: number; endMs: number }; // [start, end)

/** Monday 00:00 of the week containing ms. */
export function weekStartOf(ms: number): number {
  let day = dayStartOf(ms);
  // getDay(): 0 = Sunday … 6 = Saturday; walk back to Monday.
  let steps = (new Date(day).getDay() + 6) % 7;
  while (steps-- > 0) {
    day = dayStartOf(day - 1); // previous day, robust across DST
  }
  return day;
}

/** First-of-month 00:00 of the month containing ms. */
export function monthStartOf(ms: number): number {
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
  const anchor =
    mode === "week"
      ? range.startMs + delta * 7 * 86_400_000 + 43_200_000 // mid-day safety offset
      : new Date(new Date(range.startMs).getFullYear(), new Date(range.startMs).getMonth() + delta, 15).getTime();
  return mode === "week" ? weekRangeOf(anchor) : monthRangeOf(anchor);
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

const effectiveRate = (p: ReportProjectLike): number | null =>
  p.billable ? (p.hourly_rate_cents ?? p.client_rate_cents) : null;

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

  for (const e of entries) {
    if (e.status !== "confirmed" && e.status !== "exported") continue;
    const p = projects.find((x) => x.id === e.project_id);
    if (!p) continue;
    const rate = effectiveRate(p);
    const cents = rate === null ? 0 : Math.round((e.rounded_minutes / 60) * rate);

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

export const RECOVERED_SHORT_BLOCK_MS = 15 * 60_000;
export const WORK_WINDOW_START_HOUR = 8; // 08:00 local
export const WORK_WINDOW_END_HOUR = 18; // 18:00 local

/** Shown verbatim in the report — the metric is only credible if its definition is. */
export const RECOVERED_TIME_DEFINITION =
  "Confirmed work in blocks under 15 minutes, plus confirmed work outside " +
  "08:00–18:00 — the time manual timesheets typically lose. Counted once per block.";

export interface RecoveredBlockLike {
  started_at: number;
  ended_at: number;
  status: string;
}

/**
 * Milliseconds of confirmed block time that manual tracking typically loses:
 * short fragments (< 15 min) and work outside the 08:00–18:00 window. A
 * block matching both counts once.
 */
export function recoveredTimeMs(blocks: RecoveredBlockLike[]): number {
  let ms = 0;
  for (const b of blocks) {
    if (b.status !== "confirmed") continue;
    const duration = b.ended_at - b.started_at;
    if (duration <= 0) continue;
    if (duration < RECOVERED_SHORT_BLOCK_MS) {
      ms += duration;
      continue;
    }
    // Work-window check in local wall-clock time, per block start's day.
    const start = new Date(b.started_at);
    const startsBefore = start.getHours() < WORK_WINDOW_START_HOUR;
    const end = new Date(b.ended_at);
    const endsAfter =
      end.getHours() >= WORK_WINDOW_END_HOUR &&
      !(end.getHours() === WORK_WINDOW_END_HOUR && end.getMinutes() === 0);
    if (startsBefore || endsAfter) ms += duration;
  }
  return ms;
}

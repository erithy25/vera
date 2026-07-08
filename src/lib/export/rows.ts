// Resolve time entries + projects into denormalized export rows — the ONE
// place where rates, billability, and labels are joined for every adapter.
// Pure: no DB imports, replica-tested.

import { ExportRow } from "./types";

export interface EntryLike {
  id: number;
  project_id: number;
  entry_date: string;
  minutes: number;
  rounded_minutes: number;
  narrative: string;
  status: string;
}

export interface ProjectLike {
  id: number;
  name: string;
  billable: number;
  hourly_rate_cents: number | null;
  client_name: string;
  client_rate_cents: number | null;
}

/** rounded_minutes × €/h, kaufmännisch to whole cents. */
export function amountCents(roundedMinutes: number, rateCents: number): number {
  return Math.round((roundedMinutes / 60) * rateCents);
}

/**
 * Only confirmed/exported entries become export rows — drafts are not
 * billing yet. Rows are sorted by date, then client, then project, so every
 * adapter emits a stable, diff-friendly file.
 */
export function buildExportRows(entries: EntryLike[], projects: ProjectLike[]): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const e of entries) {
    if (e.status !== "confirmed" && e.status !== "exported") continue;
    const p = projects.find((x) => x.id === e.project_id);
    if (!p) continue; // project row gone (never happens: projects are archive-only)
    const billable = !!p.billable;
    const rate = billable ? (p.hourly_rate_cents ?? p.client_rate_cents) : null;
    rows.push({
      entry_date: e.entry_date,
      client: p.client_name,
      project: p.name,
      minutes: e.minutes,
      rounded_minutes: e.rounded_minutes,
      rate_cents: rate,
      amount_cents: rate === null ? null : amountCents(e.rounded_minutes, rate),
      narrative: e.narrative,
      status: e.status,
      billable,
    });
  }
  return rows.sort(
    (a, b) =>
      a.entry_date.localeCompare(b.entry_date) ||
      a.client.localeCompare(b.client) ||
      a.project.localeCompare(b.project)
  );
}

// Toggl Track adapter — the "detailed report" CSV shape Toggl exports and
// re-imports. Vera's entries are per project+day without a start time, so
// start times are synthesized: each day's entries stack from 09:00 in file
// order. Durations are the billed (rounded) minutes as HH:MM:SS.

import { ExportAdapter, ExportRow } from "./types";
import { euroString, toCsv } from "./csv";

function hms(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function clock(minutesSinceMidnight: number): string {
  // Synthesized times can stack past midnight on extreme days; cap at 23:59
  // so the file stays importable (Toggl only needs a valid time of day).
  const capped = Math.min(minutesSinceMidnight, 23 * 60 + 59);
  return hms(capped).slice(0, 8);
}

const DAY_STARTS_AT = 9 * 60; // synthesized stacking starts at 09:00

export const togglAdapter: ExportAdapter = {
  id: "toggl",
  label: "Toggl Track (CSV)",
  extension: "csv",
  serialize(rows: ExportRow[]): string {
    const offsets = new Map<string, number>(); // entry_date → minutes since midnight
    const records = rows.map((r) => {
      const start = offsets.get(r.entry_date) ?? DAY_STARTS_AT;
      offsets.set(r.entry_date, start + r.rounded_minutes);
      return [
        "", // User — filled by the importing Toggl account
        "", // Email — filled by the importing Toggl account
        r.client,
        r.project,
        "", // Task
        r.narrative,
        r.billable ? "Yes" : "No",
        r.entry_date, // Start date (YYYY-MM-DD)
        clock(start), // Start time (synthesized)
        r.entry_date, // End date
        clock(start + r.rounded_minutes), // End time
        hms(r.rounded_minutes), // Duration
        "", // Tags
        euroString(r.amount_cents), // Amount
      ];
    });
    return toCsv(
      [
        "User",
        "Email",
        "Client",
        "Project",
        "Task",
        "Description",
        "Billable",
        "Start date",
        "Start time",
        "End date",
        "End time",
        "Duration",
        "Tags",
        "Amount ()",
      ],
      records
    );
  },
};

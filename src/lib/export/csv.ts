// Generic CSV adapter + the shared RFC-4180 serializer every CSV-shaped
// adapter uses. Pure, replica-tested against golden files.

import { ExportAdapter, ExportRow } from "./types";

/** RFC 4180: quote when the value contains comma, quote, or newline. */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], records: (string | number | null)[][]): string {
  const lines = [header.map(csvField).join(",")];
  for (const r of records) lines.push(r.map(csvField).join(","));
  return lines.join("\r\n") + "\r\n"; // CRLF per RFC 4180
}

/** '12.34' — euros with cents, dot-decimal, no thousands separators. */
export function euroString(cents: number | null): string | null {
  return cents === null ? null : (cents / 100).toFixed(2);
}

/** '1.75' — decimal hours with two digits, the format billing tools expect. */
export function decimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

export const csvAdapter: ExportAdapter = {
  id: "csv",
  label: "CSV (generic)",
  extension: "csv",
  serialize(rows: ExportRow[]): string {
    return toCsv(
      [
        "Date",
        "Client",
        "Project",
        "Minutes",
        "Rounded minutes",
        "Hours",
        "Rate (EUR/h)",
        "Amount (EUR)",
        "Description",
        "Billable",
        "Status",
      ],
      rows.map((r) => [
        r.entry_date,
        r.client,
        r.project,
        r.minutes,
        r.rounded_minutes,
        decimalHours(r.rounded_minutes),
        euroString(r.rate_cents),
        euroString(r.amount_cents),
        r.narrative,
        r.billable ? "yes" : "no",
        r.status,
      ])
    );
  },
};

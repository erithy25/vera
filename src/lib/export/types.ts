// The export surface (Schicht 5). Adapters turn resolved billing rows into
// file contents — pure functions, replica-tested. Schicht 7 (APIs) and
// Schicht 8 (DATEV) only add adapters; nothing else changes.

export interface ExportRow {
  id: number; // source time_entries.id — lets the caller mark exactly what it exported
  entry_date: string; // local 'YYYY-MM-DD'
  client: string;
  project: string;
  minutes: number; // real worked minutes
  rounded_minutes: number; // after the rounding rule — the billed minutes
  rate_cents: number | null; // effective €/h; null = non-billable or unpriced
  amount_cents: number | null; // rounded_minutes × rate; null when no rate
  narrative: string;
  status: string; // 'confirmed' | 'exported'
  billable: boolean;
}

export interface ExportAdapter {
  id: string;
  label: string; // shown in the format picker
  extension: string; // file extension without the dot
  /** Serialize rows (already sorted by date, client, project) to file text. */
  serialize(rows: ExportRow[]): string;
}

// Adapter registry — the Reports export picker renders exactly this list.
// Future layers (API sync, DATEV) only append here.

import { csvAdapter } from "./csv";
import { togglAdapter } from "./toggl";
import { harvestAdapter } from "./harvest";
import { ExportAdapter } from "./types";

export const exportAdapters: ExportAdapter[] = [csvAdapter, togglAdapter, harvestAdapter];

export { buildExportRows } from "./rows";
export type { ExportAdapter, ExportRow } from "./types";

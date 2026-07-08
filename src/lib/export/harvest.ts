// Harvest adapter — the time-entry import template Harvest documents:
// Date, Client, Project, Task, Notes, Hours. Harvest requires a task name;
// Vera has no task dimension, so every row imports under "General".

import { ExportAdapter, ExportRow } from "./types";
import { decimalHours, toCsv } from "./csv";

export const harvestAdapter: ExportAdapter = {
  id: "harvest",
  label: "Harvest (CSV)",
  extension: "csv",
  serialize(rows: ExportRow[]): string {
    return toCsv(
      ["Date", "Client", "Project", "Task", "Notes", "Hours"],
      rows.map((r) => [
        r.entry_date,
        r.client,
        r.project,
        "General",
        r.narrative,
        decimalHours(r.rounded_minutes),
      ])
    );
  },
};

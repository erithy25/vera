// Replica test for the export adapters (Schicht 5). Bundled from
// src/lib/export/index.ts via esbuild — identical code to the app.
// The golden files pin the exact bytes each adapter emits.
import { exportAdapters, buildExportRows } from "./.export.bundle.mjs";
import assert from "node:assert";

const failures = [];
const check = (name, fn) => {
  try {
    fn();
    console.log("PASS  " + name);
  } catch (e) {
    console.log("FAIL  " + name + " — " + e.message);
    failures.push(name);
  }
};

const adapter = (id) => exportAdapters.find((a) => a.id === id);

// --- fixtures: two clients, one project each + edge cases ---
const projects = [
  { id: 1, name: "Relaunch", billable: 1, hourly_rate_cents: 12000, client_name: "Northwind", client_rate_cents: 10000 },
  { id: 2, name: "Retainer", billable: 1, hourly_rate_cents: null, client_name: "Acme, Inc.", client_rate_cents: 9500 },
  { id: 3, name: "Internal", billable: 0, hourly_rate_cents: 5000, client_name: "Own Firm", client_rate_cents: null },
  { id: 4, name: "Unpriced", billable: 1, hourly_rate_cents: null, client_name: "Northwind", client_rate_cents: null },
];
const entries = [
  { id: 1, project_id: 1, entry_date: "2026-07-07", minutes: 94, rounded_minutes: 96, narrative: 'Rebuilt the grid, "hero" section', status: "confirmed" },
  { id: 2, project_id: 2, entry_date: "2026-07-07", minutes: 30, rounded_minutes: 30, narrative: "Weekly retainer call\nand notes", status: "exported" },
  { id: 3, project_id: 3, entry_date: "2026-07-08", minutes: 45, rounded_minutes: 45, narrative: "Internal planning", status: "confirmed" },
  { id: 4, project_id: 4, entry_date: "2026-07-08", minutes: 20, rounded_minutes: 24, narrative: "Discovery", status: "confirmed" },
  { id: 5, project_id: 1, entry_date: "2026-07-08", minutes: 10, rounded_minutes: 12, narrative: "Draft — must not export", status: "draft" },
];
const rows = buildExportRows(entries, projects);

check("buildExportRows: drafts excluded, sorted by date/client/project", () => {
  assert.equal(rows.length, 4);
  assert.deepStrictEqual(
    rows.map((r) => [r.entry_date, r.client, r.project]),
    [
      ["2026-07-07", "Acme, Inc.", "Retainer"],
      ["2026-07-07", "Northwind", "Relaunch"],
      ["2026-07-08", "Northwind", "Unpriced"],
      ["2026-07-08", "Own Firm", "Internal"],
    ]
  );
});

check("buildExportRows: rate fallback project→client, non-billable and unpriced have null amounts", () => {
  const relaunch = rows.find((r) => r.project === "Relaunch");
  assert.equal(relaunch.rate_cents, 12000); // project rate wins
  assert.equal(relaunch.amount_cents, Math.round((96 / 60) * 12000)); // 19200
  const retainer = rows.find((r) => r.project === "Retainer");
  assert.equal(retainer.rate_cents, 9500); // client fallback
  assert.equal(retainer.amount_cents, 4750);
  assert.equal(rows.find((r) => r.project === "Internal").amount_cents, null); // non-billable ignores its rate
  assert.equal(rows.find((r) => r.project === "Unpriced").amount_cents, null);
});

check("csv golden file", () => {
  const expected =
    "Date,Client,Project,Minutes,Rounded minutes,Hours,Rate (EUR/h),Amount (EUR),Description,Billable,Status\r\n" +
    '2026-07-07,"Acme, Inc.",Retainer,30,30,0.50,95.00,47.50,"Weekly retainer call\nand notes",yes,exported\r\n' +
    '2026-07-07,Northwind,Relaunch,94,96,1.60,120.00,192.00,"Rebuilt the grid, ""hero"" section",yes,confirmed\r\n' +
    "2026-07-08,Northwind,Unpriced,20,24,0.40,,,Discovery,yes,confirmed\r\n" +
    "2026-07-08,Own Firm,Internal,45,45,0.75,,,Internal planning,no,confirmed\r\n";
  assert.equal(adapter("csv").serialize(rows), expected);
});

check("toggl golden file (stacked start times from 09:00, HH:MM:SS durations)", () => {
  const expected =
    "User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount ()\r\n" +
    ',,"Acme, Inc.",Retainer,,"Weekly retainer call\nand notes",Yes,2026-07-07,09:00:00,2026-07-07,09:30:00,00:30:00,,47.50\r\n' +
    ',,Northwind,Relaunch,,"Rebuilt the grid, ""hero"" section",Yes,2026-07-07,09:30:00,2026-07-07,11:06:00,01:36:00,,192.00\r\n' +
    ",,Northwind,Unpriced,,Discovery,Yes,2026-07-08,09:00:00,2026-07-08,09:24:00,00:24:00,,\r\n" +
    ",,Own Firm,Internal,,Internal planning,No,2026-07-08,09:24:00,2026-07-08,10:09:00,00:45:00,,\r\n";
  assert.equal(adapter("toggl").serialize(rows), expected);
});

check("harvest golden file (decimal hours, task 'General')", () => {
  const expected =
    "Date,Client,Project,Task,Notes,Hours\r\n" +
    '2026-07-07,"Acme, Inc.",Retainer,General,"Weekly retainer call\nand notes",0.50\r\n' +
    '2026-07-07,Northwind,Relaunch,General,"Rebuilt the grid, ""hero"" section",1.60\r\n' +
    "2026-07-08,Northwind,Unpriced,General,Discovery,0.40\r\n" +
    "2026-07-08,Own Firm,Internal,General,Internal planning,0.75\r\n";
  assert.equal(adapter("harvest").serialize(rows), expected);
});

check("empty range still yields a valid header-only file", () => {
  for (const a of exportAdapters) {
    const out = a.serialize([]);
    assert.ok(out.endsWith("\r\n"));
    assert.equal(out.trim().split("\r\n").length, 1);
  }
});

check("all adapters registered with csv extension", () => {
  assert.deepStrictEqual(exportAdapters.map((a) => a.id), ["csv", "toggl", "harvest"]);
  assert.ok(exportAdapters.every((a) => a.extension === "csv" && a.label.length > 0));
});

console.log();
process.exit(failures.length ? 1 : 0);

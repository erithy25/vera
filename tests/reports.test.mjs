// Replica test for the pure report math (Schicht 5). Bundled from
// src/lib/reports-core.ts via esbuild — identical code to the app.
import {
  weekRangeOf,
  monthRangeOf,
  shiftRange,
  aggregateEntries,
  recoveredTimeMs,
  RECOVERED_TIME_DEFINITION,
} from "./.reports-core.bundle.mjs";
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

// --- calendar ranges ---

check("weekRangeOf: Monday through next Monday, any weekday input", () => {
  const wed = new Date(2026, 6, 8, 15, 30).getTime(); // Wed July 8, 2026
  const { startMs, endMs } = weekRangeOf(wed);
  assert.equal(new Date(startMs).toDateString(), new Date(2026, 6, 6).toDateString()); // Mon July 6
  assert.equal(new Date(endMs).toDateString(), new Date(2026, 6, 13).toDateString());
  const mon = new Date(2026, 6, 6, 0, 0).getTime();
  assert.equal(weekRangeOf(mon).startMs, startMs); // Monday maps to itself
  const sun = new Date(2026, 6, 12, 23, 59).getTime();
  assert.equal(weekRangeOf(sun).startMs, startMs); // Sunday still same week
});

check("monthRangeOf: first of month through first of next month (incl. year wrap)", () => {
  const { startMs, endMs } = monthRangeOf(new Date(2026, 11, 31).getTime());
  assert.equal(new Date(startMs).toDateString(), new Date(2026, 11, 1).toDateString());
  assert.equal(new Date(endMs).toDateString(), new Date(2027, 0, 1).toDateString());
});

check("shiftRange moves exactly one period and is symmetric", () => {
  const w = weekRangeOf(new Date(2026, 6, 8).getTime());
  const prev = shiftRange(w, "week", -1);
  assert.equal(new Date(prev.startMs).toDateString(), new Date(2026, 5, 29).toDateString());
  assert.equal(shiftRange(prev, "week", 1).startMs, w.startMs);
  const m = monthRangeOf(new Date(2026, 0, 31).getTime());
  const nextM = shiftRange(m, "month", 1);
  assert.equal(new Date(nextM.startMs).toDateString(), new Date(2026, 1, 1).toDateString()); // Jan→Feb, no skip
  assert.equal(shiftRange(nextM, "month", -1).startMs, m.startMs);
});

// --- aggregation ---

const projects = [
  { id: 1, name: "Relaunch", billable: 1, hourly_rate_cents: 12000, client_id: 10, client_name: "Northwind", client_rate_cents: null },
  { id: 2, name: "Retainer", billable: 1, hourly_rate_cents: null, client_id: 20, client_name: "Acme", client_rate_cents: 9000 },
  { id: 3, name: "Internal", billable: 0, hourly_rate_cents: null, client_id: 30, client_name: "Own Firm", client_rate_cents: null },
  { id: 4, name: "Unpriced", billable: 1, hourly_rate_cents: null, client_id: 10, client_name: "Northwind", client_rate_cents: null },
];
const entries = [
  { project_id: 1, entry_date: "2026-07-06", rounded_minutes: 120, status: "confirmed" },
  { project_id: 1, entry_date: "2026-07-07", rounded_minutes: 60, status: "exported" },
  { project_id: 2, entry_date: "2026-07-07", rounded_minutes: 90, status: "confirmed" },
  { project_id: 3, entry_date: "2026-07-08", rounded_minutes: 60, status: "confirmed" },
  { project_id: 4, entry_date: "2026-07-08", rounded_minutes: 30, status: "confirmed" },
  { project_id: 1, entry_date: "2026-07-08", rounded_minutes: 999, status: "draft" }, // ignored
];
const { clients, totals } = aggregateEntries(entries, projects);

check("aggregateEntries: drafts ignored, per-client minutes and € correct", () => {
  assert.equal(clients.length, 3);
  const northwind = clients.find((c) => c.client_name === "Northwind");
  assert.equal(northwind.minutes, 210); // 120+60+30
  assert.equal(northwind.cents, 36000); // 3h × 120 €
  assert.equal(northwind.unpricedMinutes, 30); // the Unpriced project
  const acme = clients.find((c) => c.client_name === "Acme");
  assert.equal(acme.cents, 13500); // 1.5h × 90 € (client-rate fallback)
  assert.equal(clients[0].client_name, "Northwind"); // sorted by value
});

check("totals: confirmed vs unbilled (exported excluded) and utilization", () => {
  assert.equal(totals.confirmedMinutes, 360);
  assert.equal(totals.confirmedCents, 49500);
  assert.equal(totals.unbilledMinutes, 300); // everything except the exported 60
  assert.equal(totals.unbilledCents, 37500); // 24000 (p1 confirmed) + 13500 (p2)
  assert.equal(totals.billableMinutes, 300); // all but Internal
  assert.ok(Math.abs(totals.utilization - 300 / 360) < 1e-9);
});

check("totals: empty range → utilization null, zeros elsewhere", () => {
  const empty = aggregateEntries([], projects).totals;
  assert.equal(empty.confirmedMinutes, 0);
  assert.equal(empty.utilization, null);
});

// --- recovered time ---

const H = 3_600_000;
const day = (h, m = 0) => new Date(2026, 6, 8, h, m).getTime();

check("recoveredTimeMs: short blocks full, long blocks only the out-of-window part, confirmed only", () => {
  const blocks = [
    { started_at: day(10), ended_at: day(10, 10), status: "confirmed" }, // 10 min short → full 10
    { started_at: day(11), ended_at: day(12), status: "confirmed" }, // 1h fully inside → 0
    { started_at: day(6), ended_at: day(7, 30), status: "confirmed" }, // 90 min all before 08:00 → 90
    { started_at: day(17, 30), ended_at: day(19), status: "confirmed" }, // 90 min: 30 inside, 60 outside → 60
    { started_at: day(7), ended_at: day(7, 5), status: "confirmed" }, // 5 min short (before 8) → full 5
    { started_at: day(6), ended_at: day(6, 30), status: "open" }, // not confirmed → 0
    { started_at: day(9), ended_at: day(18), status: "confirmed" }, // ends exactly 18:00 → fully inside → 0
  ];
  const expected = (10 + 0 + 90 + 60 + 5) * 60000;
  assert.equal(recoveredTimeMs(blocks), expected);
});

check("recoveredTimeMs: a block crossing midnight (outside window) is counted, not dropped", () => {
  const start = new Date(2026, 6, 8, 22, 30).getTime();
  const end = new Date(2026, 6, 9, 0, 15).getTime(); // 105 min, entirely outside 08–18
  assert.equal(recoveredTimeMs([{ started_at: start, ended_at: end, status: "confirmed" }]), 105 * 60000);
});

check("recoveredTimeMs: a long block fully inside the window contributes nothing", () => {
  assert.equal(recoveredTimeMs([{ started_at: day(9), ended_at: day(17), status: "confirmed" }]), 0);
});

check("recovered-time definition is published verbatim", () => {
  assert.ok(RECOVERED_TIME_DEFINITION.includes("15 minutes"));
  assert.ok(RECOVERED_TIME_DEFINITION.includes("08:00"));
});

console.log();
process.exit(failures.length ? 1 : 0);

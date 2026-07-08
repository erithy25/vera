// Replica test for the pure segmentation engine (Schicht 2).
// The module is bundled from src/lib/segmentation.ts via esbuild — identical
// code to what ships in the app.
import {
  segmentDay,
  subtractPreserved,
  domainOf,
  docKeyOf,
  DEFAULT_SEGMENT_OPTIONS,
  parseEvidenceJson,
  mergeEvidence,
  evidenceText,
  EVIDENCE_CAPS,
} from "./.segmentation.bundle.mjs";
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

const DAY = new Date(2026, 6, 8).getTime(); // local midnight
const MIN = 60 * 1000;
const at = (h, m) => DAY + h * 60 * MIN + m * MIN;

// Helpers to build moments
const act = (t, durMin, app, title) => ({ t, durationMs: durMin * MIN, app, title, url: null, ocr: null });
const frame = (t, app, title, url, ocr) => ({ t, durationMs: 1000, app, title: title ?? null, url: url ?? null, ocr: ocr ?? null });

check("domainOf strips scheme/www/path/port", () => {
  assert.equal(domainOf("https://www.client-north.com/projects/7?x=1"), "client-north.com");
  assert.equal(domainOf("http://localhost:11434/api"), "localhost");
  assert.equal(domainOf(null), null);
  assert.equal(domainOf(""), null);
});

check("docKeyOf takes first segment, normalized", () => {
  assert.equal(docKeyOf("UMBAUPLAN.md — vera — Visual Studio Code"), "umbauplan.md");
  assert.equal(docKeyOf("Proposal_v2.pdf - Preview"), "proposal_v2.pdf");
  assert.equal(docKeyOf("   "), null);
  assert.equal(docKeyOf(null), null);
});

check("continuous same-signature work → one block", () => {
  const moments = [
    act(at(9, 0), 30, "Figma", "Homepage — Northwind — Figma"),
    act(at(9, 30), 30, "Figma", "Homepage — Northwind — Figma"),
    act(at(10, 0), 30, "Figma", "Homepage — Northwind — Figma"),
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].startedAt, at(9, 0));
  assert.equal(blocks[0].endedAt, at(10, 30));
  assert.ok(blocks[0].appSummary.includes("Figma"));
});

check("quick peek (<2min) is absorbed, evidence keeps it", () => {
  const moments = [
    act(at(9, 0), 30, "Figma", "Homepage — Figma"),
    act(at(9, 30), 1, "Slack", "#client-north — Slack"),
    act(at(9, 31), 29, "Figma", "Homepage — Figma"),
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].endedAt, at(10, 0));
  assert.ok(blocks[0].evidence.apps.includes("Slack"));
});

check("persistent switch (>2min) splits into two blocks", () => {
  const moments = [
    act(at(9, 0), 30, "Figma", "Homepage — Figma"),
    act(at(9, 30), 10, "Mail", "Proposal_v2.pdf — Mail"),
    act(at(9, 40), 20, "Mail", "Proposal_v2.pdf — Mail"),
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].endedAt, at(9, 30));
  assert.equal(blocks[1].startedAt, at(9, 30));
  assert.equal(blocks[1].endedAt, at(10, 0));
});

check("gap ≥5min closes the block (idle)", () => {
  const moments = [
    act(at(9, 0), 60, "Figma", "Homepage — Figma"),
    // 40 min idle
    act(at(10, 40), 60, "Figma", "Homepage — Figma"),
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].endedAt, at(10, 0));
  assert.equal(blocks[1].startedAt, at(10, 40));
});

check("fragment <3min near a block is absorbed into it", () => {
  const moments = [
    act(at(9, 0), 60, "Figma", "Homepage — Figma"),
    // 6-min pause → separate draft; 2-min mail is a fragment near Figma? gap 6min > absorbGap 5min…
    act(at(10, 2), 2, "Mail", "Inbox — Mail"), // 2 min after block end → absorbed into previous
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 1, JSON.stringify(blocks.map(b => [b.appSummary, (b.endedAt-b.startedAt)/MIN])));
  assert.equal(blocks[0].endedAt, at(10, 4));
  assert.ok(blocks[0].evidence.apps.includes("Mail"));
});

check("isolated short work (1-3min, far from neighbours) survives standalone", () => {
  const moments = [
    act(at(9, 0), 60, "Figma", "Homepage — Figma"),
    act(at(11, 0), 2, "Mail", "Inbox — Mail"), // 60 min from anything
    act(at(13, 0), 60, "Code", "main.ts — Code"),
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].appSummary, "Mail");
});

check("sub-minute isolated noise is dropped", () => {
  const moments = [
    act(at(9, 0), 60, "Figma", "Homepage — Figma"),
    frame(at(12, 0), "Finder", "Desktop", null, null), // 1s blip, isolated
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 1);
});

check("moments are clamped to the day window (midnight)", () => {
  const moments = [
    act(DAY - 30 * MIN, 60, "Code", "main.ts — Code"), // spans midnight into the day
    act(at(23, 45), 30, "Code", "main.ts — Code"), // spans out of the day
  ];
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks[0].startedAt, DAY);
  assert.equal(blocks[blocks.length - 1].endedAt, DAY + 24 * 60 * MIN);
});

check("frames enrich evidence with domains and OCR terms", () => {
  const moments = [
    act(at(9, 0), 60, "Safari", "Northwind Dashboard"),
  ];
  for (let i = 0; i < 30; i++) {
    moments.push(frame(at(9, i * 2), "Safari", "Northwind Dashboard", "https://app.client-north.com/x", "Invoice draft northwind relaunch homepage"));
  }
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].evidence.domains.includes("app.client-north.com"), JSON.stringify(blocks[0].evidence));
  assert.ok(blocks[0].evidence.terms.includes("northwind"));
  assert.ok(!blocks[0].evidence.terms.includes("the"));
});

check("domain change inside one long browser event splits the block", () => {
  const moments = [act(at(9, 0), 60, "Safari", "Safari")];
  for (let i = 0; i < 15; i++) moments.push(frame(at(9, i * 2), "Safari", null, "https://client-a.com/x", null));
  for (let i = 15; i < 30; i++) moments.push(frame(at(9, i * 2), "Safari", null, "https://client-b.com/y", null));
  const blocks = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  assert.equal(blocks.length, 2, JSON.stringify(blocks.map(b => b.evidence.domains)));
  assert.ok(blocks[0].evidence.domains.includes("client-a.com"));
  assert.ok(blocks[1].evidence.domains.includes("client-b.com"));
});

check("subtractPreserved trims, splits, and drops covered blocks", () => {
  const blocks = segmentDay([act(at(9, 0), 120, "Figma", "Homepage — Figma")], DAY, DAY + 24 * 60 * MIN);
  // preserved block in the middle 9:30–10:00 → split into two pieces
  const pieces = subtractPreserved(blocks, [{ startedAt: at(9, 30), endedAt: at(10, 0) }]);
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].endedAt, at(9, 30));
  assert.equal(pieces[1].startedAt, at(10, 0));
  // fully covered → dropped
  const gone = subtractPreserved(blocks, [{ startedAt: at(8, 0), endedAt: at(12, 0) }]);
  assert.equal(gone.length, 0);
  // no overlap → unchanged
  const same = subtractPreserved(blocks, [{ startedAt: at(13, 0), endedAt: at(14, 0) }]);
  assert.equal(same.length, 1);
});

check("deterministic: same input → identical output", () => {
  const moments = [
    act(at(9, 0), 45, "Figma", "Homepage — Figma"),
    act(at(9, 46), 1, "Slack", "#general — Slack"),
    act(at(9, 48), 40, "Code", "main.ts — Code"),
    frame(at(9, 20), "Figma", "Homepage — Figma", null, "wireframe grid layout"),
  ];
  const a = segmentDay(moments, DAY, DAY + 24 * 60 * MIN);
  const b = segmentDay([...moments].reverse(), DAY, DAY + 24 * 60 * MIN);
  assert.deepStrictEqual(a, b);
});

check("defaults match the plan (5min gap, 2min switch, 3min fragment)", () => {
  assert.equal(DEFAULT_SEGMENT_OPTIONS.gapMs, 5 * MIN);
  assert.equal(DEFAULT_SEGMENT_OPTIONS.switchMs, 2 * MIN);
  assert.equal(DEFAULT_SEGMENT_OPTIONS.minBlockMs, 3 * MIN);
});

check("parseEvidenceJson is defensive against bad/legacy rows", () => {
  assert.deepStrictEqual(parseEvidenceJson(null), { apps: [], titles: [], domains: [], terms: [] });
  assert.deepStrictEqual(parseEvidenceJson("not json"), { apps: [], titles: [], domains: [], terms: [] });
  assert.deepStrictEqual(parseEvidenceJson('{"apps":["Figma",7],"titles":"x"}').apps, ["Figma"]);
});

check("mergeEvidence unions in order and respects caps", () => {
  const a = { apps: ["Figma"], titles: ["A"], domains: ["x.com"], terms: ["one"] };
  const b = { apps: ["Slack", "Figma"], titles: ["B"], domains: ["y.com"], terms: ["two"] };
  const m = mergeEvidence([a, b]);
  assert.deepStrictEqual(m.apps, ["Figma", "Slack"]);
  assert.deepStrictEqual(m.domains, ["x.com", "y.com"]);
  const many = { apps: [], titles: ["1","2","3","4","5","6","7"], domains: [], terms: [] };
  assert.equal(mergeEvidence([many]).titles.length, EVIDENCE_CAPS.titles);
});

check("evidenceText joins values (not JSON keys) for search", () => {
  const t = evidenceText({ apps: ["Figma"], titles: ["Homepage"], domains: ["x.com"], terms: ["draft"] });
  assert.ok(t.includes("figma") && t.includes("x.com"));
  assert.ok(!t.includes("apps") && !t.includes("titles"));
});

console.log();
process.exit(failures.length ? 1 : 0);

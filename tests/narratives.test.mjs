// Replica test for the pure billing-narrative logic (Schicht 4). Bundled
// from src/lib/narrative-core.ts via esbuild — identical code to the app.
import {
  roundMinutes,
  groupBlocksIntoDrafts,
  entryDateOf,
  dayStartMsOf,
  redactNarrative,
  buildNarrativeMessages,
  parseNarrativeReply,
  fallbackNarrative,
  effectiveIncrement,
} from "./.narrative-core.bundle.mjs";
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

const ev = (over = {}) => ({ apps: [], titles: [], domains: [], terms: [], ...over });

check("roundMinutes: exact (increment 0) passes through", () => {
  assert.equal(roundMinutes(94, 0, "nearest"), 94);
});

check("roundMinutes: 6-min increments in all modes", () => {
  assert.equal(roundMinutes(94, 6, "nearest"), 96); // 15.67 units → 16
  assert.equal(roundMinutes(94, 6, "up"), 96);
  assert.equal(roundMinutes(94, 6, "down"), 90);
  assert.equal(roundMinutes(93, 6, "nearest"), 96); // 15.5 units rounds up (kaufmännisch)
  assert.equal(roundMinutes(92, 6, "nearest"), 90); // 15.33 units rounds down
});

check("roundMinutes: 15-min increments", () => {
  assert.equal(roundMinutes(50, 15, "nearest"), 45);
  assert.equal(roundMinutes(50, 15, "up"), 60);
  assert.equal(roundMinutes(50, 15, "down"), 45);
});

check("roundMinutes never rounds real work to zero", () => {
  assert.equal(roundMinutes(2, 6, "down"), 6);
  assert.equal(roundMinutes(1, 15, "nearest"), 15);
  assert.equal(roundMinutes(0, 6, "up"), 0);
});

check("effectiveIncrement: project override wins, null falls back", () => {
  assert.equal(effectiveIncrement(6, 15), 6);
  assert.equal(effectiveIncrement(0, 15), 0); // explicit exact override
  assert.equal(effectiveIncrement(null, 15), 15);
});

check("groupBlocksIntoDrafts: sums confirmed+assigned per project, skips the rest", () => {
  const H = 3_600_000;
  const blocks = [
    { id: 1, started_at: 0, ended_at: H, project_id: 3, status: "confirmed", evidence: JSON.stringify(ev({ titles: ["A"] })) },
    { id: 2, started_at: H, ended_at: H + 30 * 60000, project_id: 3, status: "confirmed", evidence: JSON.stringify(ev({ titles: ["B"] })) },
    { id: 3, started_at: 0, ended_at: H, project_id: 5, status: "confirmed", evidence: "{}" },
    { id: 4, started_at: 0, ended_at: H, project_id: 3, status: "open", evidence: "{}" }, // not confirmed
    { id: 5, started_at: 0, ended_at: H, project_id: null, status: "confirmed", evidence: "{}" }, // unassigned
  ];
  const drafts = groupBlocksIntoDrafts(blocks);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].project_id, 3);
  assert.equal(drafts[0].minutes, 90);
  assert.deepStrictEqual(drafts[0].block_ids, [1, 2]);
  assert.deepStrictEqual(drafts[0].evidence.titles, ["A", "B"]);
  assert.equal(drafts[1].project_id, 5);
});

check("entryDateOf formats local YYYY-MM-DD", () => {
  const d = new Date(2026, 6, 8); // July 8, local midnight
  assert.equal(entryDateOf(d.getTime()), "2026-07-08");
});

check("dayStartMsOf is the exact inverse of entryDateOf (local midnight)", () => {
  const d = new Date(2026, 6, 8);
  assert.equal(dayStartMsOf("2026-07-08"), d.getTime());
  assert.equal(entryDateOf(dayStartMsOf("2026-01-02")), "2026-01-02");
});

check("redactNarrative masks cards (Luhn), IBANs, digit runs, API keys — keeps normal text", () => {
  assert.ok(redactNarrative("Paid with 4532015112830366 today").includes("[redacted]"));
  assert.ok(!redactNarrative("Ticket 1234-5678 review").includes("[redacted]")); // fails Luhn
  assert.ok(redactNarrative("Sent DE89370400440532013000 to the client").includes("[redacted]"));
  assert.ok(redactNarrative("Order id 12345678901 processed").includes("[redacted]"));
  assert.ok(redactNarrative("Key AKIAIOSFODNN7EXAMPLE leaked").includes("[redacted]"));
  assert.equal(redactNarrative("Reviewed the homepage draft."), "Reviewed the homepage draft.");
});

check("redactNarrative preserves the separator after a redacted card number", () => {
  assert.equal(
    redactNarrative("Paid with 4532015112830366 today"),
    "Paid with [redacted] today" // not "[redacted]today"
  );
  assert.equal(
    redactNarrative("Card 4532-0151-1283-0366 charged"),
    "Card [redacted] charged"
  );
});

check("redactNarrative masks credential-assignment phrases (canon: Rust redact_sensitive)", () => {
  assert.ok(redactNarrative("saw password = hunter2hunter2hunter2 on screen").includes("[redacted]"));
  assert.ok(redactNarrative('auth_token: "abcdef0123456789abcdef"').includes("[redacted]"));
  assert.ok(!redactNarrative("Reset the password flow for the client portal.").includes("[redacted]"));
});

check("buildNarrativeMessages carries language, tone, template, style examples", () => {
  const msgs = buildNarrativeMessages(
    "Northwind — Relaunch",
    { project_id: 3, minutes: 94, block_ids: [1], evidence: ev({ titles: ["Homepage"], domains: ["northwind.com"] }) },
    { language: "de", tone: "detailed", template: "law" },
    ["Prüfung der Vertragsunterlagen und Korrespondenz mit der Gegenseite."]
  );
  assert.equal(msgs.length, 2);
  assert.ok(msgs[0].content.includes("German"));
  assert.ok(msgs[0].content.includes("2-3 sentences"));
  assert.ok(msgs[0].content.includes("Law-firm style"));
  assert.ok(msgs[0].content.includes('{"narrative"'));
  assert.ok(msgs[1].content.includes("Northwind — Relaunch"));
  assert.ok(msgs[1].content.includes("94 minutes"));
  assert.ok(msgs[1].content.includes("match their voice"));
  assert.ok(msgs[1].content.includes("Vertragsunterlagen"));
});

check("parseNarrativeReply: JSON, fences, whitespace collapse, garbage → null", () => {
  assert.equal(parseNarrativeReply('{"narrative": "Reviewed the  draft. "}'), "Reviewed the draft.");
  assert.equal(parseNarrativeReply('```json\n{"narrative":"Built the grid."}\n```'), "Built the grid.");
  assert.equal(parseNarrativeReply('{"narrative": 42}'), null);
  assert.equal(parseNarrativeReply("Reviewed the draft."), null);
  assert.equal(parseNarrativeReply('{"narrative": "   "}'), null);
});

check("fallbackNarrative works without LLM, honors language, redacts", () => {
  const d = { project_id: 3, minutes: 60, block_ids: [1], evidence: ev({ titles: ["Homepage"], apps: ["Figma"] }) };
  assert.equal(fallbackNarrative(d, "en"), "Worked on Homepage (Figma).");
  assert.equal(fallbackNarrative(d, "de"), "Arbeit an Homepage (Figma).");
  const leaky = { ...d, evidence: ev({ titles: ["DE89370400440532013000"] }) };
  assert.ok(fallbackNarrative(leaky, "en").includes("[redacted]"));
  const empty = { ...d, evidence: ev() };
  assert.equal(fallbackNarrative(empty, "en"), "Worked on captured activities.");
});

console.log();
process.exit(failures.length ? 1 : 0);

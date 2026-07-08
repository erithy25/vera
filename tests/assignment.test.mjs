// Replica test for the pure assignment logic (Schicht 3). The module is
// bundled from src/lib/assignment-core.ts via esbuild — identical code to
// what ships in the app.
import {
  ruleMatches,
  chooseRule,
  selectFewShot,
  buildClassifyMessages,
  parseClassifyReply,
  suggestRule,
  LLM_CONFIDENCE_THRESHOLD,
  SUGGESTION_MIN_CORRECTIONS,
} from "./.assignment-core.bundle.mjs";
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

check("domain rule matches exact and subdomains, not lookalikes", () => {
  const rule = { matcher_type: "domain", pattern: "client-a.com" };
  assert.ok(ruleMatches(rule, ev({ domains: ["client-a.com"] })));
  assert.ok(ruleMatches(rule, ev({ domains: ["app.client-a.com"] })));
  assert.ok(!ruleMatches(rule, ev({ domains: ["evilclient-a.com"] })));
  assert.ok(!ruleMatches(rule, ev({ domains: ["client-a.com.evil.io"] })));
});

check("app rule matches case-insensitively and exactly", () => {
  const rule = { matcher_type: "app", pattern: "figma" };
  assert.ok(ruleMatches(rule, ev({ apps: ["Figma"] })));
  assert.ok(!ruleMatches(rule, ev({ apps: ["Figma Beta"] })));
});

check("title_keyword and path match as substring of titles", () => {
  assert.ok(ruleMatches({ matcher_type: "title_keyword", pattern: "relaunch" }, ev({ titles: ["Homepage Relaunch — Figma"] })));
  assert.ok(ruleMatches({ matcher_type: "path", pattern: "/clients/acme" }, ev({ titles: ["~/work/clients/acme/main.ts — Code"] })));
  assert.ok(!ruleMatches({ matcher_type: "title_keyword", pattern: "" }, ev({ titles: ["anything"] })));
});

check("chooseRule: first matching rule wins", () => {
  const rules = [
    { matcher_type: "domain", pattern: "b.com", project_id: 2 },
    { matcher_type: "domain", pattern: "a.com", project_id: 1 },
  ];
  assert.deepStrictEqual(chooseRule(rules, ev({ domains: ["a.com", "b.com"] })), { project_id: 2 });
  assert.equal(chooseRule(rules, ev({ domains: ["c.com"] })), null);
});

check("chooseRule skips rules targeting invalid/archived projects", () => {
  const rules = [
    { matcher_type: "domain", pattern: "a.com", project_id: 9 }, // archived
    { matcher_type: "domain", pattern: "a.com", project_id: 1 }, // active
  ];
  assert.deepStrictEqual(
    chooseRule(rules, ev({ domains: ["a.com"] }), new Set([1])),
    { project_id: 1 }
  );
  assert.equal(chooseRule(rules, ev({ domains: ["a.com"] }), new Set([2])), null);
});

check("selectFewShot prefers shared domains (x2) over shared apps, then recency", () => {
  const block = ev({ domains: ["client-a.com"], apps: ["Figma"] });
  const feedback = [
    { block_evidence: JSON.stringify(ev({ apps: ["Figma"] })), correct_project_id: 9 }, // score 1, most recent
    { block_evidence: JSON.stringify(ev({ domains: ["client-a.com"] })), correct_project_id: 7 }, // score 2
    { block_evidence: JSON.stringify(ev({ domains: ["other.com"] })), correct_project_id: 5 }, // score 0
  ];
  const picked = selectFewShot(feedback, block, 2);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].project_id, 7);
  assert.equal(picked[1].project_id, 9);
});

check("selectFewShot never pads with zero-similarity examples (majority-label bias)", () => {
  const block = ev({ domains: ["brand-new.com"] });
  const feedback = Array.from({ length: 10 }, () => ({
    block_evidence: JSON.stringify(ev({ domains: ["dominant-client.com"] })),
    correct_project_id: 1,
  }));
  assert.equal(selectFewShot(feedback, block).length, 0);
});

check("buildClassifyMessages lists projects, examples, and block evidence", () => {
  const msgs = buildClassifyMessages(
    [{ id: 3, client_name: "Northwind", name: "Relaunch" }],
    [{ evidence: ev({ domains: ["northwind.com"] }), project_id: 3 }],
    ev({ apps: ["Safari"], domains: ["northwind.com"] }),
    94
  );
  assert.equal(msgs.length, 2);
  assert.ok(msgs[0].content.includes("ONLY a JSON object"));
  assert.ok(msgs[1].content.includes("id 3: Northwind — Relaunch"));
  assert.ok(msgs[1].content.includes("→ project_id 3"));
  assert.ok(msgs[1].content.includes("BLOCK (94 min)"));
});

check("parseClassifyReply: valid JSON, code fences, invalid ids, clamping, garbage", () => {
  const valid = new Set([3, 5]);
  assert.deepStrictEqual(parseClassifyReply('{"project_id": 3, "confidence": 0.9, "reason": "x"}', valid), { project_id: 3, confidence: 0.9, reason: "x" });
  assert.deepStrictEqual(parseClassifyReply('```json\n{"project_id": "5", "confidence": 2, "reason": 1}\n```', valid), { project_id: 5, confidence: 1, reason: "" });
  assert.equal(parseClassifyReply('{"project_id": 99, "confidence": 0.9}', valid).project_id, null);
  assert.equal(parseClassifyReply('{"project_id": null, "confidence": -1}', valid).confidence, 0);
  assert.equal(parseClassifyReply("the project is 3", valid), null);
});

check("threshold is 0.6 (plan: honest beats wrong)", () => {
  assert.equal(LLM_CONFIDENCE_THRESHOLD, 0.6);
});

check("suggestRule fires after 3 matching corrections, not before, never when a rule exists", () => {
  const corrected = { evidence: ev({ domains: ["client-a.com"] }), project_id: 3 };
  const fb = (n) =>
    Array.from({ length: n }, () => ({
      block_evidence: JSON.stringify(ev({ domains: ["client-a.com"] })),
      correct_project_id: 3,
    }));
  assert.equal(suggestRule(fb(SUGGESTION_MIN_CORRECTIONS - 1), [], corrected), null);
  assert.deepStrictEqual(suggestRule(fb(SUGGESTION_MIN_CORRECTIONS), [], corrected), {
    matcher_type: "domain",
    pattern: "client-a.com",
    project_id: 3,
  });
  assert.equal(
    suggestRule(fb(5), [{ matcher_type: "domain", pattern: "client-a.com" }], corrected),
    null
  );
});

check("suggestRule falls back to the dominant app when there is no domain", () => {
  const corrected = { evidence: ev({ apps: ["Xcode"] }), project_id: 4 };
  const fb = Array.from({ length: 3 }, () => ({
    block_evidence: JSON.stringify(ev({ apps: ["Xcode"] })),
    correct_project_id: 4,
  }));
  assert.deepStrictEqual(suggestRule(fb, [], corrected), {
    matcher_type: "app",
    pattern: "xcode",
    project_id: 4,
  });
});

check("suggestRule ignores corrections for other projects", () => {
  const corrected = { evidence: ev({ domains: ["client-a.com"] }), project_id: 3 };
  const fb = Array.from({ length: 5 }, () => ({
    block_evidence: JSON.stringify(ev({ domains: ["client-a.com"] })),
    correct_project_id: 8, // different project
  }));
  assert.equal(suggestRule(fb, [], corrected), null);
});

console.log();
process.exit(failures.length ? 1 : 0);

// Replica test for the pure integration adapters + push planning (Schicht 7).
// Bundled from src/lib/integrations/index.ts via esbuild — identical to the app.
import { integrationAdapters, adapterFor, planPush, sendEntry } from "./.integrations.bundle.mjs";
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

const entry = { id: 7, entry_date: "2026-07-08", rounded_minutes: 90, narrative: "Reviewed the homepage draft." };

check("registry exposes moco, awork, clio (no accounting systems)", () => {
  assert.deepStrictEqual(integrationAdapters.map((a) => a.id), ["moco", "awork", "clio"]);
});

check("isConfigured requires every credential field", () => {
  const moco = adapterFor("moco");
  assert.equal(moco.isConfigured({ subdomain: "acme" }), false);
  assert.equal(moco.isConfigured({ subdomain: "acme", apiKey: "k" }), true);
  assert.equal(adapterFor("awork").isConfigured({}), false);
  assert.equal(adapterFor("awork").isConfigured({ apiKey: "k" }), true);
  assert.equal(adapterFor("clio").isConfigured({ accessToken: "t" }), true);
});

check("MOCO: Token auth, project:task split, 2-decimal hours, only entry data on the wire", () => {
  const req = adapterFor("moco").buildEntryRequest(entry, "123:456", { subdomain: "acme", apiKey: "SECRET" });
  assert.equal(req.url, "https://acme.mocoapp.com/api/v1/activities");
  assert.equal(req.method, "POST");
  assert.equal(req.headers.Authorization, "Token token=SECRET");
  const body = JSON.parse(req.body);
  assert.deepStrictEqual(body, {
    date: "2026-07-08",
    project_id: 123,
    task_id: 456,
    hours: 1.5,
    description: "Reviewed the homepage draft.",
  });
  // Nothing beyond the four whitelisted fields leaves the device.
  assert.deepStrictEqual(Object.keys(body).sort(), ["date", "description", "hours", "project_id", "task_id"]);
});

check("MOCO: hours rounds to 2 decimals (94 min → 1.57 h)", () => {
  const req = adapterFor("moco").buildEntryRequest({ ...entry, rounded_minutes: 94 }, "1:2", { subdomain: "a", apiKey: "k" });
  assert.equal(JSON.parse(req.body).hours, 1.57);
});

check("awork: Bearer auth, GUID project, duration in seconds", () => {
  const req = adapterFor("awork").buildEntryRequest(entry, "guid-abc", { apiKey: "SECRET" });
  assert.equal(req.url, "https://api.awork.com/api/v1/timeentries");
  assert.equal(req.headers.Authorization, "Bearer SECRET");
  const body = JSON.parse(req.body);
  assert.equal(body.projectId, "guid-abc");
  assert.equal(body.duration, 5400);
  assert.equal(body.startDateUtc, "2026-07-08");
  assert.equal(body.note, "Reviewed the homepage draft.");
});

check("Clio: region selects host, matter id, quantity in seconds", () => {
  const us = adapterFor("clio").buildEntryRequest(entry, "999", { accessToken: "T", region: "us" });
  assert.equal(us.url, "https://app.clio.com/api/v4/activities.json");
  const eu = adapterFor("clio").buildEntryRequest(entry, "999", { accessToken: "T", region: "EU" });
  assert.equal(eu.url, "https://eu.app.clio.com/api/v4/activities.json");
  assert.equal(eu.headers.Authorization, "Bearer T");
  const body = JSON.parse(eu.body);
  assert.deepStrictEqual(body.data, {
    type: "TimeEntry",
    date: "2026-07-08",
    quantity: 5400,
    note: "Reviewed the homepage draft.",
    matter: { id: 999 },
  });
});

check("extractRemoteId reads each provider's success shape; null on junk", () => {
  assert.equal(adapterFor("moco").extractRemoteId({ id: 555 }), "555");
  assert.equal(adapterFor("awork").extractRemoteId({ id: "guid-1" }), "guid-1");
  assert.equal(adapterFor("clio").extractRemoteId({ data: { id: 77 } }), "77");
  assert.equal(adapterFor("moco").extractRemoteId({}), null);
  assert.equal(adapterFor("awork").extractRemoteId({ id: 5 }), null); // awork ids are strings
  assert.equal(adapterFor("clio").extractRemoteId({}), null);
  assert.equal(adapterFor("moco").extractRemoteId(null), null);
});

check("planPush: skips unmapped and already-pushed, keeps the rest", () => {
  const entries = [
    { id: 1, project_id: 10, entry_date: "2026-07-08", rounded_minutes: 60, narrative: "a" },
    { id: 2, project_id: 20, entry_date: "2026-07-08", rounded_minutes: 30, narrative: "b" }, // no mapping
    { id: 3, project_id: 10, entry_date: "2026-07-08", rounded_minutes: 15, narrative: "c" }, // already pushed
  ];
  const mapping = { 10: "r-10" };
  const plan = planPush(entries, (pid) => mapping[pid] ?? null, new Set([3]));
  assert.equal(plan.toPush.length, 1);
  assert.equal(plan.toPush[0].entry.id, 1);
  assert.equal(plan.toPush[0].remoteId, "r-10");
  assert.deepStrictEqual(
    plan.skipped.sort((a, b) => a.entryId - b.entryId),
    [
      { entryId: 2, reason: "no-mapping" },
      { entryId: 3, reason: "already-pushed" },
    ]
  );
});

check("planPush: the pushable entry carries ONLY the four non-sensitive fields", () => {
  const entries = [
    { id: 1, project_id: 10, entry_date: "2026-07-08", rounded_minutes: 60, narrative: "a", evidence: "SECRET", app_summary: "SECRET" },
  ];
  const plan = planPush(entries, () => "r", new Set());
  assert.deepStrictEqual(Object.keys(plan.toPush[0].entry).sort(), ["entry_date", "id", "narrative", "rounded_minutes"]);
});

// --- transport (sendEntry) with an injected fetch ---
const asyncCheck = async (name, fn) => {
  try {
    await fn();
    console.log("PASS  " + name);
  } catch (e) {
    console.log("FAIL  " + name + " — " + e.message);
    failures.push(name);
  }
};

const moco = adapterFor("moco");
const acct = { subdomain: "acme", apiKey: "k" };

await asyncCheck("sendEntry: success reads the remote id and sends the built request", async () => {
  let seen = null;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 201, json: async () => ({ id: 900 }), text: async () => "" };
  };
  const r = await sendEntry(moco, acct, entry, "1:2", fakeFetch);
  assert.deepStrictEqual(r, { ok: true, remoteId: "900" });
  assert.equal(seen.url, "https://acme.mocoapp.com/api/v1/activities");
  assert.equal(seen.init.headers.Authorization, "Token token=k");
});

await asyncCheck("sendEntry: success with empty body falls back to the mapped remote id", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("no body"); }, text: async () => "" });
  const r = await sendEntry(moco, acct, entry, "1:2", fakeFetch);
  assert.deepStrictEqual(r, { ok: true, remoteId: "1:2" });
});

await asyncCheck("sendEntry: non-2xx returns an error with a body excerpt", async () => {
  const fakeFetch = async () => ({ ok: false, status: 422, json: async () => ({}), text: async () => "rate limit or bad task" });
  const r = await sendEntry(moco, acct, entry, "1:2", fakeFetch);
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("422"));
  assert.ok(r.message.includes("rate limit"));
});

await asyncCheck("sendEntry: a thrown fetch becomes a clean network error, never a crash", async () => {
  const fakeFetch = async () => { throw new Error("offline"); };
  const r = await sendEntry(moco, acct, entry, "1:2", fakeFetch);
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("offline"));
});

console.log();
process.exit(failures.length ? 1 : 0);

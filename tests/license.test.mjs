// Replica test for licensing (Schicht 6). Bundles the two pure modules
// (license-core + license-crypto) via esbuild and drives them exactly as the
// app does, including a REAL ECDSA P-256 sign→verify round-trip with an
// ephemeral keypair (proving the offline verification path end to end).
import {
  parseLicenseKey,
  entitlementState,
  recoveredValueCents,
  bytesToB64url,
  b64urlToBytes,
  TRIAL_DAYS,
  GRACE_DAYS,
} from "./.license-core.bundle.mjs";
import { verifyEcdsaP256 } from "./.license-crypto.bundle.mjs";
import assert from "node:assert";

const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log("PASS  " + name);
  } catch (e) {
    console.log("FAIL  " + name + " — " + e.message);
    failures.push(name);
  }
};

const DAY = 86_400_000;
const enc = new TextEncoder();

// --- helpers to mint a real signed key with an ephemeral keypair ---
const { subtle } = globalThis.crypto;
const keypair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pubRaw = new Uint8Array(await subtle.exportKey("raw", keypair.publicKey));

async function mintKey(payloadObj) {
  const payloadB64 = bytesToB64url(enc.encode(JSON.stringify(payloadObj)));
  const sig = new Uint8Array(
    await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keypair.privateKey, enc.encode(payloadB64))
  );
  return `VERA-${payloadB64}.${bytesToB64url(sig)}`;
}

await check("base64url round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 65, 66]);
  assert.deepStrictEqual([...b64urlToBytes(bytesToB64url(bytes))], [...bytes]);
});

await check("parseLicenseKey: valid key decodes payload; junk → null", () => {
  const raw = "VERA-eyJlIjoiYUBiLmNvbSIsInAiOiJwcm8iLCJpYXQiOjEsImV4cCI6bnVsbH0.AAAA";
  const p = parseLicenseKey(raw);
  assert.ok(p);
  assert.equal(p.payload.e, "a@b.com");
  assert.equal(p.payload.p, "pro");
  assert.equal(p.payload.exp, null);
  assert.equal(parseLicenseKey("not-a-key"), null);
  assert.equal(parseLicenseKey("only.one.dot.too.many"), null);
  assert.equal(parseLicenseKey(""), null);
  assert.equal(parseLicenseKey("eyJ4IjoxfQ.AAAA"), null); // wrong shape (no e/p/iat)
});

await check("real signed key verifies; tampered payload and wrong key fail", async () => {
  const key = await mintKey({ e: "user@firm.com", p: "pro", iat: 1_700_000_000, exp: null });
  const parsed = parseLicenseKey(key);
  assert.ok(parsed);
  assert.equal(await verifyEcdsaP256(pubRaw, parsed.signedMessage, parsed.signature), true);

  // Tamper: swap the plan in the payload, keep the old signature → must fail.
  const forgedPayload = bytesToB64url(enc.encode(JSON.stringify({ e: "user@firm.com", p: "firm", iat: 1_700_000_000, exp: null })));
  const forged = parseLicenseKey(`${forgedPayload}.${bytesToB64url(parsed.signature)}`);
  assert.ok(forged);
  assert.equal(await verifyEcdsaP256(pubRaw, forged.signedMessage, forged.signature), false);

  // A different (wrong) public key must not verify a genuine signature.
  const other = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const otherPub = new Uint8Array(await subtle.exportKey("raw", other.publicKey));
  assert.equal(await verifyEcdsaP256(otherPub, parsed.signedMessage, parsed.signature), false);
});

await check("entitlement: trial window then expiry", () => {
  const firstRunAtMs = 1_000_000_000_000;
  const day5 = entitlementState({ nowMs: firstRunAtMs + 5 * DAY, firstRunAtMs, license: null });
  assert.equal(day5.status, "trial");
  assert.equal(day5.entitled, true);
  assert.equal(day5.trialDaysLeft, TRIAL_DAYS - 5);
  const past = entitlementState({ nowMs: firstRunAtMs + (TRIAL_DAYS + 1) * DAY, firstRunAtMs, license: null });
  assert.equal(past.status, "trial_expired");
  assert.equal(past.entitled, false);
});

await check("entitlement: verified perpetual license is always licensed", () => {
  const e = entitlementState({
    nowMs: 5_000_000_000_000,
    firstRunAtMs: 1,
    license: { payload: { e: "a@b.com", p: "solo", iat: 1, exp: null }, verified: true },
  });
  assert.equal(e.status, "licensed");
  assert.equal(e.plan, "solo");
  assert.equal(e.entitled, true);
});

await check("entitlement: expired subscription enters grace, then locks", () => {
  const expSec = 2_000_000_000; // unix seconds
  const expMs = expSec * 1000;
  const lic = { payload: { e: "a@b.com", p: "pro", iat: 1, exp: expSec }, verified: true };
  const inGrace = entitlementState({ nowMs: expMs + 3 * DAY, firstRunAtMs: 1, license: lic });
  assert.equal(inGrace.status, "grace");
  assert.equal(inGrace.entitled, true);
  assert.equal(inGrace.graceDaysLeft, GRACE_DAYS - 3);
  const locked = entitlementState({ nowMs: expMs + (GRACE_DAYS + 1) * DAY, firstRunAtMs: 1, license: lic });
  assert.equal(locked.status, "expired");
  assert.equal(locked.entitled, false);
});

await check("entitlement: an expired license never DOWNGRADES an active trial", () => {
  const firstRunAtMs = 1_000_000_000_000;
  const expSec = 900_000_000; // expired long before the fresh trial
  const e = entitlementState({
    nowMs: firstRunAtMs + 2 * DAY, // day 2 of a fresh 14-day trial
    firstRunAtMs,
    license: { payload: { e: "a@b.com", p: "pro", iat: 1, exp: expSec }, verified: true },
  });
  assert.equal(e.status, "trial"); // the more favorable state wins
  assert.equal(e.entitled, true);
  // But once the trial is also over, the expired license shows through.
  const later = entitlementState({
    nowMs: firstRunAtMs + 30 * DAY,
    firstRunAtMs,
    license: { payload: { e: "a@b.com", p: "pro", iat: 1, exp: expSec }, verified: true },
  });
  assert.equal(later.status, "expired");
  assert.equal(later.entitled, false);
});

await check("entitlement: an UNVERIFIED license never grants access (falls back to trial)", () => {
  const firstRunAtMs = 1_000_000_000_000;
  const e = entitlementState({
    nowMs: firstRunAtMs + 2 * DAY,
    firstRunAtMs,
    license: { payload: { e: "a@b.com", p: "firm", iat: 1, exp: null }, verified: false },
  });
  assert.equal(e.status, "trial"); // ignored the unverified license entirely
  assert.equal(e.plan, null);
});

await check("recoveredValueCents: hours × rate, guards zero/negative", () => {
  assert.equal(recoveredValueCents(3_600_000, 12000), 12000); // 1h × 120€
  assert.equal(recoveredValueCents(1_800_000, 12000), 6000); // 0.5h
  assert.equal(recoveredValueCents(0, 12000), 0);
  assert.equal(recoveredValueCents(3_600_000, 0), 0);
});

console.log();
process.exit(failures.length ? 1 : 0);

// Pure licensing logic (Schicht 6): base64url, license-key parsing, and the
// entitlement state machine (trial → licensed → grace → expired). No crypto,
// no Tauri/DB — replica-tested via npm run test:license. The signature check
// itself lives in license-crypto.ts; this file only shapes the decision.

export type Plan = "solo" | "pro" | "firm";
const PLANS: Plan[] = ["solo", "pro", "firm"];

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 14; // after a subscription lapses, before paid features lock
const DAY_MS = 86_400_000;

// ---------- base64url (browser + node, no Buffer) ----------

export function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- License key ----------

export interface LicensePayload {
  e: string; // buyer email
  p: Plan; // plan
  iat: number; // issued-at, unix seconds
  exp: number | null; // expiry, unix seconds; null = perpetual
}

export interface ParsedLicense {
  payload: LicensePayload;
  signedMessage: Uint8Array; // exactly the bytes the signature covers
  signature: Uint8Array;
}

/**
 * Decode a "<payloadB64url>.<sigB64url>" key (an optional "VERA-" prefix is
 * tolerated). Returns null on any structural problem — a malformed key is
 * simply "no license", never an exception. The signature covers the ASCII
 * bytes of the payload segment, so verification needs no JSON re-encoding.
 */
export function parseLicenseKey(raw: string): ParsedLicense | null {
  if (typeof raw !== "string") return null;
  let key = raw.trim();
  if (/^vera-/i.test(key)) key = key.slice(5);
  const dot = key.indexOf(".");
  if (dot <= 0 || dot === key.length - 1) return null;
  const payloadB64 = key.slice(0, dot);
  const sigB64 = key.slice(dot + 1);
  if (sigB64.includes(".")) return null; // exactly one separator

  let payload: LicensePayload;
  let signature: Uint8Array;
  try {
    const json = new TextDecoder().decode(b64urlToBytes(payloadB64));
    const obj = JSON.parse(json);
    if (
      !obj ||
      typeof obj.e !== "string" ||
      !PLANS.includes(obj.p) ||
      typeof obj.iat !== "number" ||
      !(obj.exp === null || typeof obj.exp === "number")
    ) {
      return null;
    }
    payload = { e: obj.e, p: obj.p, iat: obj.iat, exp: obj.exp };
    signature = b64urlToBytes(sigB64);
  } catch {
    return null;
  }
  if (signature.length === 0) return null;

  return {
    payload,
    signedMessage: new TextEncoder().encode(payloadB64),
    signature,
  };
}

// ---------- Entitlement state machine ----------

export type EntitlementStatus =
  | "trial" // in the free trial window, no license
  | "trial_expired" // trial over, no valid license
  | "licensed" // valid, unexpired license
  | "grace" // license lapsed but within the grace period
  | "expired"; // license lapsed past grace

export interface Entitlement {
  status: EntitlementStatus;
  plan: Plan | null;
  entitled: boolean; // may use paid features (export)
  trialDaysLeft: number; // meaningful in "trial"
  graceDaysLeft: number; // meaningful in "grace"
  expiresAt: number | null; // license expiry in ms, if any
}

export interface EntitlementInput {
  nowMs: number;
  firstRunAtMs: number;
  license: { payload: LicensePayload; verified: boolean } | null;
}

const daysCeil = (ms: number) => Math.max(0, Math.ceil(ms / DAY_MS));

function trialState(nowMs: number, firstRunAtMs: number): Entitlement {
  const trialEnd = firstRunAtMs + TRIAL_DAYS * DAY_MS;
  if (nowMs <= trialEnd) {
    return {
      status: "trial",
      plan: null,
      entitled: true,
      trialDaysLeft: daysCeil(trialEnd - nowMs),
      graceDaysLeft: 0,
      expiresAt: null,
    };
  }
  return {
    status: "trial_expired",
    plan: null,
    entitled: false,
    trialDaysLeft: 0,
    graceDaysLeft: 0,
    expiresAt: null,
  };
}

/** The entitlement a verified license alone confers (licensed / grace / expired). */
export function licenseState(payload: LicensePayload, nowMs: number): Entitlement {
  const expiresAt = payload.exp === null ? null : payload.exp * 1000;
  if (expiresAt === null || nowMs <= expiresAt) {
    return { status: "licensed", plan: payload.p, entitled: true, trialDaysLeft: 0, graceDaysLeft: 0, expiresAt };
  }
  const graceEnd = expiresAt + GRACE_DAYS * DAY_MS;
  if (nowMs <= graceEnd) {
    return {
      status: "grace",
      plan: payload.p,
      entitled: true,
      trialDaysLeft: 0,
      graceDaysLeft: daysCeil(graceEnd - nowMs),
      expiresAt,
    };
  }
  return { status: "expired", plan: payload.p, entitled: false, trialDaysLeft: 0, graceDaysLeft: 0, expiresAt };
}

export function entitlementState(input: EntitlementInput): Entitlement {
  const { nowMs, firstRunAtMs, license } = input;
  const trial = trialState(nowMs, firstRunAtMs);

  if (license && license.verified) {
    const lic = licenseState(license.payload, nowMs);
    // A license that grants access always wins. But an expired license must
    // never DOWNGRADE a user who is still inside their free trial (e.g. a
    // returning customer pasting an old key on a fresh install) — keep the
    // more favorable of the two.
    if (lic.entitled || !trial.entitled) return lic;
    return trial;
  }

  return trial;
}

// ---------- Buy trigger ----------

/** "Vera found you €X": recovered time valued at a representative rate. */
export function recoveredValueCents(recoveredMs: number, rateCents: number): number {
  if (recoveredMs <= 0 || rateCents <= 0) return 0;
  return Math.round((recoveredMs / 3_600_000) * rateCents);
}

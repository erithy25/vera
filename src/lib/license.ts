import { settingsRepo } from "./db";
import {
  parseLicenseKey,
  entitlementState,
  licenseState,
  b64urlToBytes,
  Entitlement,
  LicensePayload,
  ParsedLicense,
  Plan,
} from "./license-core";
import { verifyEcdsaP256 } from "./license-crypto";

// The app-facing licensing layer (Schicht 6). Licensing is FULLY OFFLINE:
// the key is a payload signed by Vera's private key (held only by the
// purchase-webhook signer), and the app verifies it against the embedded
// public key below. Not a single byte leaves the device for licensing —
// the merchant of record (Lemon Squeezy / Paddle) handles payment, EU VAT,
// and emails the signed key to the buyer. This strengthens the product
// promise: even the license check is on-device.
//
// To go live, the owner replaces PUBLIC_KEY_B64URL with the public key of
// their production signing keypair (the private half signs
// {e,p,iat,exp} → base64url payload, then the ASCII payload bytes) and wires
// the webhook. Until then no key verifies, so every install runs on the
// 14-day trial (after which billing export locks until a real key ships).
const PUBLIC_KEY_B64URL =
  "BLV3HU-hUkI7mazHFL9VmN5sWd7j3UM_bDSlwgoNperCnVmOvctBUabNiDtkKNJ5s_z3_PTrF-24IIgIMtff_TA";

export type { Entitlement };

export const PLAN_LABELS: Record<Plan, string> = {
  solo: "Solo",
  pro: "Pro",
  firm: "Firm",
};

/** Verify an already-parsed key's signature offline (no re-parse). */
async function verifyParsed(parsed: ParsedLicense): Promise<boolean> {
  try {
    const pub = b64urlToBytes(PUBLIC_KEY_B64URL);
    return await verifyEcdsaP256(pub, parsed.signedMessage, parsed.signature);
  } catch {
    return false;
  }
}

/** Verify a key's signature offline. false for any malformed/forged key. */
export async function verifyLicenseKey(raw: string): Promise<boolean> {
  const parsed = parseLicenseKey(raw);
  if (!parsed) return false;
  return verifyParsed(parsed);
}

/** The current entitlement: trial / licensed / grace / expired. */
export async function currentEntitlement(): Promise<Entitlement> {
  const [firstRunAtMs, key] = await Promise.all([
    settingsRepo.ensureFirstRunAt(),
    settingsRepo.getLicenseKey(),
  ]);

  let license: { payload: LicensePayload; verified: boolean } | null = null;
  if (key) {
    const parsed = parseLicenseKey(key);
    if (parsed) {
      license = { payload: parsed.payload, verified: await verifyParsed(parsed) };
    }
  }

  return entitlementState({ nowMs: Date.now(), firstRunAtMs, license });
}

/** Validate and store a key. Returns an error message on failure, else null. */
export async function activateLicense(raw: string): Promise<string | null> {
  const key = raw.trim();
  if (!key) return "Enter your license key.";
  const parsed = parseLicenseKey(key);
  if (!parsed) return "That doesn't look like a Vera license key.";
  if (!(await verifyParsed(parsed))) return "This license key is not valid.";
  // Reject a genuine but already-expired (past grace) key so it can never
  // silently downgrade an active trial or store a dead key.
  if (!licenseState(parsed.payload, Date.now()).entitled) {
    return "This license key has expired. Renew it to continue exporting.";
  }
  await settingsRepo.setLicenseKey(key);
  return null;
}

export async function deactivateLicense(): Promise<void> {
  await settingsRepo.clearLicenseKey();
}

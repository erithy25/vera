// The one cryptographic step of licensing: verify an ECDSA P-256 / SHA-256
// signature with the Web Crypto API (present in the Tauri webview and in Node
// for the replica test). ECDSA P-256 is chosen over Ed25519 for broad
// WebKit/SubtleCrypto support. No Tauri/DB imports.

/**
 * Verify a raw (r‖s, 64-byte) ECDSA P-256 signature over `message` with a raw
 * uncompressed public key (65 bytes: 0x04‖X‖Y). Returns false on any error —
 * a bad key or signature is simply "not valid", never a throw.
 */
export async function verifyEcdsaP256(
  publicKeyRaw: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      publicKeyRaw,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, message);
  } catch {
    return false;
  }
}

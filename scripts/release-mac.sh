#!/usr/bin/env bash
# Build a SIGNED + NOTARIZED Vera, sign it for the in-app auto-updater, and
# publish both the DMG (first-time download) and the updater artifacts to the
# website. Existing users then get the new version automatically.
#
# One-time setup: copy .env.signing.example to .env.signing and fill it in
# (Apple credentials + your Vercel URL). Then, from the repo root:
#   bash scripts/release-mac.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Load credentials (gitignored)
if [ -f ".env.signing" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.signing
  set +a
else
  echo "No .env.signing found. Copy the template and fill it in:"
  echo "  cp .env.signing.example .env.signing"
  exit 1
fi

missing=0
for var in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID UPDATER_ENDPOINT; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required variable: $var"
    missing=1
  fi
done
if [ "$missing" = "1" ]; then
  echo
  echo "Fill these in .env.signing. Your installed signing identities are:"
  security find-identity -v -p codesigning || true
  exit 1
fi

# Strip a trailing slash from the endpoint, e.g. https://vera.vercel.app
UPDATER_ENDPOINT="${UPDATER_ENDPOINT%/}"

# Licensing needs no server: keys are verified offline against the public key
# embedded in the app (src/lib/license.ts). The updater endpoint below is the
# app's only network contact. The merchant of record (Lemon Squeezy / Paddle)
# delivers the signed key by email — no license API to configure here.

# Release-safety guard: package.json and tauri.conf.json versions must match,
# or the updater manifest advertises a version the bundle doesn't carry.
PKG_VERSION="$(node -e 'console.log(require("./package.json").version)')"
CONF_VERSION="$(node -e 'console.log(require("./src-tauri/tauri.conf.json").version)')"
if [ "$PKG_VERSION" != "$CONF_VERSION" ]; then
  echo "Version mismatch: package.json=$PKG_VERSION but tauri.conf.json=$CONF_VERSION."
  echo "Bump both to the same version before releasing."
  exit 1
fi

# --- Updater signing keypair (separate from the Apple certificate) ---
# Generated once and kept on this Mac. The public key is baked into the app;
# the private key signs each update so the app can verify it is genuine.
KEY_PATH="$HOME/.tauri/vera-updater.key"
if [ ! -f "$KEY_PATH" ]; then
  echo "==> Generating a one-time updater signing key at $KEY_PATH"
  mkdir -p "$HOME/.tauri"
  npx tauri signer generate -w "$KEY_PATH" -p ""
fi
PUBKEY="$(cat "$KEY_PATH.pub")"
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# --- Bake the updater config into tauri.conf.json (pubkey + endpoint) ---
node -e '
const fs = require("fs");
const p = "src-tauri/tauri.conf.json";
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.bundle = c.bundle || {};
c.bundle.createUpdaterArtifacts = true;
c.plugins = c.plugins || {};
c.plugins.updater = Object.assign({}, c.plugins.updater, {
  pubkey: process.argv[1],
  endpoints: [process.argv[2] + "/updater/latest.json"],
});
fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
console.log("Patched tauri.conf.json updater config.");
' "$PUBKEY" "$UPDATER_ENDPOINT"

# Detach any stale "Vera" disk images first, so the DMG bundler does not fail
# with a "device busy" / leftover-mount error. Safe no-op when none are mounted
# (bash leaves the unmatched glob literal, which "-d" then rejects).
for vol in /Volumes/Vera*; do
  [ -d "$vol" ] && hdiutil detach "$vol" -force >/dev/null 2>&1 || true
done

echo "==> Building, signing, notarizing and updater-signing Vera (several minutes)."
npm install
npm run tauri build

# --- Locate build outputs (this Mac uses a custom cargo target dir) ---
roots=()
[ -n "${CARGO_TARGET_DIR:-}" ] && roots+=("$CARGO_TARGET_DIR")
[ -d "$HOME/.cargo-target" ] && roots+=("$HOME/.cargo-target")
[ -d "src-tauri/target" ] && roots+=("src-tauri/target")

dmg=""; tgz=""; sig=""
if [ "${#roots[@]}" -gt 0 ]; then
  dmg="$(find "${roots[@]}" -name 'Vera_*.dmg' -path '*bundle/dmg/*' 2>/dev/null | xargs -I{} stat -f '%m %N' {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
  tgz="$(find "${roots[@]}" -name '*.app.tar.gz' -path '*bundle/macos/*' 2>/dev/null | xargs -I{} stat -f '%m %N' {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
  sig="$(find "${roots[@]}" -name '*.app.tar.gz.sig' -path '*bundle/macos/*' 2>/dev/null | xargs -I{} stat -f '%m %N' {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
fi

if [ -z "$dmg" ] || [ -z "$tgz" ] || [ -z "$sig" ]; then
  echo "Build finished but some artifacts were not found:"
  echo "  dmg=$dmg"
  echo "  tgz=$tgz"
  echo "  sig=$sig"
  exit 1
fi

VERSION="$(node -e 'console.log(require("./src-tauri/tauri.conf.json").version)')"

mkdir -p website/public/downloads website/public/updater
cp "$dmg" website/public/downloads/Vera.dmg
cp "$tgz" website/public/downloads/Vera.app.tar.gz

# --- Write the update manifest the app polls on launch ---
node -e '
const fs = require("fs");
const [version, sigPath, endpoint] = process.argv.slice(1);
const signature = fs.readFileSync(sigPath, "utf8").trim();
const manifest = {
  version,
  notes: "A new version of Vera is available.",
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature,
      url: endpoint + "/downloads/Vera.app.tar.gz",
    },
  },
};
fs.writeFileSync("website/public/updater/latest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log("Wrote website/public/updater/latest.json for version " + version);
' "$VERSION" "$sig" "$UPDATER_ENDPOINT"

echo
echo "==> Done. Built Vera $VERSION"
echo "    First-time download -> website/public/downloads/Vera.dmg"
echo "    Auto-update         -> website/public/downloads/Vera.app.tar.gz + updater/latest.json"
echo
echo "Verify notarization (should say source=Notarized Developer ID):"
echo "  spctl -a -vv -t install \"$dmg\""
echo
echo "Publish it (Vercel redeploys automatically on push):"
echo "  git add -A && git commit -m \"Release Vera $VERSION\" && git push"

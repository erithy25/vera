#!/usr/bin/env bash
# Build a SIGNED + NOTARIZED Vera DMG and drop it into the website so the
# download opens cleanly (no "Vera is damaged" warning).
#
# One-time setup: copy .env.signing.example to .env.signing and fill it in.
# Then run from the repo root:   bash scripts/release-mac.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Load signing credentials (gitignored)
if [ -f ".env.signing" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.signing
  set +a
else
  echo "No .env.signing found."
  echo "Copy the template and fill in your Apple details:"
  echo "  cp .env.signing.example .env.signing"
  exit 1
fi

# Verify the required variables are present
missing=0
for var in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
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

echo "==> Building, signing and notarizing Vera. This can take several minutes."
npm install
npm run tauri build

# Find the freshly built DMG wherever Cargo placed it (this Mac uses a custom
# target dir, so search the likely roots and take the newest match).
roots=()
[ -n "${CARGO_TARGET_DIR:-}" ] && roots+=("$CARGO_TARGET_DIR")
[ -d "$HOME/.cargo-target" ] && roots+=("$HOME/.cargo-target")
[ -d "src-tauri/target" ] && roots+=("src-tauri/target")

dmg=""
if [ "${#roots[@]}" -gt 0 ]; then
  dmg=$(find "${roots[@]}" -name "Vera_*.dmg" -path "*bundle/dmg/*" 2>/dev/null \
        | xargs -I{} stat -f "%m %N" {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2- || true)
fi

if [ -z "$dmg" ]; then
  echo
  echo "Build finished, but the DMG could not be located automatically."
  echo "Look under .../release/bundle/dmg/ and copy it to:"
  echo "  website/public/downloads/Vera.dmg"
  exit 0
fi

echo "==> Built: $dmg"
mkdir -p website/public/downloads
cp "$dmg" website/public/downloads/Vera.dmg
echo "==> Copied to website/public/downloads/Vera.dmg"
echo
echo "Verify it is notarized (should say: source=Notarized Developer ID):"
echo "  spctl -a -vv -t install \"$dmg\""
echo
echo "Then commit so Vercel serves the signed build:"
echo "  git add website/public/downloads/Vera.dmg && git commit -m 'Publish signed Vera DMG' && git push origin claude/cool-albattani-ojjoby"

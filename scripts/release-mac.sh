#!/usr/bin/env bash
# Build a SIGNED + NOTARIZED Vera and publish it, so that the download button on
# the live website hands over this build and nothing else.
#
# One-time setup: copy .env.signing.example to .env.signing and fill it in
# (Apple credentials + your Vercel URL). Then, from the repo root:
#   bash scripts/release-mac.sh
#
# It builds, checks the result really is signed and notarized, copies the
# artifacts into the website, proves they agree with each other, commits them to
# the branch Vercel deploys from, pushes, waits for the deploy, and finally
# downloads the file from the live site and compares it byte for byte with the
# one it just built. If any of that does not hold, it stops and says which.
set -euo pipefail

cd "$(dirname "$0")/.."

# The branch Vercel builds production from. A release pushed anywhere else
# changes nothing a visitor can see.
PRODUCTION_BRANCH="main"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

# --- Credentials (gitignored) ---------------------------------------------
if [ -f ".env.signing" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.signing
  set +a
else
  die "No .env.signing found. Copy the template and fill it in:
  cp .env.signing.example .env.signing"
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

# Strip a trailing slash, e.g. https://vera-sandy.vercel.app
UPDATER_ENDPOINT="${UPDATER_ENDPOINT%/}"

# --- The working tree has to be publishable --------------------------------
# Releasing from a dirty tree means the commit carries changes nobody reviewed,
# and the artifacts stop corresponding to any particular state of the source.
if [ -n "$(git status --porcelain -- . ':!website/public/downloads' ':!website/public/updater')" ]; then
  git status --short -- . ':!website/public/downloads' ':!website/public/updater'
  die "There are uncommitted changes outside the release artifacts. Commit or stash them first."
fi

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# --- Updater signing keypair (separate from the Apple certificate) ---------
# Generated once and kept on this Mac. The public key is baked into the app; the
# private key signs each update so the app can verify it is genuine. Losing it
# means existing installs can never auto-update again, so it is never
# regenerated silently.
KEY_PATH="$HOME/.tauri/vera-updater.key"
if [ ! -f "$KEY_PATH" ]; then
  echo "No updater signing key at $KEY_PATH."
  echo "If Vera has been released before, that key MUST be restored from backup:"
  echo "a new one breaks auto-update for everyone who already has the app."
  read -r -p "Generate a NEW key and accept that? [y/N] " reply
  [ "$reply" = "y" ] || die "Restore \$HOME/.tauri/vera-updater.key and run again."
  mkdir -p "$HOME/.tauri"
  npx tauri signer generate -w "$KEY_PATH" -p ""
fi
PUBKEY="$(cat "$KEY_PATH.pub")"
# Assigned before exporting on purpose: `export X="$(cat …)"` reports the exit
# status of `export`, not of `cat`, so an unreadable key would sail through as
# an empty string and produce an update no installed app can verify.
SIGNING_KEY="$(cat "$KEY_PATH")"
[ -n "$SIGNING_KEY" ] || die "The updater signing key at $KEY_PATH is empty."
export TAURI_SIGNING_PRIVATE_KEY="$SIGNING_KEY"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# --- Bake the updater config into tauri.conf.json --------------------------
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
' "$PUBKEY" "$UPDATER_ENDPOINT"

VERSION="$(node -e 'console.log(require("./src-tauri/tauri.conf.json").version)')"
step "Releasing Vera $VERSION"

# Detach stale "Vera" disk images, or the DMG bundler fails with a busy device.
for vol in /Volumes/Vera*; do
  if [ -d "$vol" ]; then hdiutil detach "$vol" -force >/dev/null 2>&1 || true; fi
done

step "Building, signing, notarizing and updater-signing (several minutes)"
npm install
npm run tauri build

# --- Locate the build outputs ----------------------------------------------
roots=()
if [ -n "${CARGO_TARGET_DIR:-}" ]; then roots+=("$CARGO_TARGET_DIR"); fi
if [ -d "$HOME/.cargo-target" ];  then roots+=("$HOME/.cargo-target"); fi
if [ -d "src-tauri/target" ];     then roots+=("src-tauri/target"); fi
[ "${#roots[@]}" -gt 0 ] || die "No cargo target directory found."

newest() { # newest() <name-pattern> <path-pattern>
  # -print0/-0: a path like /Users/Erik Thye/… would otherwise be split in two
  # and every artifact silently "not found".
  find "${roots[@]}" -name "$1" -path "$2" -print0 2>/dev/null \
    | xargs -0 -I{} stat -f '%m %N' {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-
}
dmg="$(newest 'Vera_*.dmg'     '*bundle/dmg/*')"
tgz="$(newest '*.app.tar.gz'   '*bundle/macos/*')"
sig="$(newest '*.app.tar.gz.sig' '*bundle/macos/*')"
app="$(newest 'Vera.app'       '*bundle/macos/*')"

if [ -z "$dmg" ] || [ -z "$tgz" ] || [ -z "$sig" ]; then
  die "Build finished but artifacts are missing:
  dmg=$dmg
  tgz=$tgz
  sig=$sig"
fi

# The artifacts are found by modification time, which is right until an older
# build happens to be newer on disk. The version in the filename is the check
# that the thing being published is the thing that was just built — without it a
# release can quietly ship the previous binary under the new version number.
case "$(basename "$dmg")" in
  *"$VERSION"*) : ;;
  *) die "The newest DMG is $(basename "$dmg"), which is not version $VERSION.
Delete stale bundles under the cargo target directory and build again." ;;
esac

step "Checking the build is actually signed and notarized"
if [ -n "$app" ]; then
  codesign --verify --deep --strict --verbose=1 "$app" 2>&1 | sed 's/^/    /' \
    || die "The .app does not pass codesign verification."
fi
# `spctl` is what Gatekeeper itself uses. Without this a release can look
# perfect and still greet every visitor with "cannot be opened because the
# developer cannot be verified".
spctl_out="$(spctl -a -vv -t install "$dmg" 2>&1 || true)"
echo "$spctl_out" | sed 's/^/    /'
case "$spctl_out" in
  *"source=Notarized Developer ID"*) : ;;
  *) die "The DMG is not notarized (spctl did not report a Notarized Developer ID).
Publishing it would show a Gatekeeper warning to everyone who downloads it." ;;
esac

# --- Copy into the website --------------------------------------------------
step "Publishing into the website"
mkdir -p website/public/downloads website/public/updater
cp "$dmg" website/public/downloads/Vera.dmg
cp "$tgz" website/public/downloads/Vera.app.tar.gz

# A copy can fail in ways that leave a plausible-looking file behind. Compare.
[ "$(shasum -a 256 "$dmg" | cut -d' ' -f1)" = "$(shasum -a 256 website/public/downloads/Vera.dmg | cut -d' ' -f1)" ] \
  || die "The copied DMG does not match the one that was built."

# The checksum beside the file is what ties the download to the version number
# on the page — and lets anyone verify their own download by hand.
printf '%s  Vera.dmg  v%s\n' \
  "$(shasum -a 256 website/public/downloads/Vera.dmg | cut -d' ' -f1)" "$VERSION" \
  > website/public/downloads/Vera.dmg.sha256

# --- The manifest the installed app polls on launch ------------------------
node -e '
const fs = require("fs");
const [version, sigPath, endpoint] = process.argv.slice(1);
const manifest = {
  version,
  notes: "A new version of Vera is available.",
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature: fs.readFileSync(sigPath, "utf8").trim(),
      url: endpoint + "/downloads/Vera.app.tar.gz",
    },
  },
};
fs.writeFileSync("website/public/updater/latest.json", JSON.stringify(manifest, null, 2) + "\n");
' "$VERSION" "$sig" "$UPDATER_ENDPOINT"

step "Checking the release agrees with itself"
node scripts/check-release.mjs || die "The release is inconsistent. Nothing has been pushed."

# --- Commit and push to the branch that is actually deployed ---------------
step "Publishing to '$PRODUCTION_BRANCH' (the branch Vercel builds production from)"
git add website/public/downloads/Vera.dmg \
        website/public/downloads/Vera.app.tar.gz \
        website/public/downloads/Vera.dmg.sha256 \
        website/public/updater/latest.json \
        src-tauri/tauri.conf.json
if git diff --cached --quiet; then
  echo "    Nothing changed — this exact build is already published."
else
  git commit -q -m "Release Vera $VERSION"
  echo "    Committed on $START_BRANCH"
fi

git fetch origin "$PRODUCTION_BRANCH" --quiet
if [ "$START_BRANCH" != "$PRODUCTION_BRANCH" ]; then
  git push -u origin "$START_BRANCH"
  git checkout "$PRODUCTION_BRANCH"
  git merge --ff-only "$START_BRANCH" \
    || { git checkout "$START_BRANCH"; die "'$PRODUCTION_BRANCH' has commits that '$START_BRANCH' does not.
Merge them yourself, then run this again — this script will not rewrite history."; }
fi
git push -u origin "$PRODUCTION_BRANCH"
if [ "$START_BRANCH" != "$PRODUCTION_BRANCH" ]; then git checkout "$START_BRANCH"; fi

# --- Wait for the deploy, then check the live site --------------------------
step "Waiting for $UPDATER_ENDPOINT to serve $VERSION"
deployed=0
for _ in $(seq 1 40); do
  live="$(curl -fsS --max-time 20 "$UPDATER_ENDPOINT/updater/latest.json" 2>/dev/null \
          | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{console.log("")}})' || true)"
  if [ "$live" = "$VERSION" ]; then deployed=1; break; fi
  printf '.'
  sleep 15
done
echo
[ "$deployed" = "1" ] || die "The deploy did not appear within ten minutes.
Check the build log at https://vercel.com — the artifacts are pushed, so re-running
this script once the deploy succeeds will confirm it."

step "Confirming the live download is exactly this build"
node scripts/check-release.mjs --live "$UPDATER_ENDPOINT" \
  || die "The live site does not serve the build that was just made."

printf '\n\033[32m==> Vera %s is live at %s\033[0m\n' "$VERSION" "$UPDATER_ENDPOINT"
echo "    Download button -> /downloads/Vera.dmg"
echo "    Existing installs will be offered the update on their next launch."

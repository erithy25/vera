#!/usr/bin/env bash
# ONE command that does everything automatable for a fresh Vera release:
#   build + sign + notarize + publish to the website, push the download branch
#   AND the production main branch (so Vercel redeploys), install the new app
#   into /Applications, and reset the stale Screen Recording grant.
#
# Run it with:
#   git fetch origin claude/cool-albattani-ojjoby && git reset --hard FETCH_HEAD && bash scripts/do-everything.sh
#
# The ONLY things left after it finishes are the two macOS actions no program
# can do for you, which it prints at the end: tick Vera in Screen Recording,
# and approve the Touch ID prompt.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> [1/6] Ensuring the custom build target dir…"
mkdir -p src-tauri/.cargo
printf '[build]\ntarget-dir = "%s/.cargo-target/vera"\n' "$HOME" > src-tauri/.cargo/config.toml

echo "==> [2/6] Building + signing + notarizing + publishing to the website (several minutes)…"
bash scripts/release-mac.sh

VERSION="$(node -e 'console.log(require("./src-tauri/tauri.conf.json").version)')"
echo "==> Built Vera ${VERSION}"

echo "==> [3/6] Committing + pushing (download branch + production main)…"
git add -A
git commit -m "Release Vera ${VERSION}" || echo "   (nothing new to commit)"
git push origin "HEAD:claude/cool-albattani-ojjoby"
# main is the Vercel production branch -> this redeploys vera-sandy.vercel.app.
git push --force origin "HEAD:main"

echo "==> [4/6] Installing the freshly-built app into /Applications…"
APP="$( { find "$HOME/.cargo-target/vera/release/bundle/macos" -maxdepth 1 -name '*.app' 2>/dev/null; \
          find "src-tauri/target/release/bundle/macos" -maxdepth 1 -name '*.app' 2>/dev/null; } | head -1 || true)"
osascript -e 'quit app "Vera"' >/dev/null 2>&1 || true
sleep 1
if [ -n "${APP:-}" ] && [ -d "$APP" ]; then
  rm -rf "/Applications/Vera.app"
  cp -R "$APP" "/Applications/Vera.app"
  echo "   Installed /Applications/Vera.app (${VERSION})"
else
  echo "   NOTE: built .app not auto-found — open the DMG and drag Vera into Programme manually."
fi

echo "==> [5/6] Resetting Vera's stale Screen Recording grant…"
tccutil reset ScreenCapture app.vera.desktop || true

echo "==> [6/6] Opening Vera + the Screen Recording settings pane…"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture" >/dev/null 2>&1 || true
sleep 1
open -a Vera >/dev/null 2>&1 || true

cat <<NOTE

==================================================================
 EVERYTHING AUTOMATED IS DONE.
   - Vera ${VERSION} built, signed, notarized, installed.
   - Website (download + manifest) published; production redeploying
     at https://vera-sandy.vercel.app

 Two things only YOU can do (macOS forbids any program from doing them):
   1) In the "Screen Recording" list that just opened  ->  tick  Vera
   2) Back in Vera, when Touch ID prompts              ->  approve it
   Then click REFRESH in Vera  ->  GRANTED, and it sees your screen.
==================================================================
NOTE

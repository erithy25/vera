#!/usr/bin/env bash
# Reset Vera's Screen Recording permission to a clean state and open the right
# places to re-grant it. Use this after installing a freshly-signed build when
# the permission list shows stale/duplicate "vera" rows, or when capture will
# not start even though the toggle looks on.
#
# Why this is needed: macOS ties Screen Recording to a binary's code signature,
# and it freezes the result for a running process until the app is relaunched.
# Unsigned test builds each registered their own entry, and a just-granted
# permission reads "off" until restart. This resets the app's grant so the
# current signed build can be granted cleanly.
#
# It only RESETS Screen Recording (never Accessibility, so a working a11y grant
# is left untouched), and it never touches any other app.
set -u

BUNDLE_ID="app.vera.desktop"

echo "==> Quitting Vera (if running)…"
osascript -e 'quit app "Vera"' >/dev/null 2>&1 || true
sleep 1

echo "==> Resetting Vera's Screen Recording permission (clears the stale grant)…"
tccutil reset ScreenCapture "$BUNDLE_ID" || true

echo "==> Opening the Screen Recording settings pane…"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture" >/dev/null 2>&1 || true
sleep 1

echo "==> Reopening Vera…"
open -a Vera >/dev/null 2>&1 || true

cat <<'NOTE'

Almost done — one toggle only macOS can ask YOU to flip:

  1. In Vera, on the "Screen Recording" row, click "Open Settings".
     That re-adds the CURRENT signed Vera to the list. Tick it.
     (Old generic "vera" rows are harmless leftovers; remove them with "−" if you like.)

  2. Restart Vera once so the frozen permission cache refreshes:
        osascript -e 'quit app "Vera"'; sleep 2; open -a Vera

  3. Click REFRESH in Vera -> GRANTED, and capture starts.

On Vera 0.5.2+ step 2 is unnecessary: the app detects the grant on its own
within ~10 seconds.
NOTE

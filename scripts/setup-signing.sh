#!/usr/bin/env bash
# Create .env.signing, and prove the credentials in it actually work.
#
#   bash scripts/setup-signing.sh
#
# Everything here is a one-time setup. Apple's part of it — the membership and
# the certificate — cannot be automated; this finds what is already on the Mac,
# asks for the two things it cannot know, and then *checks with Apple* before
# writing anything. Without that check the first thing that tells you a password
# is wrong is a build failing ten minutes in, at the notarization step.
set -euo pipefail

cd "$(dirname "$0")/.."

bold()  { printf '\033[1m%s\033[0m\n' "$1"; }
warn()  { printf '\033[33m%s\033[0m\n' "$1"; }
die()   { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

if [ "$(uname)" != "Darwin" ]; then
  die "Signing only happens on a Mac."
fi

if [ -f ".env.signing" ]; then
  warn ".env.signing already exists."
  read -r -p "Overwrite it? [y/N] " reply
  [ "$reply" = "y" ] || { echo "Left it alone."; exit 0; }
fi

# --- 0. The toolchain ------------------------------------------------------
# The full Xcode app is not needed. The Command Line Tools are: `swiftc` builds
# Vera's two Swift sidecars, `codesign` signs the result, and `notarytool` is
# what talks to Apple. Rather than assume which of those a given Command Line
# Tools version ships, ask this Mac.
bold "Checking the toolchain"
tools_missing=0
for tool in swiftc codesign notarytool; do
  if path="$(xcrun --find "$tool" 2>/dev/null)" && [ -n "$path" ]; then
    printf '  %-11s %s\n' "$tool" "$path"
  else
    printf '  %-11s \033[31mmissing\033[0m\n' "$tool"
    tools_missing=1
  fi
done

if [ "$tools_missing" = "1" ]; then
  cat <<'TXT'

  Install Apple's Command Line Tools — about 1 GB, and not the full 10 GB Xcode:

      xcode-select --install

  A dialog appears; let it finish, then run this script again.

  If they are already installed and something is still missing, the developer
  directory may be pointing at nothing:

      xcode-select -p                       # what is it set to?
      sudo xcode-select --reset             # back to the Command Line Tools

  Only `notarytool` missing while the rest is there is the one case that does
  need the full Xcode from the App Store.

TXT
  exit 1
fi
echo "  All present — the full Xcode app is not required."

# --- 1. The certificate ----------------------------------------------------
bold "Looking for a Developer ID Application certificate"

identities="$(security find-identity -v -p codesigning 2>/dev/null | grep 'Developer ID Application:' || true)"
if [ -z "$identities" ]; then
  cat <<'TXT'

  None found on this Mac.

  This is the certificate Apple issues for apps distributed outside the App
  Store. It needs a paid Apple Developer Program membership (99 USD a year):
  https://developer.apple.com/programs/

  Once the membership is active, there are two routes to the certificate. The
  second one needs no Xcode at all.

  WITH XCODE
    Settings → Accounts → add your Apple ID → Manage Certificates…
    → "+" bottom left → Developer ID Application

  WITHOUT XCODE — Keychain Access, which is already on every Mac
    1. Open Keychain Access
    2. Menu "Keychain Access" → Certificate Assistant
       → Request a Certificate From a Certificate Authority…
    3. Your Apple ID email, your name, choose "Saved to disk", Continue.
       It writes CertificateSigningRequest.certSigningRequest
    4. https://developer.apple.com/account/resources/certificates → "+"
    5. Choose Developer ID Application, upload that file, Continue
    6. Download the .cer it gives you and double-click it. It installs into
       the login keychain, next to the private key the assistant just made.

  Then run this script again.

TXT
  exit 1
fi

echo
count="$(printf '%s\n' "$identities" | wc -l | tr -d ' ')"
if [ "$count" = "1" ]; then
  IDENTITY="$(printf '%s' "$identities" | sed -n 's/.*"\(.*\)".*/\1/p')"
  echo "  Found: $IDENTITY"
else
  echo "  More than one certificate is installed:"
  printf '%s\n' "$identities" | nl -w4 -s') '
  read -r -p "  Which number? " pick
  IDENTITY="$(printf '%s\n' "$identities" | sed -n "${pick}p" | sed -n 's/.*"\(.*\)".*/\1/p')"
  [ -n "$IDENTITY" ] || die "That was not one of the options."
  echo "  Using: $IDENTITY"
fi

# "Developer ID Application: Some Name (AB12CD34EF)" — the part in brackets is
# the Team ID, so there is no reason to ask for it and no way to mistype it.
TEAM_ID="$(printf '%s' "$IDENTITY" | sed -n 's/.*(\([A-Z0-9]\{10\}\))$/\1/p')"
[ -n "$TEAM_ID" ] || die "Could not read the Team ID out of that certificate name."
echo "  Team ID: $TEAM_ID"

# --- 2. The two things this script cannot know -----------------------------
echo
bold "Your Apple ID"
echo "  The email address the developer membership is under."
read -r -p "  Apple ID: " APPLE_ID_IN
[ -n "$APPLE_ID_IN" ] || die "An Apple ID is required."

echo
bold "An app-specific password"
cat <<'TXT'
  NOT your normal Apple password. Apple issues a separate one per app:

  1. https://appleid.apple.com  →  sign in
  2. Sign-In and Security  →  App-Specific Passwords  →  "+"
  3. Call it "Vera notarization"
  4. Copy the password it shows — it looks like abcd-efgh-ijkl-mnop
     Apple shows it exactly once.

TXT
read -r -s -p "  Paste it here (it will not be shown): " APPLE_PASSWORD_IN
echo
[ -n "$APPLE_PASSWORD_IN" ] || die "A password is required."

# Typing the normal Apple ID password here is the obvious mistake, and it fails
# in a way that is hard to read. The format is fixed, so say so now.
case "$APPLE_PASSWORD_IN" in
  ????-????-????-????) : ;;
  *) warn "  That is not in Apple's xxxx-xxxx-xxxx-xxxx form — check you copied the app-specific password, not your Apple ID password." ;;
esac

# --- 3. The website the updater points at ----------------------------------
echo
bold "Your website"
DEFAULT_ENDPOINT="https://vera-sandy.vercel.app"
read -r -p "  Base URL [$DEFAULT_ENDPOINT]: " ENDPOINT_IN
ENDPOINT_IN="${ENDPOINT_IN:-$DEFAULT_ENDPOINT}"
ENDPOINT_IN="${ENDPOINT_IN%/}"

# --- 4. Ask Apple whether any of this is true ------------------------------
echo
bold "Checking the credentials with Apple"
if ! xcrun notarytool history \
      --apple-id "$APPLE_ID_IN" \
      --password "$APPLE_PASSWORD_IN" \
      --team-id "$TEAM_ID" >/dev/null 2>&1; then
  cat <<TXT

  Apple rejected them. Nothing has been written. The usual causes, in order:

    · the app-specific password was mistyped, or it is the normal Apple ID
      password rather than an app-specific one
    · the Apple ID is not the one the developer membership is under
    · the membership has lapsed or has not finished activating

  Check at https://developer.apple.com/account — the membership has to say
  active — and run this again.

TXT
  exit 1
fi
echo "  Apple accepted them."

# --- 5. Write it -----------------------------------------------------------
umask 077
cat > .env.signing <<TXT
# Written by scripts/setup-signing.sh. Gitignored — never commit this.
APPLE_SIGNING_IDENTITY="$IDENTITY"
APPLE_ID="$APPLE_ID_IN"
APPLE_PASSWORD="$APPLE_PASSWORD_IN"
APPLE_TEAM_ID="$TEAM_ID"
UPDATER_ENDPOINT="$ENDPOINT_IN"
TXT
chmod 600 .env.signing

# The file holds a working credential. Belt and braces: git ignores it, but
# confirm that rather than trust it.
if ! git check-ignore -q .env.signing; then
  die ".env.signing is NOT gitignored. Do not commit. Add it to .gitignore first."
fi

echo
printf '\033[32m%s\033[0m\n' "Done. .env.signing is written, readable only by you, and git ignores it."
echo
echo "Release Vera with:"
echo "  npm run release"

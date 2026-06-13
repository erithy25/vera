# Signing & notarizing Vera (so the download "just works")

The "Vera is damaged" warning appears because the app is **unsigned**. Once you
sign it with your Apple **Developer ID** certificate and have Apple **notarize**
it, anyone can download Vera from the site and open it normally.

You only do the setup (steps 1–4) **once**. After that, building a release is a
single command.

### Do I need the full Xcode app?

**No.** Certificate creation is done entirely with **Keychain Access** (built into
macOS) plus the Apple Developer website. You only need the **Xcode Command Line
Tools** for `codesign` and `notarytool` — and you already have them, because
building Vera requires them. Confirm with:

```bash
xcrun notarytool --version
```

If that prints a version, you're set. If it says the tool can't be found, install
the Command Line Tools (small download, not the full Xcode app):

```bash
xcode-select --install
```

---

## 1. Create a "Developer ID Application" certificate (no Xcode needed)

1. Open **Keychain Access** → menu **Certificate Assistant → Request a Certificate
   From a Certificate Authority…** → enter your email, leave "CA Email" blank,
   choose **Saved to disk** → save the `.certSigningRequest` file (e.g. to the Desktop).
2. Go to https://developer.apple.com/account/resources/certificates → click **+** →
   choose **Developer ID Application** → upload the request file → **Download** the
   resulting `.cer` → **double-click it** to install into your login Keychain.

(Developer ID certificates can only be created by the **Account Holder** of the
Developer Program — that's you, on your own account.)

*If you do have Xcode, the shortcut is: Xcode → Settings → Accounts → Manage
Certificates → + → Developer ID Application.*

## 2. Find your signing identity

In Terminal:

```bash
security find-identity -v -p codesigning
```

Copy the full line in quotes, e.g.
`Developer ID Application: Erik Thye (AB12CD34EF)`.
The 10 characters in parentheses are your **Team ID**.

## 3. Create an app-specific password (for notarization)

https://appleid.apple.com → **Sign-In and Security** → **App-Specific
Passwords** → **+** → name it "Vera notarization". You get something like
`abcd-efgh-ijkl-mnop`. (This is **not** your normal Apple password.)

## 4. Fill in your credentials

```bash
cp .env.signing.example .env.signing
```

Open `.env.signing` and set:

- `APPLE_SIGNING_IDENTITY` — the full identity from step 2
- `APPLE_ID` — your Apple ID email
- `APPLE_PASSWORD` — the app-specific password from step 3
- `APPLE_TEAM_ID` — the 10-character Team ID from step 2

`.env.signing` is gitignored, so these secrets never leave your Mac.

---

## 5. Build a signed + notarized release

From the repo root:

```bash
bash scripts/release-mac.sh
```

This installs deps, runs `tauri build` (which now signs **and** notarizes —
notarization can take a few minutes while Apple processes it), then copies the
finished DMG to `website/public/downloads/Vera.dmg`.

Verify it worked (should print `source=Notarized Developer ID`):

```bash
spctl -a -vv -t install /Users/erikthye/.cargo-target/vera/release/bundle/dmg/Vera_*.dmg
```

Then publish for the website:

```bash
git add website/public/downloads/Vera.dmg
git commit -m "Publish signed Vera DMG"
git push origin claude/cool-albattani-ojjoby
```

Now the "Download for Mac" button serves a signed, notarized build that opens
without any warning. To release a new version, just run the script again.

---

### Notes

- No secrets are stored in the repo or in `tauri.conf.json`; everything reads
  from `.env.signing` (gitignored) via environment variables that Tauri picks up.
- If `security find-identity` shows nothing under "Developer ID Application",
  step 1 didn't complete — the certificate isn't in your Keychain yet.
- Notarization requires an active paid Apple Developer Program membership.

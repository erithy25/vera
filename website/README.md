# Vera — Website

The marketing homepage for Vera. A small Vite + React + Tailwind 4 site that
reuses Vera's warm monochrome design tokens.

## Run locally

```bash
cd website
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # outputs to website/dist
npm run preview    # serve the production build locally
```

## Deploy to Vercel

The site is a standard Vite app, so Vercel detects it automatically.

1. Import the `erithy25/vera` repo in Vercel.
2. Set **Root Directory** to `website`.
3. Framework preset: **Vite** (auto-detected). Build command `npm run build`,
   output directory `dist` (both auto-filled).
4. Deploy.

## Figure 1 is not a mock-up — and there is a check that keeps it honest

The interactive figure in *The problem* lets a visitor turn a video frame away
from the camera until the reader starts making mistakes, and shows live whether
an exact pattern and Vera each still find the key. **Every answer it gives is
computed, not scripted.** `src/reader.ts` is a port of the engine's own gates —
the confusion table and fuzzy prefix from `ocr.rs`, the randomness score from
`entropy.rs`, and the length/character-set/randomness gate from `detect.rs`.

A second copy of a rule is a copy that drifts, so the port is pinned to the real
engine over the *entire* space of strings the figure can produce — not a sample:

```bash
cd website
node --experimental-strip-types scripts/check-reader.mjs
```

That compares the port against `scripts/reader.oracle.tsv`, which is the real
Rust engine's verdict on every one of those strings. Regenerate the ground truth
whenever the engine changes:

```bash
cd website
node --experimental-strip-types scripts/reader-corpus.mjs \
  | (cd ../src-tauri/core && cargo run -q --example reader_oracle) \
  > scripts/reader.oracle.tsv
```

If the check fails, the site is about to claim something the product does not
do. Fix the port, or the figure, before shipping.

**Scope.** The port covers the pattern path for one pattern, the OpenAI project
key — the only thing the figure evaluates. It does not port the assignment, PEM
or connection-string detectors, nor the negative filters. The check is run over
exactly the inputs the figure can reach and no claim is made beyond them.

## The "Download for Mac" button

The button downloads Vera **directly** from this site — no redirect to GitHub.
It points at `/downloads/Vera.dmg`, served from `public/downloads/`, which is
committed so Vercel ships it with the site.

### One-time: signing

Notarization needs a paid Apple Developer Program membership (99 USD/year) and a
**Developer ID Application** certificate — the one for apps distributed outside
the App Store.

**The full Xcode app is not required.** What is required is Apple's Command Line
Tools (`xcode-select --install`, about 1 GB): `swiftc` builds Vera's two Swift
sidecars, `codesign` signs the result, `notarytool` talks to Apple.
`npm run setup:signing` checks for all three on your Mac and says which is
missing rather than guessing.

Two routes to the certificate:

- **With Xcode** — Settings → Accounts → Manage Certificates → **+** →
  Developer ID Application.
- **Without Xcode** — Keychain Access, which is already installed. Certificate
  Assistant → *Request a Certificate From a Certificate Authority…* → save to
  disk. Upload that file at
  [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
  → **+** → Developer ID Application, download the `.cer`, double-click it.

The setup script prints both routes if it finds no certificate.

Then:

```bash
npm run setup:signing
```

It finds the certificate, reads the Team ID straight out of its name, asks for
the Apple ID and an app-specific password, **verifies them with Apple**, and
only then writes `.env.signing` (mode 600, gitignored). Verifying first matters:
otherwise the first thing that tells you a password is wrong is a build failing
ten minutes in, at the notarization step.

App-specific password: appleid.apple.com → Sign-In and Security → App-Specific
Passwords. It is not your normal Apple password, and Apple shows it once.

### Releasing

One command, from the repo root, on the Mac that holds the signing key:

```bash
npm run release
```

It builds, signs, notarizes and updater-signs the app, publishes it into the
website, commits, pushes to **`main`** (the branch Vercel builds production
from — a release pushed anywhere else changes nothing a visitor can see), waits
for the deploy, then downloads the DMG from the live site and compares it byte
for byte with the one it just built.

It refuses to continue rather than publish something wrong. It stops if:

- the working tree has changes outside the release artifacts
- the newest DMG is not the version in `tauri.conf.json` — the failure that
  otherwise ships the *previous* binary under a new version number
- `spctl` does not report a Notarized Developer ID, which would greet every
  visitor with "cannot be opened because the developer cannot be verified"
- the copy into the website does not match what was built
- `main` has commits the release branch does not
- the deploy does not appear, or the live bytes are not the built bytes

### Checking a release

```bash
npm run check:release        # the files in this repo agree with each other
npm run check:release:live   # …and the live site serves exactly those bytes
```

The version on the page comes from `updater/latest.json`; the button points at
`downloads/Vera.dmg`. Nothing connected those two, so a release could update one
and not the other and the page would confidently offer a version it was not
handing over. Every release now writes `downloads/Vera.dmg.sha256`, and the
check compares the manifest version, the version the app was built at, the hash
beside the file, the hash of the file, and the hash of the bytes the deployed
site actually returns.

That checksum is also there for anyone who wants to verify their own download:

```bash
shasum -a 256 -c Vera.dmg.sha256
```

### Auto-update

`updater/latest.json` is what installed copies poll on launch. It currently
covers `darwin-aarch64` only — an Intel Mac is offered nothing. The updater
signing key lives at `~/.tauri/vera-updater.key` and is **not** in the repo:
losing it means no existing install can ever auto-update again, so the release
script will not quietly generate a new one.

Note: a browser cannot silently install an app. Clicking downloads the DMG,
which the user opens and drags into Applications (the standard macOS flow).

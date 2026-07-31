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
It points at `/downloads/Vera.dmg`, which is served from `public/downloads/`.

You provide that file from your local build:

```bash
# from the repo root, after `npm run tauri build`
cp src-tauri/target/release/bundle/dmg/Vera_*.dmg website/public/downloads/Vera.dmg
git add website/public/downloads/Vera.dmg && git commit -m "Publish latest Vera DMG"
```

The DMG must be **committed** so Vercel serves it with the deployed site. To
ship a new version, replace that file and commit again — the button always
serves whatever is at `/downloads/Vera.dmg`.

Note: a browser cannot silently install an app. Clicking downloads the DMG,
which the user opens and drags into Applications (the standard macOS flow).

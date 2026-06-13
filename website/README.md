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

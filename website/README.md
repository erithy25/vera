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

The button always resolves the **newest** release: on click it queries
`https://api.github.com/repos/erithy25/vera/releases/latest`, picks the
`.dmg` asset (preferring Apple Silicon / universal), and downloads it. If no
release exists yet, it falls back to the repo's releases page.

For the button to serve a file, publish a GitHub Release with the built
`Vera_*.dmg` attached (ideally automated with a release workflow on macOS).
A browser cannot silently install an app — clicking downloads the DMG, which
the user opens and drags into Applications (the standard macOS flow).

# Vera

Automatic time tracking that writes your billing — 100% on your device.

Vera runs quietly in the macOS menu bar and captures your workday locally
(active app, window, and — optionally — encrypted screen frames with on-device
OCR). Layer by layer it is being built into a billing copilot that turns that
capture into billable work blocks: assigned to clients, with ready-to-bill
narratives, exportable into your billing system. The AI runs locally via
[Ollama](https://ollama.com); there is no account, no server, no cloud AI —
your workday never leaves your device on its own (only the confirmed entries
you explicitly export or push to a billing integration do).

**Status (0.6.0):** local capture, privacy controls, encrypted recording store,
and the local AI setup are shipped; the block engine, client assignment,
narrative generator, and exports arrive with the next layers. The full pivot
plan (market analysis, layer-by-layer build plan, acceptance criteria) lives
in [`docs/UMBAUPLAN.md`](docs/UMBAUPLAN.md).

## Stack

- **Desktop app:** Tauri 2 (macOS-only: Objective-C/Swift natives for
  capture/OCR/keychain vault), React 19 + TypeScript + Tailwind 4 (Vite),
  SQLite via tauri-plugin-sql, local AI via Ollama.
- **Marketing site:** `website/` — Vite + React + Tailwind 4 (see
  `website/README.md`). Site copy is always English.

## Development

```bash
npm install
npm run tauri dev      # run the app (macOS only — natives need swiftc/frameworks)
npm run tauri build    # build the DMG
```

The app only compiles on macOS. In Linux containers, verify the frontend with
`npx tsc --noEmit` + `npm run build`, and prove native/SQL logic with
standalone replica tests.

## Privacy architecture

- Capture, OCR, database, and AI model run entirely on-device.
- Screen recordings are AES-256-GCM encrypted at rest; the key lives in the
  Keychain (Touch ID / Secure Enclave).
- Sensitive patterns (credit cards, IBANs, API keys) are always redacted
  before anything is stored.
- Password managers are excluded from capture by default; apps and domains
  can be excluded, capture paused, and data deleted at any time.
- Raw recordings expire after a configurable retention period.

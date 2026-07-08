# Vera — Claude Code Notes

Tauri 2 desktop app (macOS-only: Objective-C/Swift natives, CoreGraphics/AppKit), React 19 + TypeScript + Tailwind 4 frontend (Vite), SQLite via tauri-plugin-sql, local AI via Ollama.

**Product**: Vera is a billing copilot — automatic time tracking that captures the workday locally, assigns work blocks to clients, and writes ready-to-bill narratives. 100% on-device (no cloud AI, no account, no server). The layer-by-layer build plan is `docs/UMBAUPLAN.md`; develop strictly one layer at a time.

## Working agreement

- **After EVERY change**: end the reply with the install command so the user can rebuild and drag the updated app into /Applications:

  ```bash
  git pull origin <current-branch> && npm install && npm run tauri build && open src-tauri/target/release/bundle/dmg/*.dmg
  ```

  (Insert the current working branch. `npm install` is included so new JS deps are present — `tauri build` does not install them. The `beforeBuildCommand` also runs `npm install` as a safety net. The DMG opens the drag-into-Applications window.)
- **All user-facing copy is ALWAYS English** — desktop app UI and the website (`website/`), every new view, label, and text change (owner decision, July 2026).
- No UI/design changes unless explicitly requested.
- Develop on the designated claude/* branch; commit and push after each task.
- The app only compiles on macOS (frameworks + swiftc). In Linux containers: verify the frontend with `npx tsc --noEmit` + `npm run build`, and prove native/SQL logic with standalone replica tests.
- Never reintroduce cloud AI calls into the app — "not a single byte leaves your device" is the product's core promise. The app's ONLY network contact is the update check. Licensing is fully offline (Schicht 6): license keys are ECDSA-signed and verified on-device against an embedded public key, so activation makes no network call — the merchant of record delivers the signed key by email.

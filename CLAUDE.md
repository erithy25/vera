# Vera — Claude Code Notes

Tauri 2 desktop app (macOS-only: two Swift sidecars using AVFoundation + Vision), React 19 + TypeScript + Tailwind 4 frontend (Vite), SQLite via tauri-plugin-sql for preferences only.

**What Vera is:** you drop in a finished screen recording and it lists the API keys, tokens and credentials that are legible in it, each with a timestamp. It records nothing itself, makes no network requests, and stores no recordings, frames, OCR text or findings.

The detection engine lives in `src-tauri/core` (crate `vera-core`) and has no platform dependencies, so it builds and tests on any OS.

## Working agreement

- **After EVERY change**: end the reply with the install command so the user can rebuild and drag the updated app into /Applications:

  ```bash
  git pull origin <current-branch> && npm install && npm run tauri build && open src-tauri/target/release/bundle/dmg/*.dmg
  ```

  (Insert the current working branch. `npm install` is included so new JS deps are present — `tauri build` does not install them. The `beforeBuildCommand` also runs `npm install` as a safety net. The DMG opens the drag-into-Applications window.)
- No UI/design changes unless explicitly requested.
- Develop on the designated claude/* branch; commit and push after each task.
- Only the Swift sidecars need macOS. In a Linux container everything else is verifiable, and should be verified:
  - `cd src-tauri && cargo test --all-targets` — engine and pipeline tests
  - `cd src-tauri && cargo check --all-targets` — `build.rs` skips swiftc off macOS, so this works
  - `npx tsc --noEmit && npm run build` — app frontend
  - `cd website && npx tsc --noEmit && npm run build` — marketing site
- The two sidecars (`src/video-scan.swift`, `src/frame-extract.swift`) can only be compiled on a Mac. `src-tauri/core/tests/ocr_settings.rs` asserts the parts of video-scan.swift that silently break detection if changed.

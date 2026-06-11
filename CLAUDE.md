# Vera — Claude Code Notes

Tauri 2 desktop app (macOS-only: Objective-C/Swift natives, CoreGraphics/AppKit), React 19 + TypeScript + Tailwind 4 frontend (Vite), SQLite via tauri-plugin-sql, local AI via Ollama.

## Working agreement

- **After EVERY change**: end the reply with the install command so the user can rebuild and drag the updated app into /Applications:

  ```bash
  git pull origin <current-branch> && npm run tauri build && open src-tauri/target/release/bundle/dmg/*.dmg
  ```

  (Insert the current working branch. The DMG opens the drag-into-Applications window.)
- No UI/design changes unless explicitly requested.
- Develop on the designated claude/* branch; commit and push after each task.
- The app only compiles on macOS (frameworks + swiftc). In Linux containers: verify the frontend with `npx tsc --noEmit` + `npm run build`, and prove native/SQL logic with standalone replica tests.

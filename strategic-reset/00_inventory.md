# Phase 0 — Inventory (Data Collection, No Judgement)

Erhebungsdatum: 2026-07-28. Quelle: lokaler Clone `/home/user/vera` (identisch mit `github.com/erithy25/vera`, `main` @ `3c198ac`), GitHub REST via MCP, Landing-Page-Quelltext (`website/src/App.tsx`).

**Was ich nicht habe:** Vercel Analytics, Download-Zähler, Stripe, macOS-Runtime. Keine Laufzeit-Tests möglich (Objective-C/Swift/CoreGraphics kompilieren nur auf macOS). Alle Aussagen unten sind aus Code, Git und GitHub-API abgeleitet.

---

## 1. Repository-Kennzahlen

| Feld | Wert | Quelle |
|---|---|---|
| Repo | `erithy25/vera`, public | GitHub API |
| Erstellt | 2026-06-08 22:58 UTC | GitHub API |
| Letzter Push | 2026-07-22 17:54 UTC | GitHub API |
| Default-Branch | `main` | GitHub API |
| Primärsprache | TypeScript | GitHub API |
| Repo-Größe | 74.261 KB (~74 MB) | GitHub API |
| Commits gesamt | 61 | `git rev-list --count HEAD` |

## 2. Traktion — die harten Nullen

| Signal | Wert |
|---|---|
| Stars | **0** |
| Forks | **0** |
| Watchers | **0** |
| Open Issues | **0** |
| Issues gesamt (offen + geschlossen) | **0** |
| Releases | **1** (`v0.1.0`, publiziert 2026-07-22) |
| `has_downloads` | `false` |
| Externe Contributors | 0 |

**Anomalie:** Das einzige Release ist als `v0.1.0` getaggt, während `tauri.conf.json` und `package.json` auf **0.5.2** stehen. Das README verweist auf „the latest signed `.dmg` from the Releases page" — die Releases-Seite zeigt also eine Version, die vier Minor-Versionen hinter dem Produkt liegt.

## 3. Commit-Verlauf — das Projekt ist ein 7-Tage-Sprint

| Datum | Commits |
|---|---|
| 2026-06-11 | 13 |
| 2026-06-13 | 20 |
| 2026-06-14 | 1 |
| 2026-06-15 | 17 |
| 2026-06-16 | 4 |
| 2026-06-17 | 5 |
| **2026-06-18 → 2026-07-21** | **0** (34 Tage Stillstand) |
| 2026-07-22 | 1 (`Revise README for Vera AI assistant`) |

60 von 61 Commits fallen in sechs Kalendertage (11.–17. Juni). Danach ein einziger Commit, der nur das README kosmetisch überarbeitet. **Das Projekt wurde in einer Woche gebaut und seit sechs Wochen nicht mehr fachlich angefasst.**

## 4. Code-Inventar

Gesamt: **12.141 LOC** (ohne `node_modules`, `target`, Icons, Skill-Daten).

| Sprache | LOC | Anteil |
|---|---|---|
| TypeScript / TSX (App-Frontend) | ~7.150 | 59 % |
| Rust (`src-tauri/src`) | 2.298 | 19 % |
| Swift (Sidecars) | 1.028 | 8 % |
| TSX (Website) | 391 | 3 % |
| Objective-C (`vault.m`, `tracker.m`) | 270 | 2 % |
| Shell (Release-Skripte) | 186 | 2 % |
| CSS | 103 | 1 % |

Die zehn größten Dateien:

| Datei | LOC |
|---|---|
| `src-tauri/src/lib.rs` | 2.292 |
| `src/components/Settings.tsx` | 1.392 |
| `src/lib/db.ts` | 1.230 |
| `src/components/CommandBar.tsx` | 879 |
| `src-tauri/src/frame-capture.swift` | 768 |
| `src/components/AgentChat.tsx` | 407 |
| `src/components/Onboarding.tsx` | 400 |
| `website/src/App.tsx` | 346 |
| `src/components/Sidebar.tsx` | 335 |
| `src/components/Knowledge.tsx` | 316 |

## 5. Test-Abdeckung

**0 %. Es existiert kein einziger Test.**
Kein `#[cfg(test)]`, kein `#[test]`, kein Vitest/Jest/Playwright, keine Test-Dependency in `package.json` oder `Cargo.toml`. Die einzigen Grep-Treffer auf `test`/`it(` sind `.split()`-Aufrufe und Regex-`.test()`.

## 6. Build- und Distributions-Setup

- **Tauri v2.11.2**, Rust Edition 2021, MSRV 1.77.2
- **Frontend:** React 19.1, Vite 7, Tailwind 4, TypeScript 5.8, `lucide-react`
- **Rust-Deps:** `rusqlite 0.32` (bundled), `reqwest 0.12`, `aes-gcm 0.10`, `base64 0.22`, `regex 1`, `libc`, 7× `tauri-plugin-*`
- **Native Sidecars:** drei vorkompilierte Mach-O arm64 Binaries **im Repo eingecheckt** (`frame-capture` 232 KB, `ocr-helper` 112 KB, `frame-extract` 105 KB)
- **CI:** zwei GitHub-Action-Workflows (`build-macos.yml`, `release-macos.yml`), beide **manual-only** (`workflow_dispatch`) — Commit `0294337`: „Make the unsigned CI build manual-only (no cost on every push)". Es gibt also **keine CI auf Push**.
- **Signierung:** `MACOS-SIGNING.md` + `.env.signing.example` vorhanden; Updater mit Minisign-Pubkey gegen `https://vera-sandy.vercel.app/updater/latest.json`
- **Versions-Drift:** `Cargo.toml` = `0.1.0`, `tauri.conf.json` = `0.5.2`, `package.json` = `0.5.2`, GitHub-Release = `v0.1.0`

**Repo-Hygiene:** `.git` ist 73 MB groß, weil bei jedem Release die fertigen Artefakte eingecheckt wurden. Die vier größten Blobs sind 4 Kopien von `Vera.app.tar.gz` (je ~8,4 MB) und 4 Kopien von `Vera.dmg` (je ~8,4 MB) — ~67 MB der 74 MB Repo-Größe sind Build-Artefakte in der History.

## 7. Produkt-Oberfläche (was die App laut Code kann)

Aus `src/components/` + `src-tauri/src/lib.rs`:

- **Aktivitäts-Tracking:** Vordergrund-App + Fenstertitel via Accessibility API (`tracker.m`), Browser-URL via `osascript` (Safari/Chrome/Arc/Edge), Segment-Persistenz in `activity_events`
- **Frame-Capture:** ScreenCaptureKit-Sidecar (`frame-capture.swift`), **1 fps** (`config.minimumFrameInterval`, default `--fps 1`), perceptual-hash-Dedupe, HEVC-Segmente + JPEG-Thumbnails, On-Frame-Redaction (Regex + Shannon-Entropie ≥ 3,6 + Luhn)
- **Verschlüsselung:** AES-256-GCM über Segmente und Thumbnails, Key im Keychain (Touch ID / Secure Enclave, mit Fallback auf klassischen Keychain)
- **Retrieval:** 4-stufige Kaskade (App-scoped → semantisch → Keyword-LIKE → recent), Embeddings via Ollama `nomic-embed-text`, als JSON-String in SQLite
- **Chat:** „Ask bar" + 4 Agenten (Planner, Writer, Researcher, Coach)
- **Engine:** Ollama lokal (default `llama3.2:3b`) **oder** Cloud (Anthropic / OpenAI, bring-your-own-key)
- **Sonstiges:** Timeline, Goals, Notes, Knowledge-View, Onboarding, Menüleisten-Tray, Autostart, Updater, Datenexport

## 8. Telemetrie und Messbarkeit

**Es gibt keinerlei Telemetrie — und keine Möglichkeit, eine Nutzung zu messen.**

- Kein PostHog, Plausible, Umami, Sentry, Mixpanel, `gtag` — nichts. Der einzige Grep-Treffer auf „telemetry" im gesamten Repo ist der Marketing-Satz auf der Landing Page: *„No account. No server. No telemetry."*
- Die Landing Page (`website/index.html`) lädt **kein einziges Analytics-Skript**. Nur Google Fonts.
- Der Download ist ein statisches `<a href="/downloads/Vera.dmg" download>` — kein Redirect, kein Zähler, kein Event.
- `has_downloads: false` auf GitHub; das eine Release liegt bei v0.1.0.
- Kein Account, kein Login, kein Server-Call beim Start. Der Updater pingt `latest.json` — theoretisch ein Aktivitätssignal in Vercel-Logs, aber nicht ausgewertet und nicht von Bots trennbar.

**Konsequenz:** Selbst wenn Vera 500 Nutzer hätte, gäbe es keinen Weg, das zu erfahren. Und selbst wenn jemand zahlen wollte, gibt es keine Stelle im Produkt oder auf der Website, an der Geld fließen könnte.

## 9. Landing Page — vollständige Bestandsaufnahme

`vera-sandy.vercel.app` ist eine client-side gerenderte React-SPA (Quelle: `website/src/App.tsx`, 346 LOC).

- **H1:** „Your day, remembered."
- **Sub:** „Vera quietly remembers what you did and what was on your screen — then answers anything about it. Private, on your Mac."
- **Sektionen:** Sticky Nav → Hero → Produkt-Mockup → How it works (3 Schritte) → Features (7 Kacheln) → dunkles Privacy-Band → 3 „honest pillars" → FAQ (5 Fragen) → Final CTA → Footer
- **CTA:** 4× derselbe Button „Download for Mac" → `/downloads/Vera.dmg`
- **Preis-Angabe:** „Free · macOS 12+ · No account" (2×), FAQ: *„Vera itself is free."*

**Was auf der Seite fehlt:** kein Pricing, kein Signup, kein E-Mail-Feld, kein Newsletter, kein Waitlist, kein Kontakt, kein Impressum, kein Kauf-Button, kein Analytics. Der gesamte Funnel endet in einem statischen Dateidownload.

## 10. Erwähnungen im Netz

Recherche in Phase 2 dokumentiert. Vorab-Signal aus den harten Zahlen: 0 Stars, 0 Forks, 0 Issues, 0 externe Commits, kein Launch-Post im Repo verlinkt, kein Product-Hunt-/HN-/Reddit-Verweis in README oder Website.

---

## Rohbefund ohne Bewertung

1. 12.141 LOC, in 6 Kalendertagen geschrieben, seit 6 Wochen fachlich unangetastet.
2. 0 Stars, 0 Forks, 0 Issues, 0 externe Nutzersignale jeder Art.
3. 0 Tests, 0 CI-auf-Push, 0 Telemetrie.
4. Es existiert **keine** Zahlungsschnittstelle — weder im Produkt noch auf der Website.
5. Das Produkt ist explizit als „free" positioniert.

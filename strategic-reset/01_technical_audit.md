# Phase 1 — Technisches Audit

Grundlage: vollständig gelesen wurden `src-tauri/src/lib.rs` (2.292 LOC, in Abschnitten), `src-tauri/src/vault.m`, `src/lib/retrieval.ts`, `src/lib/agents.ts`, `src/lib/ollama.ts`, `website/src/App.tsx`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `README.md`, plus gezielte Ausschnitte aus `src/lib/db.ts`, `src-tauri/src/frame-capture.swift`, `src/components/Settings.tsx`.

**Nicht gelesen / nicht geprüft:** `CommandBar.tsx`, `Onboarding.tsx`, `Timeline.tsx`, `Knowledge.tsx` und die übrigen Komponenten wurden nur strukturell (Grep, LOC, Imports) erfasst, nicht Zeile für Zeile. Die App wurde **nicht ausgeführt** — Linux-Container, die nativen Teile kompilieren nur auf macOS. Alle Laufzeitaussagen unten sind aus dem Code abgeleitet, nicht gemessen.

---

## 1. Architektur

### 1.1 Es gibt keine Modulstruktur

`src-tauri/src/main.rs` hat 6 Zeilen. `src-tauri/src/lib.rs` hat 2.292. Es existiert **kein einziges `mod`**. In dieser einen Datei liegen nebeneinander:

FFI-Deklarationen (Z. 18–39) · Prozess-Blocklisten (Z. 85–123) · AppleScript-Aufrufe für Browser-URLs (Z. 125–165) · PII-Redaction mit Luhn-Prüfung (Z. 264–328) · App-Kategorisierung (Z. 330–349) · direkte SQLite-Schreibpfade (Z. 357–507) · AES-256-GCM-Krypto (Z. 517–646) · Sidecar-Lifecycle-Supervisor (Z. 648–1300) · Retention-/Storage-Eviction (Z. 790–990) · HTTP-Clients für Anthropic und OpenAI (Z. 1524–1680) · Tray-Menü (Z. 1875+) · Plugin-Setup und Migrationen (Z. 1930–2130).

Das sind mindestens acht Verantwortlichkeiten ohne eine einzige Abstraktionsgrenze. Es gibt keine Trait-Definition, kein Interface, keinen Port. Jede dieser Zuständigkeiten kann jede andere direkt anfassen.

### 1.2 Der schwerste Strukturfehler: die Datenbank hat drei Wahrheiten

Auf `vera.db` greifen **zwei unabhängige Verbindungen aus zwei Prozessschichten** zu:

- Das Frontend über `tauri-plugin-sql`: `db.ts:7` → `Database.load("sqlite:vera.db")`
- Der Rust-Backend direkt über `rusqlite`: `lib.rs:357` → `rusqlite::Connection::open(&path)`

Und das Schema wird an **drei** Stellen erzeugt:

1. Die Migrationsliste des SQL-Plugins (`lib.rs:1930–1960`)
2. `ensure_frames_schema()` in Rust (`lib.rs:665–700`) — mit `CREATE TABLE IF NOT EXISTS` plus manuellem `PRAGMA table_info`-Spaltenabgleich
3. `db.ts:1104–1160` — nochmal `CREATE TABLE IF NOT EXISTS frames (...)` plus `checkAndSeed`-Defaults

Der Kommentar bei `lib.rs:664` gibt das offen zu: *„Idempotent: creates the base tables and adds the segment columns only if missing, so it never collides with the sql-plugin migration."* Man schreibt so einen Kommentar nur, wenn man weiß, dass die Struktur falsch ist, und den Schmerz mit Defensivcode betäubt statt ihn zu beheben. Es gibt keine einzelne Stelle, an der man ablesen kann, wie das Schema aussieht. Wer eine Spalte hinzufügt, muss an drei Orten in zwei Sprachen daran denken — ohne Test, der ihn erinnert.

### 1.3 Geschäftslogik ist über die Sprachgrenze dupliziert — und divergiert bereits

`lib.rs:264` sagt wörtlich *„Port of isLuhnValid (src/lib/db.ts)"*. `lib.rs:286`: *„Port of redactSensitiveData (src/lib/db.ts)"*. `lib.rs:351`: *„mirrors isSystemProcessName in db.ts"*. `lib.rs:330`: *„Port of categorizeApp"*.

Bei der sicherheitskritischsten Funktion — der Redaction von Secrets, bevor sie in die durchsuchbare Datenbank wandern — existieren **drei** Implementierungen: Rust (`lib.rs:288–328`), TypeScript (`db.ts`), Swift (`frame-capture.swift:694–753`). Sie sind nicht identisch:

| Muster | Rust (`lib.rs:315–320`) | Swift (`frame-capture.swift:694–701`) |
|---|---|---|
| OpenAI-Key | `sk-(proj-)?[a-zA-Z0-9]{48,}` | `sk-(proj-)?[A-Za-z0-9]{20,}` |
| Stripe restricted | `rk_live_[a-zA-Z0-9]{24}` (exakt 24) | `rk_live_[A-Za-z0-9]{16,}` |
| Google-API-Key `AIza…` | **fehlt** | vorhanden |
| JWT `eyJ….….…` | **fehlt** | vorhanden |
| Shannon-Entropie-Heuristik | **fehlt** | vorhanden (≥ 3,6) |

Konkrete Konsequenz: Ein OpenAI-Key mit 30 Zeichen nach dem Präfix wird vom Swift-Pfad redigiert und vom Rust-Pfad **unverändert in die Datenbank geschrieben**. Ein Google-API-Key wird nur auf dem Swift-Pfad erkannt. Welcher Pfad greift, hängt davon ab, ob der Text aus dem Frame-Capture oder aus dem Activity-Tracker stammt. Für keine der drei Implementierungen existiert ein Test.

### 1.4 Was bei 10× Last bricht

Der semantische Retrieval-Pfad (`retrieval.ts:199–227`):

```
const candidates = await framesRepo.search(undefined, …, 500);   // 500 Zeilen ins JS
… candidates.map(f => cosineSimilarity(queryVector, JSON.parse(f.embedding)))
```

Pro Query werden bis zu 500 Frame-Zeilen über die IPC-Brücke ins Webview geholt, für jede wird ein 768-dimensionaler Vektor **aus einem JSON-String geparst**, und die Kosinus-Ähnlichkeit wird in JavaScript auf dem Main-Thread berechnet (`ollama.ts:9–22`). Es gibt keinen Vektorindex, kein ANN, kein `sqlite-vec`, kein FTS5.

Der Keyword-Pfad (`db.ts:634`) ist `ocr_text LIKE '%…%' OR app LIKE '%…%' OR window_title LIKE '%…%' OR url LIKE '%…%'` — ein Full Table Scan über vier Spalten, für **jeden** Token einzeln. Ein Index existiert auf keiner dieser Spalten.

Capture läuft mit 1 fps (`frame-capture.swift:68`, `config.minimumFrameInterval`). Selbst mit perceptual-hash-Dedupe erzeugt ein Arbeitstag Tausende Zeilen. Bei 10× Datenvolumen bedeutet das: der `LIKE`-Scan wächst linear über eine Tabelle mit eingebettetem OCR-Volltext, der 500er-Cutoff für Embeddings wird zu einer **stillen Genauigkeitsgrenze** — Vera durchsucht dann nicht mehr die Erinnerung, sondern nur noch die letzten 500 Frames und behauptet, es sei die Erinnerung. Das ist schlimmer als langsam: es wird lautlos falsch.

### 1.5 Was architektonisch richtig ist

Ehrlichkeitshalber: die Verlagerung der Persistenz vom Webview in den Rust-Backend (Kommentar `lib.rs:251–255`) ist die richtige Entscheidung — Capture läuft weiter, wenn das Fenster zu ist. Der Sidecar-Supervisor mit SIGTERM-Handling für sauberen HEVC-Segment-Abschluss (`frame-capture.swift:757–762`) ist sorgfältig. Die Trennung Tray/Fenster ist korrekt.

---

## 2. Code-Qualität

### Die drei schlimmsten Stellen

**1. `src-tauri/src/lib.rs` — komplett.** 2.292 Zeilen, null Module, acht Verantwortlichkeiten. Siehe 1.1. Das ist kein Stilproblem; es macht das Extrahieren einzelner Komponenten (Phase 5 dieses Audits) teurer, als es sein müsste.

**2. `src/components/Settings.tsx` — 1.392 Zeilen, 35 `useState`-Hooks in einer einzigen Komponente.** Keine Unterkomponenten, kein `useReducer`, kein Context. 35 unabhängige State-Variablen in einem Funktionskörper bedeutet: jeder Setter rendert das gesamte 1.400-Zeilen-Formular neu, und keine zwei Zustände sind gegeneinander konsistenzgesichert.

**3. Die dreifach divergierende Redaction (1.3).** Sicherheitskritische Logik, dreimal implementiert, nachweislich abweichend, null Tests. Das ist die schlimmste Stelle des Repos, weil sie als Feature verkauft wird („redact sensitive data" auf der Landing Page) und nachweislich Lücken hat.

### Die drei besten Stellen

**1. `src-tauri/src/vault.m` (139 Zeilen, gesamte Datei).** Korrekte Keychain-Nutzung: richtige Accessibility-Klasse (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, Z. 81), `SecRandomCopyBytes` für die Schlüsselerzeugung (Z. 108), Schlüssel wird nach dem Kopieren im Stack genullt (Z. 118, 122), `kSecUseAuthenticationUISkip` beim Existenz-Check, damit die reine Prüfung keinen Biometrie-Prompt auslöst (Z. 46), und `vault_delete_key` räumt beide Keychains ab. Das ist handwerklich sauber.

**2. `lib.rs:537–563` — `encrypt_bytes` / `decrypt_bytes`.** Lehrbuch-AEAD: frischer Nonce aus `OsRng` pro Aufruf (Z. 541), Magic-Prefix, und vor dem Slicing eine vollständige Längenprüfung `data.len() < 4 + 12 + 16` (Z. 555), die den Panic-Pfad schließt. Kein `unwrap` in der Krypto.

**3. `src/lib/retrieval.ts:159–261` — die Ehrlichkeits-Kaskade.** Wenn die Anfrage eine App nennt, für die es keine Frames gibt, liefert die Funktion `scope: "none"` und **keine** Ersatz-Frames (Z. 195–196). Der „recent"-Fallback greift nur bei explizit breiten oder zeitbezogenen Fragen (Z. 249), nie bei einer spezifischen. Das ist eine bewusste Anti-Halluzinations-Entscheidung, die die meisten RAG-Implementierungen auslassen. Der beste Gedanke im Repo.

### Querschnitt

- **Panic-Sicherheit in Rust: gut.** Genau ein `unwrap()`/`expect()` in 2.292 Zeilen. Fehler werden als `Result<_, String>` propagiert, Nicht-Kritisches mit `let _ =` bewusst verworfen.
- **SQL-Injection: sauber.** Alle Queries in `db.ts` und `lib.rs` nutzen Platzhalter mit Parameter-Arrays. Die einzige Interpolation (`db.ts:528`) baut eine Konstantenliste aus einem hartkodierten Array.
- **XSS im Webview: kein direkter Vektor.** Kein `dangerouslySetInnerHTML`, kein `innerHTML`, kein `eval` im gesamten Frontend. React escaped den OCR-Text.
- **Tests: null.** Siehe Phase 0.
- **CI: nicht vorhanden.** Beide Workflows sind `workflow_dispatch`-only (Commit `0294337`). Es gibt keinen automatischen Build, der einen Bruch fangen würde.

---

## 3. Sicherheit

Vorab, weil die Aufgabenstellung explizit danach fragt: **Die Krypto-Primitive selbst sind korrekt.** AES-256-GCM aus `aes-gcm 0.10`, Schlüssel 32 Byte aus `SecRandomCopyBytes`, pro Verschlüsselung ein frischer 96-Bit-Nonce aus `OsRng`. **Es gibt keine IV-Wiederverwendung:** `encrypt_bytes` erzeugt bei jedem Aufruf einen neuen Nonce, Dateien werden als Ganzes genau einmal verschlüsselt, und `encrypt_file_in_place` (Z. 570) bricht ab, wenn die Datei bereits das Magic trägt — es gibt also keinen Pfad, auf dem dieselbe Datei zweimal mit demselben Nonce verschlüsselt wird. Kein Nonce-Zähler, den man falsch führen könnte. Das ist richtig gemacht.

Die Probleme liegen alle **um** die Krypto herum.

### F-1 · HOCH — Cloud-API-Schlüssel liegen im Klartext in SQLite

`lib.rs:1479–1499`:
```rust
conn.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
    rusqlite::params![setting_key, trimmed],   // setting_key = "cloud_api_key_anthropic"
)
```

Der Anthropic-/OpenAI-Schlüssel des Nutzers — ein Live-Credential mit direkter Abrechnungswirkung — wird als gewöhnliche Zeile in `~/Library/Application Support/app.vera.desktop/vera.db` geschrieben. Unverschlüsselt.

Erschwerend, und das ist der Punkt: **derselbe Codebase enthält einen vollständigen Keychain-/Secure-Enclave-Tresor** (`vault.m`), der ausschließlich für den Medienschlüssel benutzt wird. Die richtige Lösung war bereits gebaut und wurde für das sensiblere Geheimnis nicht verwendet.

Dass der Autor das Risiko kannte, belegt `exportData.ts:27`:
```ts
const settings = settingsRows.filter((row) => !String(row.key).startsWith("cloud_api_key_"));
```
Der Schlüssel wird aus dem Export gefiltert — man wusste also, dass er nicht nach außen darf — und liegt trotzdem im Klartext auf der Platte.

Betroffen: jeder Prozess, der als der Nutzer läuft; jedes Time-Machine-Backup; jeder Ordner-Sync (iCloud/Dropbox), der Application Support erfasst; jedes Malware-Sample, das SQLite-Dateien einsammelt.

### F-2 · HOCH (als Kette) — Webview kann beliebige Dateien lesen

`lib.rs:633–646`:
```rust
#[tauri::command]
fn get_frame_thumbnail(app: tauri::AppHandle, thumbnail_path: String) -> Result<String, String> {
    let data = std::fs::read(&thumbnail_path)…
```
Der Pfad kommt ungeprüft aus dem Webview. Es gibt **keine** Einschränkung auf `frames_dir()`. Ist die Datei nicht mit dem Magic versehen, wird sie einfach base64-kodiert zurückgegeben (Z. 639–645) — die Funktion ist also ein universeller Datei-Leseprimitiv, kein Thumbnail-Loader.

Analog `lib.rs:246–249`, `write_text_file_at` — beliebiger Schreibpfad, beliebiger Inhalt. Der Kommentar sagt: *„Kept minimal on purpose — no fs plugin / path scope needed."* Die Pfad-Scoping-Mechanik von Tauri wurde also bewusst umgangen.

**Die Kette.** `tauri.conf.json` setzt `"security": { "csp": null }` — keine Content-Security-Policy. `capabilities/default.json` gewährt dem Webview `sql:allow-execute` und `sql:allow-select` — also beliebiges SQL gegen `vera.db`. Zusammen mit F-1 heißt das: **eine einzige Skript-Ausführung im Webview genügt für `SELECT value FROM settings WHERE key='cloud_api_key_anthropic'`** und für das Auslesen beliebiger Dateien des Nutzers über `get_frame_thumbnail`. Jede einzelne Schwäche ist für sich vertretbar; zusammen bilden sie einen vollständigen Exfiltrationspfad ohne Schutzschicht dazwischen.

### F-3 · MITTEL — Entschlüsselte Screenshots bleiben dauerhaft im Temp-Verzeichnis liegen

`lib.rs:885–902` (`extract_frame_near`):
```rust
let temp_mov = std::env::temp_dir().join(format!("vera-seg-{}.mov", now_epoch_ms()));
decrypt_file_to(&app, Path::new(&seg_path), &temp_mov)?;
let out = std::env::temp_dir().join(format!("vera-frame-{}.jpg", now_epoch_ms()));
…
let _ = std::fs::remove_file(&temp_mov);   // das .mov wird gelöscht
…
Ok(out.to_string_lossy().to_string())      // das .jpg NICHT
```

Das entschlüsselte Video-Segment wird korrekt aufgeräumt. Das extrahierte **JPEG wird nie gelöscht** — ein Grep über das gesamte Repo nach `vera-frame` liefert genau einen Treffer, die Erzeugung. Jedes Frame, das der Nutzer in der Timeline ansieht, hinterlässt einen dauerhaften, unverschlüsselten Screenshot seines Bildschirms außerhalb des Tresors. Über Monate wächst dort ein Klartext-Archiv genau der Daten, deren Verschlüsselung das Hauptversprechen des Produkts ist.

(Mildernd: `TMPDIR` ist auf macOS nutzerprivat, Modus 700. Das begrenzt den Schaden auf lokale Angreifer und Backups — aber es hebelt die Aussage „encrypted before it ever touches the disk" aus dem README faktisch aus.)

### F-4 · MITTEL — Datenverlust by Design: kein Backup-/Restore-/Rotationspfad

`vault.m:79–83` erzeugt das Keychain-Item mit `kSecAccessControlBiometryCurrentSet`. Dieses Flag invalidiert das Item, **sobald der Nutzer einen Fingerabdruck hinzufügt oder entfernt.** In diesem Moment ist der Schlüssel unwiederbringlich weg — und mit ihm jedes verschlüsselte Segment und Thumbnail.

Dazu `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (Z. 81): der Schlüssel wandert **nicht** über den Migrationsassistenten auf einen neuen Mac und ist in keinem Backup enthalten.

Es gibt keinen Escrow, keine Recovery-Phrase, keine Export-Option für den Schlüssel, keine Rotation, keine Warnung im UI. Die Fragen der Aufgabenstellung — *„Was passiert bei Backup/Restore?"* — haben eine klare Antwort: **die gesamte visuelle Erinnerung wird still zu unlesbarem Ciphertext.** Der Nutzer merkt es erst, wenn er etwas sucht. Für ein Produkt, dessen einziger Wert die Langzeit-Erinnerung ist, ist das der schwerste Konstruktionsfehler der Krypto-Ebene.

### F-5 · MITTEL — Der Tresor degradiert still

`vault.m:112–115`:
```objc
OSStatus st = vault_store_biometry(key);
if (st != errSecSuccess) {
    st = vault_store_plain(key);      // klassischer Keychain, keine Biometrie
}
```
Schlägt der Secure-Enclave-Pfad aus irgendeinem Grund fehl, fällt der Code stillschweigend auf ein gewöhnliches Keychain-Item ohne biometrisches Gate zurück. `vault_has_key()` gibt in beiden Fällen `1` zurück; das UI kann nicht unterscheiden. Der Nutzer, dem „Touch ID / Secure Enclave" versprochen wurde, bekommt möglicherweise etwas deutlich Schwächeres und erfährt es nie. Der Kommentar (Z. 7–12) dokumentiert das Verhalten ehrlich — nur eben gegenüber Entwicklern, nicht gegenüber Nutzern.

### F-6 · NIEDRIG — `csp: null`

`tauri.conf.json`: CSP vollständig deaktiviert. Für sich genommen bei fehlendem `innerHTML` weniger kritisch, aber es ist die Schicht, die F-2 zu einer Kette macht.

### F-7 · NIEDRIG — Vorkompilierte Binaries im Repo

`src-tauri/binaries/{frame-capture, ocr-helper, frame-extract}` sind eingecheckte Mach-O-arm64-Executables (232/112/105 KB). Ein Nutzer, der aus dem Quellcode baut, führt Binaries aus, die er nicht selbst kompiliert und nicht verifizieren kann. Für ein Produkt, das mit Vertrauenswürdigkeit wirbt, ist ein reproduzierbarer Build aus `.swift` kein Nice-to-have.

---

## 4. Vollständigkeit vs. Fassade

| Feature (Landing-Page-Versprechen) | Status | Beleg |
|---|---|---|
| Frame-Capture (SCStream, 1 fps, HEVC, Dedupe) | **echt** | `frame-capture.swift`, 768 LOC |
| AES-256-GCM-Verschlüsselung at rest | **echt** (mit F-3/F-4) | `lib.rs:517–646`, `vault.m` |
| Aktivitäts-Tracking + Timeline | **echt** | `tracker.m`, `activity_events`, `Timeline.tsx` |
| Menüleiste / Hintergrundbetrieb / Autostart | **echt** | `lib.rs` Tray + `tauri-plugin-autostart` |
| Signierte, notarisierte Distribution + Updater | **echt** | `release-mac.sh`, `MACOS-SIGNING.md`, Minisign-Pubkey |
| Ollama-Anbindung, lokal + Cloud-BYOK | **echt** | `ollama.ts`, `lib.rs:1524–1680` |
| Goals, Notes, Knowledge, Export | **echt**, aber trivial | eigene Tabellen, CRUD |
| **„Local agents — Planner, Writer, Researcher, Coach"** | **Fassade** | siehe unten |
| **„Ask anything about your day"** | **funktional, aber unter der versprochenen Qualität** | siehe unten |

### Die Agenten sind vier Strings

`agents.ts:79–124` definiert `AGENTS` als Array von vier Objekten, deren einziger funktionaler Inhalt ein `systemPrompt` ist. Es gibt keine Tools, keine Schleife, keinen Planungsschritt, keinen Zustand, keine Delegation. Der Unterschied zwischen „Planner" und „Coach" ist der Text im Prompt plus die Auswahl, welcher Kontext-Builder aufgerufen wird (`agents.ts:190–211`).

Der **Writer-Agent bekommt gar keinen Kontext**:
```ts
case "writer":
default:
  return { context: "", sources: [] };     // agents.ts:208–210
```
Das ist ein nacktes LLM mit einer Persona — im Produkt, das mit „a team" wirbt.

Die „Agent-Aktionen" bestehen aus genau zwei Typen (`create_note`, `create_goal`), übertragen als gefencter JSON-Block, den der Nutzer bestätigen muss (`agentActions.ts`, 54 LOC).

**Das ist genau das Muster, das die Aufgabenstellung selbst unter „Verbotene Ergebnisse" führt: „Ein Wrapper um eine LLM-API ohne eigenen technischen Kern."** In Vera ist dieses Muster bereits das Herzstück der beworbenen Hauptfunktion.

### Das Kernversprechen läuft auf einem 3B-Modell

Default-Chat-Modell: `llama3.2:3b` (`db.ts:914`, `db.ts:1151`). Der Kontext, der es erreicht:

- `topN = 4` Frames (`retrieval.ts:161`)
- pro Frame max. 500 Zeichen OCR-Text (`agents.ts:19`, `.substring(0, 500)`)
- Gesamtkontext hart auf 4.000 Zeichen gekappt (`agents.ts:130–137`)

Ein 3-Milliarden-Parameter-Modell soll aus ~2.000 Zeichen verrauschtem, 1-fps-OCR-Text eine präzise Antwort über den Tag des Nutzers synthetisieren. Das wird in der Mehrzahl der Fälle vage, generisch oder falsch. Das ist kein Bug — es ist die unvermeidliche Folge davon, „local-first" als Constraint über „Antwortqualität" zu stellen. Der Nutzer erlebt es als „die App weiß nichts Nützliches".

### Die Demo auf der Landing Page ist hartkodiert

`website/src/App.tsx:116`:
```tsx
<p …>You spent most of the morning in Figma on the "Vera" file, then reviewed a pull request in Safari around 11:20.</p>
```
Der Beispiel-Dialog im Hero — die einzige Stelle, an der ein Besucher sieht, was Vera leistet — ist ein String im Markup, kein Screenshot einer echten Ausgabe. Auf der gesamten Website gibt es **kein einziges echtes Produktbild**. Was ein Besucher sieht, ist eine Nachbildung der UI in HTML mit einer erfundenen Antwort.

---

## 5. Wiederverwendbarkeit — der wichtigste Abschnitt

Bewertung jeder Komponente danach, ob sie **unabhängig vom Produkt Vera** Wert hat.

| Komponente | Ort | LOC | An Vera gebunden? | Portierbar in |
|---|---|---|---|---|
| **macOS-Release-Pipeline** (Signierung, Notarization, DMG-Layout, Minisign-Updater, Release-Skript, GH-Workflow) | `scripts/release-mac.sh`, `MACOS-SIGNING.md`, `.github/workflows/release-macos.yml`, `tauri.conf.json` | ~330 | **gar nicht** | **1–2 Tage** |
| **AES-GCM-Dateitresor + Keychain-/Secure-Enclave-Schlüsselverwaltung** | `vault.m` + `lib.rs:517–646` | ~270 | **gar nicht** | **2–3 Tage** (F-4/F-5 vorher fixen) |
| **ScreenCaptureKit-Capture-Sidecar** (HEVC-Segmente, perceptual hash, On-Frame-Redaction, JSON-Line-Protokoll) | `frame-capture.swift` | 768 | lose | **3–5 Tage** |
| **Tauri↔Swift/ObjC-FFI + Sidecar-Supervisor-Muster** (Start/Stop/SIGTERM/Permission-Probe) | `lib.rs` verteilt | ~400 | lose | **2–3 Tage** (Extraktion teurer, weil kein Modul) |
| **Aktivitäts-Tracker** (Accessibility-API, Browser-URL via AppleScript) | `tracker.m` + `lib.rs:125–208` | ~260 | lose | **1 Tag** |
| **Secret-Redaction** (Regex + Entropie + Luhn) | 3 Implementierungen | ~200 | nein | **1 Tag** — aber nur als *eine* Implementierung mit Tests |
| **OCR-Helper** (Vision-Framework) | `tracker-ocr.swift` | 199 | nein | **1 Tag**; Commodity |
| Landing-Page-Designsystem | `website/` | 391 | lose | 1 Tag |
| Ollama-Client | `ollama.ts` | 210 | nein | 0,5 Tage — **aber wertlos**, das ist ein `fetch`-Wrapper um eine dokumentierte HTTP-API |
| Retrieval-Kaskade | `retrieval.ts` | 261 | **eng** | Neuschreiben. Die *Idee* (Scope-Ehrlichkeit) ist übertragbar, der Code nicht. |
| Agenten | `agents.ts` | 239 | **eng** | **wertlos** — vier Prompt-Strings |
| React-UI | `src/components/` | ~4.900 | **eng** | **wertlos** außerhalb von Vera |
| SQLite-Layer | `db.ts` | 1.230 | **eng** | wertlos (siehe 1.2) |

**Summe des echten, nicht-commodity Wiederverwendungswerts:** Release-Pipeline + Tresor + Capture-Sidecar + FFI-Muster + Tracker ≈ **9–14 Arbeitstage gespart**, verteilt auf rund **1.800 der 12.141 LOC — also 15 % des Codes.**

Die anderen 85 % (React-UI, `db.ts`, `agents.ts`, `retrieval.ts`, `Settings.tsx`) haben außerhalb von Vera **keinen** Wert.

### Was davon ein echter Vorteil ist, und was nur so aussieht

Die **Release-Pipeline ist das wertvollste Einzelstück im Repo** — und zugleich das am meisten unterschätzte. Apple-Developer-Account, Signierung, Notarization, gehärtete Laufzeit, ein funktionierender Updater mit Signaturprüfung: das ist für die meisten Indie-Entwickler eine Hürde von Tagen bis Wochen, und Erik hat sie einmal bezahlt. Jedes zukünftige macOS-Produkt startet dadurch mit einem Vorsprung von 1–2 Wochen.

Der **Tresor** ist die zweitwertvollste Komponente, weil er echtes Krypto-Handwerk demonstriert, das den meisten Wettbewerbern fehlt — aber er braucht vorher die Reparatur von F-4 (Schlüsselverlust) und F-5 (stille Degradation).

Der **Capture-Sidecar** ist solide Arbeit, aber deutlich weniger differenzierend als es wirkt: ScreenCaptureKit ist eine dokumentierte Apple-API, und Frame-Capture mit Dedupe ist der Standardansatz, den auch Rewind, Screenpipe und andere fahren. Der Vorsprung liegt hier in Tagen, nicht in Monaten.

Die **Ollama-Anbindung ist kein Asset.** Sie ist ein `fetch` gegen `localhost:11434`. Sie in einer Wiederverwendungsliste zu führen, wäre Selbstbetrug.

---

## 6. Abschließendes Urteil

**Vera ist ein Steinbruch mit zwei tragfähigen Blöcken und viel Geröll:** handwerklich überdurchschnittlich in der Krypto- und Distributionsschicht (~15 % des Codes, 9–14 Tage übertragbarer Wert), aber ohne Modulgrenzen, ohne einen einzigen Test, mit sicherheitskritischer Logik in drei divergierenden Kopien, mit einem Klartext-API-Schlüssel neben einem ungenutzten Secure-Enclave-Tresor, mit einem Krypto-Design, das die Nutzerdaten beim nächsten Fingerabdruck-Wechsel still vernichtet — und mit einem beworbenen Kern („vier lokale Agenten"), der aus vier Prompt-Strings besteht.

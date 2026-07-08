# Vera Umbauplan — Vom "lokalen KI-Begleiter" zum Abrechnungs-Copiloten

Stand: Juli 2026. Dieses Dokument ist die verbindliche Grundlage für den Umbau.
Wir bauen strikt Schicht für Schicht; jede Schicht wird einzeln umgesetzt,
verifiziert und abgenommen, bevor die nächste beginnt.

**Grundsatz: Nach Schicht 1 existiert die alte Vera nicht mehr.** Kein
Agenten-Chat, kein Knowledge, keine Notes, keine Goals, keine Cloud-KI-Option,
keine alte Website. Alles, was das neue Produkt nicht braucht, wird physisch
aus dem Repo gelöscht (nicht auskommentiert, nicht "eingefroren") und der
Nachweis erbracht, dass nichts mehr darauf verweist.

---

## 1. Warum der Umbau — die Friedhofs-Analyse

### Gescheiterte / verschwundene Modelle und ihre Todesursache

| Wer | Was passierte | Lektion für uns |
|---|---|---|
| **Rewind AI** ($350M Bewertung) | Pivot zu Limitless (Hardware), Dez. 2025 von Meta gekauft, App am 19.12.2025 abgeschaltet | Horizontales "Screen-Memory" hat keinen täglichen Nutzungsanker → keine Retention → kein Abo. Der Privacy-Vertrauensbruch (Meta) hat die Nutzerbasis verbrannt — es gibt jetzt heimatlose, privacy-sensible Ex-Rewind-Nutzer. |
| **Passive Zeiterfassung 1.0** (WiseTime-Generation, Chrometa etc.) | Nur 10–15 % Adoption in Kanzleien, die es einführten (ABA Journal) | Aktivität *erfassen* reicht nicht. Wenn das Tool keine **fertigen, einreichbaren Einträge samt Beschreibung** erzeugt, ist der Review-Aufwand höher als manuelle Erfassung. Das Produkt muss den Eintrag schreiben, nicht nur die Daten liefern. |
| **Microsoft Recall** | Massiver öffentlicher Backlash, mehrfach verschoben, nur mit Opt-in + Abschottung tragbar | "Zeichnet deinen Bildschirm auf" ist als Botschaft toxisch. Die Botschaft muss das *Ergebnis* sein (Geld, Zeit), nicht der Mechanismus. Privacy-Architektur muss beweisbar sein, nicht behauptet. |

### Wo wir nicht mehr angreifen können (besetztes Terrain)

| Segment | Platzhirsch | Warum aussichtslos |
|---|---|---|
| US-Großkanzleien (Enterprise) | **Laurel** — $100M Series C (Juni 2025), 100+ Kunden, firmenspezifische LLMs | Enterprise-Vertrieb, Kapital, Referenzen. Nicht unser Spiel. |
| US-SMB-Kanzleien | **Ajax** (liest Bildschirminhalte, MyCase/Clio-Integrationen), **Billables AI** ($39/Sitz), **Smokeball AutoTime** (gebündelt) | Drei finanzierte Player + gebündelte Lösung. Umkämpft, englischsprachig, Cloud-Ökosystem. |
| Horizontales Screen-Memory | **Screenpipe** — Open Source (MIT), YC S26, 16k+ GitHub-Stars, kostenlos | Gegen kostenloses OSS mit Community verkauft man kein generisches Screen-Memory. Kategorie zusätzlich durch Rewind-Ende diskreditiert. |
| Metadaten-basierte Auto-Zeiterfassung | **Memtime** ($12–29/Sitz, Win/Mac/Linux, DACH), **Rize** ($10–24), **Timing** (Mac, $9–16) | Solide, günstige, etablierte Tools. Auf reiner App/Fenster-Metadaten-Ebene gewinnen wir nichts. |

### Die Lücke, die niemand besetzt

Alle Content-lesenden, Einträge-schreibenden Tools (Laurel, Ajax, Billables)
sind **Cloud-basiert, US-fokussiert, englischsprachig**. Alle lokalen Tools
(Memtime, Rize, Timing) lesen **bewusst keine Inhalte** — Rize wirbt sogar
damit ("never captures your screen") — und können deshalb weder Einträge
zuordnen noch Leistungsbeschreibungen schreiben.

**Niemand bietet: inhaltsbasierte, automatisch formulierte, abrechnungsfertige
Zeiteinträge — 100 % auf dem Gerät.**

Genau diese Kombination kann Vera, weil Capture + OCR + verschlüsselte lokale
DB + lokales LLM (Ollama) bereits existieren. Regulatorischer Rückenwind:
BRAK-Leitlinien (Dez. 2024) empfehlen, nur anonymisierte Eingaben an Cloud-KI
zu geben; § 203 StGB (Mandatsgeheimnis) und DSGVO machen Cloud-Verarbeitung
von Mandats-/Klientendaten zum Compliance-Risiko. On-Device ist hier
Kaufvoraussetzung — und für Cloud-Anbieter strukturell nicht kopierbar.
Konsequenz für uns: **Die optionale Cloud-KI (Anthropic/OpenAI-Keys) fliegt
komplett raus.** "Kein Byte verlässt das Gerät" muss wörtlich wahr sein.

---

## 2. Die neue Positionierung

> **Vera holt Abrechnern verlorene Stunden zurück — und kein Byte verlässt je
> das Gerät.**
>
> Vera rekonstruiert deinen Arbeitstag inhaltlich, ordnet Blöcke
> Kunden/Projekten/Mandaten zu, schreibt abrechnungsfertige
> Leistungsbeschreibungen und übergibt sie per Klick an dein
> Abrechnungssystem. Alles lokal, verschlüsselt, DSGVO-nativ.

- **Beachhead (Mac, jetzt):** Agenturen, Studios, Consultants, Freelancer
  (DACH + englischsprachig), die nach Zeit abrechnen.
- **Skalierung (Windows, später):** deutsche Kanzleien und Steuerberater
  (RA-MICRO/DATEV-Welt, fast ausschließlich Windows). Bewusst Phase 2.
- **North-Star-Metrik:** bestätigte abrechenbare Minuten pro Nutzer pro Woche.
  Sekundär: Anteil der Tage mit abgeschlossenem Tages-Review ("Daily Close").
- **Retention-Anker:** täglicher 3-Minuten-Tagesabschluss (= Geld) und der
  Wochenreport "X Stunden / Y € zurückgeholt".
- **Anti-Scope (wird NICHT gebaut):** generischer KI-Chat, Coach/Wellness,
  Wissensmanagement, Cloud-Sync in v1, Mobile-App,
  Mitarbeiter-Überwachungsfeatures (Datenhoheit bleibt beim Einzelnen).

---

## 3. Der Schichtenplan

Jede Schicht listet exakt: **GELÖSCHT** (was physisch aus dem Repo entfernt
wird), **NEU GEBAUT — und zwar so** (was entsteht und wie es funktioniert),
**UMGEBAUT** (bestehende Dateien, die sich ändern) und **NACHWEIS/ABNAHME**
(womit die Schicht als fertig gilt). In Linux-Containern gilt: Frontend wird
mit `npx tsc --noEmit` + `npm run build` verifiziert, Rust-/Native-/SQL-Logik
mit Replika-Tests; der macOS-Build (`npm run tauri build`) ist der finale
Beweis beim Nutzer.

---

### Schicht 0 — Website-Abriss & Neubau (Positionierung nach außen)

Die alte Marketing-Site ("dein lokaler KI-Begleiter") wird vollständig
ersetzt. Parallel (kein Code): 10–15 Interviews mit Zielkunden; eine
Kernfrage: "Wie erfasst du heute deine Zeit, und was entgeht dir dadurch —
in Euro?"

**GELÖSCHT:**
- Der komplette Inhalt von `website/src/App.tsx` (346 Zeilen alte
  Landingpage: Hero "digital memory", Feature-Grid mit Agenten/Knowledge,
  altes FAQ). Die Datei wird von Grund auf neu geschrieben, kein alter
  Abschnitt bleibt.
- Alle Text-/Copy-Reste der alten Positionierung in `website/index.html`
  (Title, Meta-Description, OG-Tags).

**NEU GEBAUT — und zwar so:**
- `website/src/App.tsx` (neu): Aufbau in dieser Reihenfolge:
  1. Hero: "Vera holt dir verlorene abrechenbare Stunden zurück." Subline:
     "Automatische Zeiterfassung, die deinen Tag versteht und deine
     Leistungsbeschreibungen schreibt — 100 % auf deinem Mac. Kein Byte
     verlässt das Gerät." CTA = Warteliste (E-Mail-Feld), sekundärer CTA =
     Download bleibt vorerst verborgen bis Schicht 6.
  2. "So funktioniert es"-Band in 3 Schritten: Erfassen (lokal,
     verschlüsselt) → Zuordnen (Kunde/Projekt, lokales LLM) → Abrechnen
     (fertige Einträge, Export).
  3. Geld-Rechner: interaktiver Slider "Stundensatz × vergessene
     Minuten/Tag" → "Das kostet dich X € im Jahr."
  4. Privacy-Band: On-Device-Architektur erklärt (Verschlüsselung, Ollama,
     kein Account nötig), explizite Abgrenzung zu Cloud-Tools und zum
     Rewind/Meta-Schicksal.
  5. Zielgruppen-Sektion: Agenturen/Studios, Consultants, Freelancer;
     Hinweis "Kanzlei-Edition (Windows/DATEV) in Vorbereitung" mit eigener
     Wartelisten-Checkbox (validiert Schicht 8!).
  6. FAQ (Berechtigungen, Datenlöschung, Modelle, Offline) + Footer.
- Wartelisten-Backend: statisches Formular via Form-Provider (Formspree o.ä.,
  da die Site statisch deployt wird); E-Mail + Checkboxen "Segment" und
  "Kanzlei-Interesse".
- Zwei Copy-Varianten des Hero (Geld-Fokus vs. Privacy-Fokus) als simples
  A/B über URL-Parameter; Auswertung über die Formular-Metadaten.

**UMGEBAUT:**
- `website/index.html`: neuer Title ("Vera — Automatische Zeiterfassung, die
  deine Abrechnung schreibt"), neue Meta-Tags.
- **Unangetastet bleiben:** `website/public/downloads/*` und
  `website/public/updater/latest.json` — der Auto-Updater der bestehenden
  Installationen hängt an diesen Pfaden. Sie werden erst in Schicht 6 mit
  dem neuen Release neu befüllt.

**NACHWEIS/ABNAHME:** Website baut (`npm run build` im website/-Ordner),
kein Vorkommen der Begriffe "companion", "memory", "Agenten", "Knowledge"
mehr im Quelltext (`grep -ri` leer). Warteliste nimmt nachweislich E-Mails
an. Interviews: ≥8 von 15 zeigen benennbaren Schmerz mit Betrag, ≥5 würden
Beta mit Kreditkarte reservieren — sonst Positionierung nachschärfen, bevor
Schicht 1 startet.

---

### Schicht 1 — Der Abriss: die alte Vera wird gelöscht

Ziel: Das Repo enthält danach **nur noch** Capture-Fundament, Datenbank,
Ollama-Anbindung und eine minimale Hülle (Heute-Ansicht als Platzhalter +
Einstellungen). Alles andere ist physisch weg. Die App kompiliert, läuft und
erfasst weiter — sie kann nur noch nichts "Altes".

**GELÖSCHT (Frontend-Komponenten, ersatzlos):**
- `src/components/AgentChat.tsx` (407 Z.) — Agenten-Chat-UI
- `src/components/Agents.tsx` (76 Z.) — Agenten-Übersicht
- `src/components/AgentsCard.tsx` (47 Z.) — Dashboard-Karte Agenten
- `src/components/CommandBar.tsx` (879 Z.) — "Ask your memory"-Bar samt
  Frame-Zitaten. (Eine schlanke Suche über Arbeitsblöcke kommt in Schicht 2
  neu — nichts hiervon wird wiederverwendet.)
- `src/components/Knowledge.tsx` (316 Z.) — Wissensablage
- `src/components/Goals.tsx` (167 Z.) — Ziele
- `src/components/NotesComposer.tsx` (166 Z.) — Quick Notes
- `src/components/TodayCard.tsx` (139 Z.) — Fokus/Meetings-Statistik
- `src/components/TopAppsCard.tsx` (102 Z.) — Top-Apps-Karte
- `src/components/TimelineCard.tsx` (224 Z.) — Dashboard-Aktivitätskarte

**GELÖSCHT (Frontend-Bibliothek):**
- `src/lib/agents.ts` (239 Z.) — Agenten-Definitionen, buildFrameContext
- `src/lib/agentActions.ts` (54 Z.) — Agenten-Aktionen
- `src/lib/retrieval.ts` (261 Z.) — Frame-Retrieval für Chat/Agenten
- `src/lib/textSimilarity.ts` (14 Z.) — nur von retrieval genutzt
- In `src/lib/db.ts`: `notesRepo`, `goalsRepo`, `capturesRepo`,
  `seedDatabaseIfEmpty()` (inkl. Goal-Seeding), der
  Placeholder-Notes-Purge-Block, die Interfaces `DbNote`, `DbGoal`,
  `DbCapture`, sowie `redactSensitiveData`/`isLuhnValid` in TypeScript
  (die Redaktion passiert weiterhin in Rust — die TS-Kopie war nur für den
  gelöschten captures-Pfad).
- In `src/lib/db.ts` (framesRepo): `needingEmbeddings()` und
  `updateEmbedding()` — Embeddings dienten nur dem gelöschten Retrieval.
- In `src/lib/ollama.ts`: `generateEmbedding()` und Embedding-Modell-Logik.
- In `src/lib/exportData.ts`: die notes/goals-Abschnitte des Exports
  (Export von activity/frames/settings bleibt als DSGVO-Datenauszug).

**GELÖSCHT (App-Rahmen):**
- In `src/App.tsx`: die Routen/States für "Agents", "Knowledge", "Goals";
  die Event-Listener `vera-open-agent` und `capture-stored`; die komplette
  Embedding-Backfill-Logik (`backfillEmbeddings`, `runEmbeddingBackfill`).
- In `src/lib/config.ts`: die navItems Agents/Knowledge/Goals.
- In `src/components/Sidebar.tsx`: Quick-Notes-Bereich (Import von
  `NotesComposer`, `notesRepo`) und die gelöschten Nav-Einträge.
- In `src/components/Settings.tsx` (1392 Z., wird stark schrumpfen): die
  Sektionen "AI Engine local/cloud", Cloud-Provider/-Modelle/-API-Keys,
  Embedding-Modell; jede Erwähnung von Agenten/Notes/Goals.
- In `src/components/Onboarding.tsx`: alle Schritte, die Agenten/Chat/
  Memory bewerben — es bleibt vorerst ein Minimal-Flow (Name +
  Berechtigungen). Das neue Verkaufs-Onboarding kommt in Schicht 6.

**GELÖSCHT (Rust, `src-tauri/src/lib.rs`):**
- Die Tauri-Commands `save_cloud_api_key`, `has_cloud_api_key`,
  `test_cloud_connection`, `generate_chat_completion` samt Hilfsfunktionen
  `call_anthropic`, `call_openai`, Provider-Validierung und den Einträgen im
  `invoke_handler`. Danach prüfen: hängt `reqwest` nur an diesen Calls →
  Abhängigkeit aus `Cargo.toml` entfernen.
- Jeder Codepfad, der in die Tabelle `captures` schreibt oder das Event
  `capture-stored` emittiert.

**GELÖSCHT (Datenbank, neue Migration v6 in lib.rs):**
- Vor dem Löschen: einmaliger Sicherheits-Export der Tabellen `notes` und
  `goals` als JSON in den App-Support-Ordner (falls ein Bestandsnutzer doch
  Inhalte hatte).
- `DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS goals;
  DROP TABLE IF EXISTS captures;`
- `DELETE FROM settings WHERE key IN ('ai_engine','cloud_provider',
  'cloud_model_anthropic','cloud_model_openai','cloud_last_status',
  'embedding_model','db_seeded','placeholder_notes_purged') OR key LIKE
  'cloud_api_key_%';`

**GELÖSCHT (Repo-Hygiene):**
- `README.md`: der Tauri-Template-Boilerplate-Text wird durch eine echte
  Produktbeschreibung des neuen Vera ersetzt.
- `CLAUDE.md`: Projektbeschreibung auf das neue Produkt aktualisiert.
- `package.json`: `"name": "vera-web-app"` → `"vera"`, Version auf
  `0.6.0` (der Versionssprung markiert den Schnitt).

**UMGEBAUT:**
- `src/components/Dashboard.tsx` (27 Z.): wird zur leeren Hülle "Heute" mit
  Platzhalter ("Deine Arbeitsblöcke erscheinen hier ab Schicht 2") — die
  Karten-Imports sind weg.
- `src/components/Sidebar.tsx`: Navigation nur noch "Heute" und
  "Einstellungen" (weitere Einträge kommen mit ihren Schichten).
- `src/components/TopBar.tsx`, `ProfileMenu.tsx`, `UpdateChecker.tsx`,
  `Wordmark.tsx`: bleiben, nur tote Verweise entfernt.
- Die gesamte Capture-Infrastruktur bleibt unangetastet: `tracker.m`,
  `frame-capture.swift`, `frame-extract.swift`, `tracker-ocr.swift`,
  `vault.m`, die Frames-/Activity-Pfade in `lib.rs`, Tray, Pause,
  Berechtigungen, Verschlüsselung, Eviction.

**NACHWEIS/ABNAHME:**
- `npx tsc --noEmit` und `npm run build` grün.
- `grep -rn "agents\|agentActions\|retrieval\|notesRepo\|goalsRepo\|capturesRepo\|CommandBar\|Knowledge\|NotesComposer\|generate_chat_completion\|cloud_api_key\|generateEmbedding" src/ src-tauri/src/` liefert **null Treffer**.
- Migration v6 als Standalone-Replika-Test (rusqlite bzw. sqlite3-CLI)
  bewiesen: Tabellen weg, Settings bereinigt, Sicherheits-Export erzeugt.
- App startet auf macOS, erfasst weiter Activity/Frames, Einstellungen
  funktionieren. LOC-Bilanz im Commit dokumentiert (~3.000+ Zeilen gelöscht).

---

### Schicht 2 — Datenmodell & Block-Engine (aus Frames wird ein Arbeitstag)

Ziel: Vera zeigt den Tag als lückenlose Folge von **Arbeitsblöcken** mit
Kunden-/Projektstruktur — noch ohne KI-Zuordnung.

**NEU GEBAUT — und zwar so:**
- Migration v7 in `lib.rs`:
  ```sql
  CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, color TEXT,
    hourly_rate_cents INTEGER, currency TEXT NOT NULL DEFAULT 'EUR',
    archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
  CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    name TEXT NOT NULL, billable INTEGER NOT NULL DEFAULT 1,
    hourly_rate_cents INTEGER,
    archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
  CREATE TABLE work_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
    app_summary TEXT, title_summary TEXT,
    evidence TEXT,               -- JSON: Top-Fenstertitel, Domains, OCR-Stichwörter
    project_id INTEGER REFERENCES projects(id),
    assignment_source TEXT,      -- 'manual' | 'rule' | 'llm' (ab Schicht 3)
    confidence REAL,
    status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'confirmed' | 'discarded'
    user_edited INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX idx_blocks_day ON work_blocks(started_at);
  ```
- `src/lib/blocks.ts` (neu) — die Segmentierungs-Engine:
  - Input: `activity_events` + `frames` eines Tages.
  - Signatur eines Moments = App + Domain (aus URL) + Dokumentpfad/-titel
    (aus Fenstertitel, normalisiert).
  - Regeln: aufeinanderfolgende Momente mit gleicher Signatur verschmelzen;
    Blockwechsel bei Signaturwechsel > 2 min oder Lücke ≥ 5 min (Idle);
    Fragmente < 3 min werden dem umgebenden Block zugeschlagen oder landen
    in "Kurzarbeiten". `evidence` speichert die 5 häufigsten Fenstertitel,
    Domains und markante OCR-Begriffe als JSON.
  - Läuft beim App-Start (gestern + heute) und alle 15 min für heute;
    idempotent: offene, nicht `user_edited` Blöcke des Tages werden ersetzt,
    bestätigte/editierte nie angefasst.
- `src/lib/db.ts`: neue Repos `clientsRepo`, `projectsRepo`, `blocksRepo`
  (CRUD + `forDay`, `confirm`, `merge`, `split`, `discard`).
- `src/components/DayView.tsx` (neu, ersetzt die Rolle von Timeline.tsx):
  vertikale Tagesleiste mit Blöcken (Zeit, Dauer, App-Icon,
  Signatur-Zusammenfassung), Aktionen: zusammenführen, teilen, verwerfen,
  manuell Projekt zuweisen (Dropdown), Evidence-Popover ("warum glaubt Vera
  das?" — zeigt Fenstertitel/Domains). Suchfeld filtert Blöcke nach Text.
- `src/components/ClientsProjects.tsx` (neu): CRUD-Ansicht für Kunden und
  Projekte inkl. Stundensatz und Farbe; neuer Sidebar-Eintrag
  "Kunden & Projekte".

**GELÖSCHT:**
- `src/components/Timeline.tsx` (304 Z.) — die Frame-/Stunden-Timeline wird
  ersatzlos durch DayView abgelöst; der "extract_frame_near"-Vorschaupfad
  bleibt in Rust erhalten (DayView nutzt ihn im Evidence-Popover).
- In `src/lib/db.ts`: `activityRepo.todayStats`, `topAppsToday`,
  `timelineToday`, `timelineThisWeek`, `timelineThisMonth`,
  `getAppIconName` — die alten Dashboard-Statistiken. Es bleiben
  `insertEvent`, `eventsForDay`, `activeDays`.

**UMGEBAUT:**
- `src/components/Dashboard.tsx`: rendert jetzt DayView ("Heute").
- Frames-Retention: `frames_retention_days` (Default 30) bleibt; neu
  dokumentiert als Produktversprechen "Rohdaten verfallen, Blöcke bleiben"
  — Blöcke tragen nur Text-Evidence und überleben die Rohdaten-Löschung.

**NACHWEIS/ABNAHME:** Segmentierung als Standalone-Replika-Test mit
synthetischen activity/frames-Fixtures bewiesen (Grenzfälle: Idle, schnelle
Wechsel, Mitternacht). Ein realer Arbeitstag erscheint als plausible,
lückenlose Blockfolge; bestätigte Blöcke überleben Re-Runs. tsc/build grün;
`grep -rn "Timeline\b" src/` liefert null Treffer.

---

### Schicht 3 — Der Zuordnungs-Motor (Regeln + lokales LLM)

Ziel: ≥80 % der Blöcke sind beim Öffnen bereits dem richtigen Projekt
zugeordnet.

**NEU GEBAUT — und zwar so:**
- Migration v8:
  ```sql
  CREATE TABLE assignment_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matcher_type TEXT NOT NULL,   -- 'domain' | 'app' | 'title_keyword' | 'path'
    pattern TEXT NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    created_from TEXT,            -- 'user' | 'suggestion'
    created_at INTEGER NOT NULL);
  CREATE TABLE assignment_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_evidence TEXT NOT NULL, -- JSON-Snapshot des Blocks
    correct_project_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL);
  ```
- `src/lib/assign.ts` (neu) — Zuordnung in fester Reihenfolge:
  1. `user_edited`-Blöcke: nie anfassen.
  2. Regeln (`assignment_rules`): deterministisch, Konfidenz 1.0.
  3. Lokales LLM (über bestehendes `ollama.ts`/`engine.ts`): Prompt =
     Projektliste (Name, Kunde, Beschreibung) + Block-Evidence + die 10
     jüngsten passenden `assignment_feedback`-Beispiele als Few-Shot.
     Antwort als striktes JSON `{project_id, confidence, reason}`;
     Konfidenz < 0.6 ⇒ Block bleibt "unzugeordnet" (ehrlich statt falsch).
  - Läuft nach jedem Segmentierungs-Lauf über alle offenen Blöcke.
- Lernschleife: Jede manuelle Korrektur in DayView schreibt
  `assignment_feedback`; erkennt Vera dieselbe Domain/App 3× korrigiert,
  schlägt sie in der UI eine Regel vor ("Immer kunde-x.de → Projekt X?" →
  Ein-Klick-Anlage in `assignment_rules`).
- Regel-Verwaltung als Unterseite von "Kunden & Projekte".

**UMGEBAUT:**
- `src/components/DayView.tsx`: Konfidenz-Badge pro Block (Regel/KI/manuell,
  Prozentwert), Bulk-Aktion "alle Vorschläge dieses Kunden bestätigen",
  Abschnitt "Unzugeordnet" oben.
- `src/lib/engine.ts`: schrumpft auf reine Ollama-Ansteuerung mit
  JSON-Modus + Retry (der Cloud-Zweig ist seit Schicht 1 weg).

**NACHWEIS/ABNAHME:** Klassifikations-Replika-Test mit Fixture-Blöcken und
Golden-Antworten. Im Selbstversuch nach 2 Wochen: ≥80 % korrekt
vor-zugeordnet (gemessen als 1 − Korrekturquote); kein Block mit
Konfidenz ≥ 0.6 falsch zugeordnet bei den Top-3-Kunden.

---

### Schicht 4 — Leistungsbeschreibungen & Tagesabschluss (das Herzstück)

Ziel: Aus bestätigten Blöcken werden abrechnungsfertige Einträge; der
Tagesabschluss dauert unter 5 Minuten. Das ist die direkte Antwort auf die
10–15 %-Adoptionsfalle der WiseTime-Generation.

**NEU GEBAUT — und zwar so:**
- Migration v9:
  ```sql
  CREATE TABLE time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    entry_date TEXT NOT NULL,          -- 'YYYY-MM-DD'
    minutes INTEGER NOT NULL,          -- echte Minuten
    rounded_minutes INTEGER NOT NULL,  -- nach Rundungsregel
    narrative TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'confirmed' | 'exported'
    source_block_ids TEXT NOT NULL,    -- JSON-Array
    created_at INTEGER NOT NULL);
  ```
- `src/lib/narratives.ts` (neu): erzeugt pro Projekt+Tag aus den bestätigten
  Blöcken einen Eintragsentwurf. Prompt-Bausteine: Branchen-Template
  (Agentur / Beratung / Kanzlei), Sprache (DE/EN), Ton (knapp/ausführlich),
  Block-Evidence. Ausgabe: 1–3 Sätze Tätigkeitsbeschreibung ohne sensible
  Details (Redaktionsfilter läuft über das Ergebnis). Nutzer-Edits werden
  als Stilbeispiele gespeichert und künftigen Prompts als Few-Shot
  mitgegeben — die Beschreibungen klingen nach dem Nutzer.
- Rundungsregeln als Einstellung: exakt / 6 min / 15 min, auf/ab/kaufmännisch
  — pro Projekt überschreibbar (Kanzlei-Standard 6 min vorbereitet).
- `src/components/DailyClose.tsx` (neu): geführter Flow — 1) offene Blöcke
  bestätigen, 2) Entwürfe je Projekt durchgehen (bearbeiten/zusammenlegen),
  3) "Tag abschließen" ⇒ Einträge `confirmed`. Fortschrittsanzeige und
  Tagessumme in € (Minuten × Projektsatz).
- `src/components/TopBar.tsx`: Tagesabschluss-Status ("Heute noch nicht
  abgeschlossen · 14 Blöcke offen") als permanenter, klickbarer Anker.

**UMGEBAUT:**
- `src/components/DayView.tsx`: bekommt den Einstieg "Tag abschließen".
- `src/lib/db.ts`: `entriesRepo` (CRUD, `forRange`, `markExported`).

**NACHWEIS/ABNAHME:** Narrative-Replika-Test (Fixture-Blöcke → Entwürfe,
Redaktionsfilter greift). Selbstversuch über 5 Arbeitstage: Tagesabschluss
im Median < 5 min; ≥70 % der Entwürfe ohne Bearbeitung übernommen. Erst wenn
das steht, beginnt Schicht 5 — sonst wird hier iteriert (Kill-Kriterium in
Abschnitt 5).

---

### Schicht 5 — Berichte & Export (der Wert wird sichtbar und portabel)

**NEU GEBAUT — und zwar so:**
- `src/lib/export/` (neu): `csv.ts` (generisches Format: Datum, Kunde,
  Projekt, Minuten, gerundet, Satz, Betrag, Beschreibung), dazu
  Import-kompatible Varianten `toggl.ts` und `harvest.ts`; Export je
  Zeitraum über nativen Save-Dialog. Architektur als Adapter-Interface,
  damit Schicht 7 (APIs) und Schicht 8 (DATEV) nur Adapter ergänzen.
- `src/components/Reports.tsx` (neu) + Sidebar-Eintrag "Berichte":
  Wochen-/Monatssicht — bestätigte Stunden & € je Kunde,
  Auslastung, unabgerechnete Zeit, und die Kernzahl **"zurückgeholte
  Zeit"**: Summe bestätigter Blöcke unter 15 Minuten plus Blöcke außerhalb
  des Haupt-Arbeitsfensters — operationalisiert als "Zeit, die manuelle
  Erfassung typischerweise verliert". Definition steht transparent im
  Report.
- Report als teilbares PNG exportierbar (der Screenshot, den Nutzer in
  Slack/LinkedIn posten — unser organischer Vertriebskanal).

**GELÖSCHT:**
- `src/lib/exportData.ts` — der alte JSON-Gesamtexport geht in
  `src/lib/export/backup.ts` auf (kompletter DSGVO-Datenauszug), der Rest
  entfällt.

**NACHWEIS/ABNAHME:** Export-Replika-Tests (CSV-Golden-Files; Toggl/Harvest
importieren die Dateien nachweislich sauber). Wochenreport zeigt korrekte
Summen gegen Fixture-Daten.

---

### Schicht 6 — Monetarisierung, neues Onboarding, Release

**NEU GEBAUT — und zwar so:**
- Lizenzierung: Merchant-of-Record (Paddle oder Lemon Squeezy — übernehmen
  EU-Umsatzsteuer). `src/lib/license.ts` (neu): Lizenzschlüssel-Eingabe,
  Offline-Gnadenfrist 14 Tage, Validierung ist der **einzige**
  Netzwerk-Call der App und wird auf der Website genau so dokumentiert.
- Trial: 14 Tage voll funktionsfähig; permanenter, unaufdringlicher Zähler
  "Vera hat dir bisher X € gefunden" (Summe zurückgeholter Zeit × Satz) —
  der Kauf-Trigger.
- `src/components/Onboarding.tsx` (Neubau): 1) Positionierung in einem
  Satz, 2) Berechtigungen mit Erklärung der monatlichen
  macOS-Re-Bestätigung, 3) Ollama-Setup mit Hardware-Empfehlung
  (One-Click-Modell-Pull), 4) erste Kunden/Projekte anlegen (oder
  Demo-Daten), 5) Versprechen: "Morgen früh zeigt dir Vera deinen ersten
  vollständigen Tag." Time-to-Wow < 24 h.
- Website (Schicht-0-Basis): Pricing-Sektion (Solo €19 / Pro €29 mit
  Integrationen / Kanzlei €49 ab Schicht 8), Checkout-Links, Download wird
  öffentlich; `website/public/downloads` + `updater/latest.json` mit dem
  0.6-Release neu befüllt.

**UMGEBAUT:**
- `src/components/Settings.tsx`: Sektion "Lizenz" (Schlüssel, Status,
  Rechnung), Sektion "Berichte & Rundung".
- `scripts/release-mac.sh`: Signierung/Notarisierung + Updater-JSON auf das
  neue Release-Schema geprüft.

**NACHWEIS/ABNAHME:** Kompletter Kauf → Schlüssel → Aktivierung → Update-Zyklus
einmal real durchlaufen. Erste 100 zahlende Nutzer / €10k MRR als
Geschäftsziel dieser Schicht; <5 % Monats-Churn.

---

### Schicht 7 — Direkt-Integrationen (der Graben wird tiefer)

**NEU GEBAUT — und zwar so:** je ein Adapter in `src/lib/export/` gegen die
offiziellen APIs, Reihenfolge nach Nachfrage aus Schicht 0/6 (Kandidaten:
Moco, awork, Clio, Lexoffice/sevDesk). Pro Adapter: API-Key-Eingabe in
Settings (verschlüsselt via Vault), Projekt-Mapping-UI (Vera-Projekt ↔
Zielsystem-Projekt), Push bestätigter Einträge, Duplikatsschutz über
`time_entries.status='exported'` + Referenz-ID. Jede Integration bekommt
eine eigene Landingpage auf der Website ("Vera + Moco").
**NACHWEIS/ABNAHME:** Ein Abrechnungsmonat wird von echten Beta-Nutzern
produktiv in mindestens 2 Zielsysteme übergeben.

### Schicht 8 — Windows-Port & Kanzlei-Edition (die Skalierungsstufe)

**NEU GEBAUT — und zwar so:** Capture-Schicht für Windows als Pendant zu den
macOS-Natives (Fenster-/App-Erfassung + OCR über Windows-APIs; Tauri-Frontend
bleibt identisch); DATEV-kompatibler Export + RA-MICRO-Format als weitere
Adapter; RVG-/6-Minuten-Defaults; Kanzlei-Onboarding mit
BRAK-/§203-Argumentation. Multi-Seat: Admin sieht ausschließlich aggregierte,
vom Einzelnen freigegebene Summen — kein Monitoring, das ist Markenkern.
**NACHWEIS/ABNAHME:** 10 zahlende Kanzleien/Steuerberater als Referenzen.
(Details werden nach Abschluss von Schicht 6 zu einem eigenen Bauplan
verfeinert — Windows-Natives verdienen ihr eigenes Dokument.)

---

## 4. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| macOS TCC: monatliche Re-Bestätigung der Bildschirmaufnahme | Erklärflow im neuen Onboarding (Schicht 6); prüfen, wie viel über Accessibility-APIs statt Voll-Capture abbildbar ist; MDM-Doku für Teams. |
| Apple sherlockt On-Device-Kontext | Vertikalisierung: Abrechnungs-Workflow, Integrationen, Branchensprache sind keine OS-Features. Tempo in Schichten 1–4. |
| Memtime/Rize ergänzen Content-Lesen | Deren Privacy-Marketing steht dem entgegen; unser Vorsprung: lokales Formulieren + Lernschleife. Tempo entscheidet. |
| Cloud-Player (Ajax etc.) kommen nach DACH | Ihr strukturelles Handicap: Cloud vs. §203/BRAK. On-Device-Story früh mit Referenzen zementieren (Schicht 8). |
| Lokale LLM-Qualität reicht nicht für Beschreibungen | Schicht 4 hat hartes Abnahmekriterium; Fallback: strukturierte Templates + LLM nur für Feinschliff; Modellwahl nach Hardware. |
| Adoptions-Falle (WiseTime-Muster) | "Tagesabschluss <5 min, ≥70 % unbearbeitet übernehmbar" ist Blocker-Kriterium — ohne das keine Schicht 5. |
| Solo-Kapazität | Schichten strikt sequenziell; Anti-Scope-Liste durchsetzen; jeder Abriss reduziert Wartungslast (Schicht 1 löscht ~3.000+ Zeilen). |

## 5. Kill-Kriterien (ehrlich bleiben)

- **Schicht 0 verfehlt** (kein benennbarer Schmerz mit Betrag in den
  Interviews) → nicht bauen, Positionierung überarbeiten.
- **Schicht 4 verfehlt nach 2 Iterationen** (Review dauert länger als
  manuelle Erfassung) → Kernhypothese gescheitert; Pivot-Optionen neu
  bewerten, bevor weiter investiert wird.
- **Schicht 6: <30 zahlende Nutzer nach 3 Monaten aktiven Vertriebs** →
  Beachhead falsch; Segment wechseln, bevor der Windows-Port (Schicht 8)
  Geld kostet.

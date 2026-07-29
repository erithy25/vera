# Phase 3 — Divergenz

**36 Konzepte. Keine Bewertung, keine Recherche, keine Vorauswahl.** Absichtlich sind schwache und offensichtlich zum Scheitern verurteilte Ideen enthalten — der Kill-Filter in Phase 4 braucht echtes Material, nicht eine vorsortierte Liste. Mehrere Konzepte hier verletzen bereits sichtbar die Constraints aus Abschnitt 1 oder die Verbotsliste aus Abschnitt 5. Das ist beabsichtigt.

Format pro Konzept: **Name** / Wer hat den Schmerz / Was zahlt er / Warum jetzt.

---

## Jagdgrund A — Vera-Pivot
*Gleiche Technik (Screen-Capture, OCR, lokale Verschlüsselung, lokales Modell), anderer Nutzer oder anderes Problem.*

**A1 · Proctor** — Verschlüsselter Prüfungsaufsichts-Rekorder für Fernklausuren
Wer: Dozenten und Kursanbieter, die Online-Prüfungen abnehmen und Täuschung nachweisen müssen.
Zahlt: 3–8 € pro Prüfling und Prüfung.
Warum jetzt: Fernprüfungen sind normal geworden, kommerzielle Proctoring-Dienste sind datenschutzrechtlich in der EU dauerhaft umstritten.

**A2 · Ledger** — Manipulationssicherer Arbeitsnachweis für Freelancer
Wer: Freelancer, die nach Stunden abrechnen und deren Kunden die Rechnung anzweifeln.
Zahlt: 12–19 €/Monat, wenn es einen Streitfall verhindert.
Warum jetzt: Kunden misstrauen Stundenabrechnungen zunehmend, weil sie AI-beschleunigte Arbeit vermuten.

**A3 · Rewind-for-Bugs** — Rollierender 10-Minuten-Puffer, der auf Knopfdruck einen Bug-Report erzeugt
Wer: QA-Tester und Entwickler, die einen sporadischen Fehler reproduzieren müssen, nachdem er passiert ist.
Zahlt: 8–15 €/Monat.
Warum jetzt: „Kann ich nicht reproduzieren" ist der teuerste Satz im Bugtracking und seit Jahren ungelöst.

**A4 · SOP-Maker** — Nimmt einen Arbeitsablauf einmal auf, erzeugt daraus bebilderte Schritt-für-Schritt-Doku
Wer: Ops-Leute und Solo-Betreiber, die Prozesse an neue Mitarbeiter übergeben müssen.
Zahlt: 20–40 €/Monat.
Warum jetzt: Scribe und Tango haben den Markt validiert, aber beide laden Screenshots in die Cloud.

**A5 · ShareGuard** — Live-Redaction beim Bildschirmteilen: schwärzt Secrets, Tokens und Notifications in Echtzeit
Wer: Jeder, der in Meetings seinen Bildschirm teilt und schon einmal versehentlich etwas gezeigt hat.
Zahlt: 25–40 € einmalig.
Warum jetzt: Bildschirmteilen ist Standard, das versehentlich geleakte Passwort im Zoom-Call ein Alltagsereignis.

**A6 · Studybank** — Zeichnet Lernsitzungen auf und erzeugt daraus Spaced-Repetition-Karten
Wer: Schüler und Studenten, die viel am Bildschirm lernen und schlecht wiederholen.
Zahlt: 5–8 €/Monat.
Warum jetzt: Anki ist mächtig, aber das Erstellen der Karten ist die Hürde, an der die meisten scheitern.

**A7 · Tabmemory** — Screen-Memory ausschließlich für Browser-Recherche, nichts sonst
Wer: Rechercheure und Analysten, die eine Quelle wiederfinden müssen, die sie letzte Woche gesehen haben.
Zahlt: 6–10 €/Monat.
Warum jetzt: Browser-Historie ist seit 20 Jahren unverändert nutzlos für die Frage „wo stand das nochmal".

**A8 · Consent** — Erkennt und protokolliert, wann eine Aufnahme-Software den Bildschirm mitliest
Wer: Betriebsräte und datenschutzbewusste Angestellte in Unternehmen mit Monitoring-Software.
Zahlt: unklar, evtl. Verband/Betriebsrat als Käufer.
Warum jetzt: Employee-Monitoring hat mit Remote-Arbeit massiv zugenommen.

---

## Jagdgrund B — Komponenten-Extraktion
*Ein Bauteil aus Vera wird zum eigenständigen Produkt.*

**B1 · Redactor** — Secret-Scanner für Screenshots: erkennt Keys, Tokens, IBANs, Kreditkarten und schwärzt sie vor dem Teilen
Wer: Entwickler, die Screenshots in Issues, Slack, Docs und Blogposts posten.
Zahlt: 19–29 € einmalig.
Warum jetzt: Jeder Entwickler postet täglich Screenshots, und geleakte Keys aus Screenshots sind ein dokumentiertes Problem.

**B2 · vault-rs** — Rust-Crate: AES-GCM-Dateitresor mit Keychain-/Secure-Enclave-Schlüsselverwaltung, inklusive Escrow und Rotation
Wer: Indie-Entwickler, die eine macOS-App mit verschlüsselten lokalen Daten bauen.
Zahlt: nichts (Crate), oder 99–299 € für eine kommerzielle Lizenz mit Support.
Warum jetzt: Local-first-Apps sind im Trend, aber korrekte Schlüsselverwaltung ist die Stelle, an der fast alle scheitern.

**B3 · Notarize** — CLI + GitHub Action, die eine Tauri- oder Electron-App signiert, notarisiert, DMG baut und den Updater bedient
Wer: Indie-Entwickler, die ihre erste macOS-App ausliefern und an Apples Signierungskette scheitern.
Zahlt: 49–99 € einmalig oder 9 €/Monat.
Warum jetzt: Tauri wächst schnell, aber die Distributionshürde auf macOS ist unverändert brutal.

**B4 · ocr-fast** — Lokales OCR-CLI auf Apples Vision-Framework, als schneller Ersatz für Tesseract-Pipelines
Wer: Entwickler, die auf dem Mac Bilder stapelweise in Text umwandeln.
Zahlt: nichts. Open Source.
Warum jetzt: Apples Vision-OCR ist schneller und besser als Tesseract, aber schlecht zugänglich.

**B5 · tauri-sidecar** — Tauri-Plugin für Swift-/ObjC-Sidecars: Lifecycle, Permissions, SIGTERM, JSON-Line-Protokoll
Wer: Tauri-Entwickler, die native macOS-Funktionen brauchen, die Rust nicht abdeckt.
Zahlt: nichts. Reputationsspiel.
Warum jetzt: Tauri v2 ist etabliert, das Sidecar-Muster aber unstandardisiert und schmerzhaft.

**B6 · secretgrep** — Redaction-Engine (Regex + Shannon-Entropie + Luhn) als Bibliothek für Logs, Traces und Prompts
Wer: Teams, die Logs und LLM-Prompts weitergeben, ohne Secrets mitzuschicken.
Zahlt: 0 € OSS / 200 €+ kommerzielle Lizenz.
Warum jetzt: Jeder schickt jetzt Logs an LLMs, und niemand redigiert sie vorher.

**B7 · framedb** — Perceptual-Hash-Dedupe + Segment-Storage als Bibliothek für Video/Frame-Pipelines
Wer: Entwickler, die kontinuierlich Frames speichern müssen, ohne die Platte zu füllen.
Zahlt: nichts.
Warum jetzt: Screen- und Kamera-Capture-Projekte sprießen, jedes löst Dedupe neu.

**B8 · PermissionLens** — Zeigt, welche macOS-App welche TCC-Berechtigung hat und wann sie sie zuletzt genutzt hat
Wer: Datenschutzbewusste Mac-Nutzer und Security-Interessierte.
Zahlt: 15 € einmalig.
Warum jetzt: macOS-Berechtigungen sind undurchsichtig und die Systemeinstellungen zeigen die Nutzung nicht.

---

## Jagdgrund C — Angrenzender Schmerz
*Derselbe Nutzer (macOS-Power-User / Entwickler), völlig anderes Produkt.*

**C1 · Cleanlog** — Redigiert Logs, Traces und Stacktraces lokal, bevor sie in ein LLM oder einen Issue-Tracker wandern
Wer: Entwickler, die täglich Logs in Claude, ChatGPT oder GitHub-Issues einfügen.
Zahlt: 15–25 € einmalig.
Warum jetzt: Das Einfügen von Produktions-Logs in LLM-Chats ist 2026 Alltag und in vielen Firmen formal verboten.

**C2 · Clipvault** — Verschlüsselte Zwischenablagen-Historie mit automatischer Secret-Erkennung und Auto-Löschung
Wer: Entwickler, die ständig Passwörter und Tokens kopieren.
Zahlt: 20 € einmalig.
Warum jetzt: Jeder Clipboard-Manager speichert Passwörter im Klartext; das ist bekannt und wird ignoriert.

**C3 · Demomode** — Ein Schalter, der den ganzen Mac für eine Live-Demo anonymisiert: Namen, Mails, Avatare, Kontostände
Wer: Solo-Gründer und DevRel-Leute, die live demonstrieren.
Zahlt: 39 € einmalig.
Warum jetzt: Jeder Launch-Demo-Screenshot zeigt echte Kundendaten, und niemand hat ein Werkzeug dagegen.

**C4 · Focusproof** — Lokaler Fokus-Tracker ohne Cloud, der belegt, woran die Zeit ging
Wer: Freelancer und Selbstständige, die Zeit nachweisen wollen.
Zahlt: 6 €/Monat.
Warum jetzt: RescueTime und Konsorten laden alles hoch, was viele ablehnen.

**C5 · Envguard** — Wacht über `.env`-Dateien und warnt, bevor sie committet, geteilt oder in ein Terminal gecattet werden
Wer: Entwickler, die schon einmal ein `.env` in ein Repo geschoben haben.
Zahlt: 15 € einmalig.
Warum jetzt: Secret-Leaks über Git sind der häufigste Weg, wie Keys abhandenkommen.

**C6 · Diskmap** — Lokaler Speicherplatz-Analysator, der versteht, welche Entwickler-Caches gefahrlos löschbar sind
Wer: Entwickler mit 512-GB-MacBooks und 200 GB `node_modules`.
Zahlt: 12 € einmalig.
Warum jetzt: Modelle, Container und Caches fressen Platten schneller als je zuvor.

**C7 · Handoff** — Erzeugt aus einer Arbeitssitzung eine strukturierte Übergabe-Notiz für den nächsten Tag
Wer: Entwickler, die morgens 20 Minuten brauchen, um wieder reinzukommen.
Zahlt: 5 €/Monat.
Warum jetzt: Kontextverlust ist real, aber schwer als akut zu verkaufen.

---

## Jagdgrund D — Erik-spezifisch
*Was kann dieser Gründer bauen, was 99 % nicht können? Rust + Kryptografie + Hash-Chains + macOS-Natives + ML-Rigorosität + AI-nativer Workflow + Alter als Aufmerksamkeits-Asset.*

**D1 · BLACKBOX** — Manipulationssicherer Hash-Chain-Flugschreiber für AI-Agenten-Läufe: jeder Tool-Call, jede Datei-Änderung, jeder Prompt in einer verifizierbaren Kette
Wer: Entwickler, die Claude Code, Cursor oder Codex-Agenten auf echten Repos laufen lassen und hinterher nicht rekonstruieren können, was passiert ist.
Zahlt: 15–30 €/Monat pro Entwickler.
Warum jetzt: 2026 laufen Agenten autonom über Produktionscode, und es gibt keinen verlässlichen Audit-Trail dafür.

**D2 · Replay** — Deterministischer Wiederholungs-Rekorder für Agenten-Läufe: derselbe Lauf, dieselben Tool-Antworten, reproduzierbar
Wer: Entwickler, die einen fehlgeschlagenen Agenten-Lauf debuggen wollen, ohne ihn teuer neu zu starten.
Zahlt: 20–40 €/Monat.
Warum jetzt: Agentenläufe kosten Geld und sind nicht reproduzierbar — jedes Debugging ist ein Neukauf.

**D3 · Provenance** — Signierte Herkunftsattestierung für AI-generierten Code: welcher Agent, welches Modell, welcher Prompt, kryptografisch an den Commit gebunden
Wer: Open-Source-Maintainer, die AI-generierte Pull Requests bekommen und nicht wissen, woher sie stammen.
Zahlt: kostenlos für OSS, 5–10 €/Entwickler/Monat kommerziell.
Warum jetzt: Der Anteil AI-generierter PRs explodiert, und Maintainer haben keinerlei Herkunftssignal.

**D4 · Sealbench** — Präregistrierte, kryptografisch versiegelte ML-Benchmarks: Hypothese und Auswertungscode werden vor dem Lauf festgeschrieben und sind hinterher nachweisbar unverändert
Wer: ML-Forscher und Labore, die glaubwürdig zeigen wollen, dass sie ihre Metrik nicht nachträglich gewählt haben.
Zahlt: Institution zahlt 500–2.000 €/Jahr.
Warum jetzt: Benchmark-Gaming ist der offene Skandal des Feldes und die Glaubwürdigkeit von Ergebnissen sinkt.

**D5 · Agentcage** — Lokale Sandbox für Coding-Agenten mit auditierbarem Syscall- und Dateizugriffs-Protokoll
Wer: Entwickler, die einem Agenten nicht blind Schreibzugriff auf ihr Dateisystem geben wollen.
Zahlt: 20 €/Monat.
Warum jetzt: „YOLO-Modus" ist bei Coding-Agenten der Normalfall geworden, und Zwischenfälle häufen sich.

**D6 · Buildproof** — Reproduzierbarkeits-Verifier für Releases: prüft, dass ein veröffentlichtes Binary wirklich aus dem behaupteten Commit stammt
Wer: Nutzer und Maintainer von Desktop-Apps, die Supply-Chain-Angriffe fürchten.
Zahlt: kostenlos OSS, Sponsoring.
Warum jetzt: Reproducible Builds sind ein anerkanntes Ziel, aber für kleine Projekte praktisch unerreichbar.

**D7 · Tokenwatch** — Lokaler Proxy, der Token-Kosten und Kontextverbrauch aller Agenten-Werkzeuge in Echtzeit misst und deckelt
Wer: Entwickler, die eine 200-€-Rechnung von einem durchgelaufenen Agenten bekommen haben.
Zahlt: 10 €/Monat.
Warum jetzt: Agenten-Kostenüberraschungen sind 2026 ein wöchentliches Thema in jedem Dev-Discord.

**D8 · MCP-Audit** — Sicherheitsscanner für MCP-Server: prüft, welche Werkzeuge welche Berechtigungen anfordern und welche Daten abfließen
Wer: Entwickler, die fremde MCP-Server in ihre Agenten-Umgebung einbinden.
Zahlt: kostenlos OSS mit bezahltem CI-Tier, 15 €/Monat.
Warum jetzt: MCP-Server werden aus dem Internet installiert wie npm-Pakete 2015 — ohne jede Prüfung.

**D9 · Attest** — Verifizierbare Ausführungsnachweise für Nicht-Entwickler: eine Datei, ein QR-Code, ein Beweis, dass ein Dokument zu einem Zeitpunkt in dieser Form existierte
Wer: Freelancer, Journalisten, jeder in einem Streitfall.
Zahlt: 3 € pro Attestierung oder 8 €/Monat.
Warum jetzt: AI-generierte Fälschungen machen Zeitstempel-Beweise plötzlich relevant.

---

## Jagdgrund E — Grüne Wiese
*Vera komplett ignorieren. Ungelöste, akute, tägliche Probleme, die zu den Constraints passen.*

**E1 · Contextlint** — Prüft `CLAUDE.md`, `AGENTS.md` und Regel-Dateien auf Widersprüche, tote Pfade und Regeln, die der Agent nachweislich ignoriert
Wer: Teams, die Coding-Agenten mit Regeldateien steuern und nicht wissen, welche Regeln wirken.
Zahlt: 10 €/Monat.
Warum jetzt: Jedes Repo hat inzwischen Agenten-Regeldateien, und niemand weiß, ob sie etwas bewirken.

**E2 · Difftruth** — Zeigt bei einem AI-generierten PR, welche Änderungen der Agent selbst getestet hat und welche er nur behauptet
Wer: Reviewer, die AI-PRs prüfen und den Test-Behauptungen nicht trauen.
Zahlt: 12 €/Entwickler/Monat.
Warum jetzt: Agenten behaupten routinemäßig, Tests seien grün, ohne sie ausgeführt zu haben.

**E3 · Deadcode** — Findet mit Laufzeitdaten statt statischer Analyse Code, der seit Monaten nicht ausgeführt wurde
Wer: Entwickler in gewachsenen Codebasen, die aufräumen wollen und sich nicht trauen.
Zahlt: 15 €/Monat.
Warum jetzt: AI-Agenten produzieren Code schneller, als jemand ihn löscht — Codebasen blähen sich auf.

**E4 · Snapshot** — Lokaler Zeitmaschinen-Layer für Projektordner mit inhaltsadressierter Deduplizierung, unabhängig von Git
Wer: Entwickler, die einen Agenten laufen lassen und ihn zurückrollen wollen, ohne committet zu haben.
Zahlt: 20 € einmalig.
Warum jetzt: Agenten ändern Dutzende Dateien gleichzeitig; `git stash` reicht nicht mehr.

**E5 · Cronwatch** — Überwacht lokal laufende Skripte und Cronjobs und meldet stilles Scheitern
Wer: Solo-Betreiber mit einer Handvoll Automatisierungen, die niemand überwacht.
Zahlt: 8 €/Monat.
Warum jetzt: Healthchecks.io hat den Markt bewiesen, aber lokal/self-hosted fehlt.

**E6 · Modelmeter** — Misst, welches lokale Modell auf diesem konkreten Mac für diese konkrete Aufgabe schnell genug und gut genug ist
Wer: Entwickler, die lokale Modelle einsetzen wollen und nicht wissen, welches auf ihrer Hardware taugt.
Zahlt: kostenlos, Lead-Magnet.
Warum jetzt: Die Zahl lokaler Modelle explodiert, verlässliche Hardware-spezifische Vergleiche fehlen.

**E7 · Licensecheck** — Prüft, ob AI-generierter Code Fragmente aus inkompatibel lizenzierten Projekten enthält
Wer: Firmen, die AI-Code ausliefern und Lizenzrisiken fürchten.
Zahlt: viel, aber der Käufer ist eine Rechtsabteilung.
Warum jetzt: Der Anteil AI-generierten Codes in Produkten wächst und niemand prüft die Herkunft.

**E8 · Localsearch** — Semantische Suche über alle eigenen Dateien, vollständig lokal, ohne Indexierung in der Cloud
Wer: Wissensarbeiter mit 50.000 Dateien, die Spotlight nicht findet.
Zahlt: 30 € einmalig.
Warum jetzt: Einbettungsmodelle laufen jetzt schnell genug lokal.

**E9 · Pipelock** — Verifiziert vor der Installation, dass ein npm- oder Cargo-Paket keine Skripte ausführt und keine Netzwerkzugriffe macht
Wer: Entwickler nach jedem publik gewordenen Supply-Chain-Vorfall.
Zahlt: 10 €/Monat.
Warum jetzt: npm-Supply-Chain-Angriffe sind ein wiederkehrendes Großereignis geworden.

**E10 · Nightshift** — Lässt Coding-Agenten nachts an einer Aufgabenliste arbeiten und liefert morgens einen geprüften Bericht
Wer: Entwickler mit einem Rückstand kleiner, langweiliger Aufgaben.
Zahlt: 30 €/Monat.
Warum jetzt: Agenten sind gut genug für kleine Aufgaben, aber niemand überwacht sie nachts.

**E11 · Handbrake** — Not-Aus für laufende Agenten: friert alle Agenten-Prozesse und Dateisystem-Änderungen bei einem definierten Auslöser ein
Wer: Entwickler, die einem Agenten Schreibrechte gegeben haben.
Zahlt: 12 €/Monat.
Warum jetzt: Es gibt keinen Standard-Abbruchmechanismus für autonome Agenten.

**E12 · Schoolproof** — Beweist, dass eine Hausarbeit über die Zeit gewachsen ist, statt in einem Prompt zu entstehen
Wer: Schüler und Studenten, die zu Unrecht des AI-Betrugs verdächtigt werden.
Zahlt: 3 €/Monat.
Warum jetzt: AI-Detektoren sind nachweislich unzuverlässig, und falsche Anschuldigungen sind ein reales Massenphänomen.

---

## Verteilung

| Jagdgrund | Anzahl |
|---|---|
| A — Vera-Pivot | 8 |
| B — Komponenten-Extraktion | 8 |
| C — Angrenzender Schmerz | 7 |
| D — Erik-spezifisch | 9 |
| E — Grüne Wiese | 12 |
| **Gesamt** | **44** |

Vier Cluster zeichnen sich ohne Bewertung ab: **Redaction/Secret-Hygiene** (B1, B6, C1, C2, C5, A5, C3), **Agenten-Auditierbarkeit** (D1, D2, D3, D5, E2, E11), **macOS-Distribution** (B3, B5, D6) und **verifizierbare Nachweise via Hash-Chains** (D4, D6, D9, E12). Ob einer davon trägt, entscheidet Phase 4.

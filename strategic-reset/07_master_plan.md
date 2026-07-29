# Phase 7 — Entscheidung und vollständiger Plan

**Arbeitsname: Preflight.** (Domain-Verfügbarkeit ist ein Woche-1-Punkt im Plan, kein Detail.)

---

## Dritte Korrektur an meiner eigenen Arbeit

Bevor der Plan steht, die Recherche, die ihn hätte kippen können. Ich habe für dieses Kapitel gezielt nach direkten Konkurrenten gesucht und drei Dinge gefunden, die in Phase 4 hätten auftauchen müssen:

1. **GitLab hat die Technik 2024 als Open Source veröffentlicht.** Ihr Security-Team scannt die eigenen YouTube-Videos auf Secrets, exakt nach dem Verfahren, das ich vorschlage: Video in Frames zerlegen, OCR, gegen Secret-Muster matchen. ([GitLab Blog](https://about.gitlab.com/blog/how-to-detecting-secrets-in-video/))
2. **PixelHush** versteckt Tokens und Keys im Editor, sobald eine Aufnahme startet — der präventive Ansatz, bereits gebaut.
3. **MaskShot** (Mac App Store) und **PageRedact** decken die statische Screenshot-Seite ab.

**Was das bedeutet — ungeschönt:** Die *Technik* ist öffentlich und kostenlos. Der Gratis-Filter ist damit angekratzt. Was **nicht** existiert, ist das Produkt: GitLabs Lösung ist internes Tooling auf Basis der **Google Cloud Video Intelligence API** — also cloudbasiert, mit GCP-Setup, Minutenpreisen und ohne jede Oberfläche. Für einen Entwickler, der Donnerstag ein Launch-Video veröffentlicht, ist das keine Option.

**Konsequenz für die Strategie:** Der Moat kann nicht technisch-geheim sein. Das erzwingt eine ehrlichere Moat-Antwort, als ich sie sonst gegeben hätte — sie steht unten und sie ist unbequem.

---

# PRODUKT

## Ein-Satz-Definition

**Preflight scannt eine fertige Bildschirmaufnahme lokal auf sichtbare API-Keys, Tokens und Zugangsdaten und zeigt dir jedes betroffene Frame mit Zeitstempel — bevor du das Video veröffentlichst.**

## ICP

**Entwickler und technische Creator, die Bildschirmaufnahmen veröffentlichen.** Konkret sechs Untergruppen:

| Gruppe | Wo sie online sind |
|---|---|
| Indie-Entwickler mit Launch-/Demo-Videos | Product Hunt, Hacker News, X („build in public") |
| DevRel bei Entwickler-Tool-Firmen | X, eigene YouTube-Kanäle, Discord |
| YouTube-Creator im Dev-Education-Bereich | YouTube, Reddit (r/webdev, r/programming) |
| Kursersteller (Egghead-/Frontend-Masters-Format) | eigene Plattformen, X |
| Konferenz-Organisatoren mit Talk-Mitschnitten | GitHub, Konferenz-Discords |
| Agenturen, die Produktvideos für Kunden bauen | LinkedIn (schlechtester Kanal, niedrigste Priorität) |

**Wie viele gibt es?** **[ANNAHME]** — belastbare Zahlen existieren nicht, ich leite über einen Anker ab: Screen Studio erreichte [8.000 Kunden in 9 Monaten](https://www.starterstory.com/screen-studio-breakdown) bei 9–29 $/Monat, als Mac-only Aufnahme-Tool für genau diese Gruppe. Das ist eine belegte Untergrenze für „Mac-Nutzer, die genug Bildschirmvideos veröffentlichen, um dafür zu zahlen". Ich schätze den erreichbaren Markt (Mac, Entwickler, veröffentlicht ≥1 Video/Monat) auf **40.000–150.000 Personen**, Unsicherheitsspanne bewusst breit. Preflight braucht davon 0,7 %, um 1.000 Kunden zu haben.

## Das eine Kern-Feature für v1

**Video-Datei hineinziehen → Liste der Frames mit gefundenen Secrets, jeweils mit Zeitstempel, Vorschaubild, markierter Fundstelle und Secret-Typ.**

Das ist alles. Ein Bildschirm, ein Ablagebereich, eine Ergebnisliste.

## Was v1 explizit NICHT kann

Diese Liste ist der wertvollste Teil des Plans, weil jeder Punkt eine Woche Arbeit ist, die nicht stattfindet:

- **Kein Schwärzen, kein Bearbeiten, kein Export.** Preflight findet, du reparierst im Schnittprogramm oder nimmst neu auf. Damit entfallen Re-Encoding, Qualitätsverlust, Format-Matrix und Codec-Lizenzfragen komplett. Finden ist das schwere Problem; Reparieren ist trivial.
- **Keine Live-Aufnahme, keine Echtzeit.** Genau die Wette, an der die ursprüngliche Idee in Phase 6 gestorben ist.
- **Keine Gesichter, keine allgemeine PII, keine Adressen.** Nur Entwickler-Secrets. Wer Gesichter unkenntlich machen will, ist nicht der Kunde.
- **Kein Windows, kein Linux.** macOS auf Apple Silicon.
- **Keine Cloud, kein Konto, kein Login.** Auch keine Telemetrie — diesmal aber als bewusste Entscheidung mit Kompensation (siehe Kill-Gates: Verkaufszahlen sind das Messinstrument, nicht Nutzungsdaten).
- **Keine CI-Integration, keine Team-Funktionen, kein SSO.** Das ist der Pfad in den Team-Verkauf, den Phase 4 ausgeschlossen hat.
- **Kein Sprachmodell.** Nirgends.

---

# TECHNIK

## Architektur

```
┌─────────────────────────────────────────────────┐
│  Tauri 2 · React 19 · Tailwind 4   (UI)         │  ← aus Vera
├─────────────────────────────────────────────────┤
│  Rust-Kern                                       │
│   ├─ Sidecar-Supervisor                          │  ← aus Vera
│   ├─ Perceptual-Hash-Dedupe (Frames überspringen)│  ← aus Vera
│   └─ ★ Detection-Engine (OCR-fehlertolerant)     │  ← NEU, das ist der Kern
├─────────────────────────────────────────────────┤
│  Swift-Sidecars                                  │
│   ├─ frame-extract  (AVFoundation)               │  ← aus Vera
│   └─ ocr-helper     (Vision Framework)           │  ← aus Vera
├─────────────────────────────────────────────────┤
│  SQLite (Scan-Ergebnisse, lokal)                 │  ← Muster aus Vera
├─────────────────────────────────────────────────┤
│  Signierung · Notarization · DMG · Updater       │  ← aus Vera, komplett
└─────────────────────────────────────────────────┘
Netzwerkzugriffe: keine. Ausnahme: Update-Check.
```

**Begründung jeder Wahl:**

- **Tauri statt nativem SwiftUI:** Nicht weil es besser ist, sondern weil die komplette Auslieferungskette (Signierung, Notarization, DMG-Layout, Minisign-Updater, GitHub-Workflow) bereits funktioniert und getestet ausgeliefert wurde. Ein Wechsel auf SwiftUI würde 8–12 Tage kosten und null Kundenwert erzeugen.
- **Swift-Sidecars statt Rust-Bibliotheken:** Apples Vision-Framework ist bei OCR schneller und genauer als Tesseract und läuft auf der Neural Engine. AVFoundation ist der einzige verlässliche Weg, Frames aus beliebigen macOS-Videoformaten zu ziehen. Beide sind nur über Swift/ObjC erreichbar — die FFI-Brücke existiert bereits.
- **Detection-Engine in Rust:** Sie ist der einzige Teil, der wirklich neu ist, muss testbar und schnell sein und wird das einzige Stück Code, das über Jahre wächst.
- **SQLite:** Nur für Scan-Ergebnisse und Wiederaufnahme abgebrochener Scans. **Diesmal mit einer einzigen Zugriffsschicht** — der Fehler aus Phase 1, Abschnitt 1.2 (drei Schema-Wahrheiten), wird nicht wiederholt.
- **Kein Netzwerk:** Das ist bei einem Sicherheitsprodukt kein Marketing, sondern eine Anforderung. Ein Werkzeug, das nach Secrets sucht, darf nichts senden.

## Wiederverwendung aus Vera, mit Zeitersparnis

| Baustein | Herkunft | Gesparte Tage |
|---|---|---|
| Signierung, Notarization, DMG, Minisign-Updater, Release-Skript, GH-Workflow | `scripts/release-mac.sh`, `MACOS-SIGNING.md`, `.github/workflows/`, `tauri.conf.json` | **8–12** |
| Vision-OCR-Sidecar | `src-tauri/src/tracker-ocr.swift` (199 LOC) | **2–3** |
| Frame-Extraktion aus Video (AVFoundation) | `src-tauri/src/frame-extract.swift` (61 LOC) | **2** |
| Perceptual-Hash-Dedupe | aus `frame-capture.swift` | **1–2** |
| Tauri↔Swift-Sidecar-Supervisor (Lifecycle, JSON-Line-Protokoll, SIGTERM) | `lib.rs` | **2–3** |
| Secret-Muster (Regex + Entropie + Luhn) — **eine** Implementierung statt drei, mit Tests | `lib.rs:288–328`, `frame-capture.swift:694–753` | **1–2** |
| Tauri + React + Tailwind + Updater-UI-Gerüst | `src/`, `package.json` | **2** |
| **Summe** | | **18–26 Tage** |

Das ist deutlich mehr als die 9–14 Tage aus Phase 1 — und der Grund ist das stärkste Argument für genau dieses Produkt:

> **Preflight benutzt praktisch 100 % der wertvollen 15 % von Vera und 0 % der wertlosen 85 %.** Nichts aus `db.ts`, `agents.ts`, `retrieval.ts`, `Settings.tsx` oder dem React-UI wird gebraucht. Kein anderes Konzept aus Phase 3 hat dieses Verhältnis.

Bei 12 h/Woche entsprechen 18–26 gesparte Personentage rund **3–4 Monaten Vorsprung**.

## Was NICHT übernommen wird — die Altlasten aus Phase 1

Explizit, damit die Sicherheitsfunde nicht mitwandern:

- **Kein Klartext-Secret in SQLite** (F-1). Preflight speichert gefundene Secrets **gar nicht** — nur Frame-Nummer, Zeitstempel, Secret-*Typ* und Bounding-Box. Der Fund selbst wird nie persistiert. Das ist gleichzeitig ein Verkaufsargument.
- **Keine Kommandos mit beliebigen Pfaden** (F-2). Dateizugriff ausschließlich über `NSOpenPanel`/Drag-and-Drop.
- **CSP wird gesetzt**, nicht `null` (F-6).
- **Keine Klartext-Reste im Temp-Verzeichnis** (F-3). Extrahierte Frames leben im Speicher oder werden nach dem Scan garantiert gelöscht.
- **Die dreifach divergierende Redaction wird auf eine Implementierung konsolidiert** — in Rust, mit einer Testsuite. Das ist keine Aufräumarbeit, das ist das Kernprodukt.

## Die drei größten technischen Risiken und ihr Test in Woche 1

Alle drei sind messbar, **bevor** eine Zeile Produktcode geschrieben ist. Das ist der Sinn von Woche 1.

**R1 — Liest Vision-OCR überhaupt zuverlässig Code-Text vom Bildschirm?**
Ein 12px-Monospace-Token in einem dunklen Terminal ist ein anderes OCR-Problem als ein Dokumentenscan. Wenn die Erkennung hier versagt, ist das Produkt unmöglich.
*Test:* Ein 3-Minuten-Screencast mit **20 gepflanzten Secrets** in variierenden Bedingungen — VS Code hell/dunkel, iTerm, Safari-DevTools, 12/14/16px, 1080p und 4K. Vision-OCR drüberlaufen lassen, zählen, wie viele Secrets als lesbarer Text herauskommen.
*Zielwert:* **≥ 90 % lesbar.** Unter 75 % ist das Produkt tot.

**R2 — Wie viele Fehlalarme?**
Commit-Hashes, UUIDs, Base64-Blobs, Minified-JS und Sourcemaps sehen für einen Entropie-Detektor aus wie Secrets. Ein Werkzeug, das bei jedem Git-Log anschlägt, wird nach dem zweiten Scan deinstalliert.
*Test:* Detektor über **30 Minuten echte, öffentliche Screencasts ohne gepflanzte Secrets** laufen lassen (eigene Aufnahmen plus frei verfügbare Konferenz-Talks). Fehlalarme zählen.
*Zielwert:* **< 1 Fehlalarm pro 10 Minuten Video.**

**R3 — Ist der Scan schnell genug, um im Arbeitsablauf zu bleiben?**
Ein 10-Minuten-Video bei 1 fps sind 600 Frames × OCR. Dauert das 20 Minuten, benutzt es niemand vor dem Hochladen.
*Test:* Vision-OCR-Durchsatz auf Apple Silicon für 1080p- und 4K-Frames messen, mit Perceptual-Hash-Dedupe (bei Screencasts sind die meisten Frames nahezu identisch — der Dedupe sollte 70–90 % der OCR-Aufrufe einsparen).
*Zielwert:* **10-Minuten-Video in < 90 Sekunden.**

## Plattform- und Berechtigungshürden — mit Vorlaufzeit

**Die gute Nachricht, und sie ist strategisch bedeutend:** Preflight braucht **keine einzige heikle macOS-Berechtigung.** Kein Screen-Recording (das ist der TCC-Dialog, an dem Vera Nutzer verloren hat), kein Accessibility, kein Full Disk Access, kein Automation. Die App liest eine Datei, die der Nutzer selbst auswählt — dafür genügt `NSOpenPanel`, sogar in der Sandbox, ohne Entitlement. Der Weg vom Download zum ersten Ergebnis ist: DMG öffnen, App ziehen, Video hineinziehen. **Null Systemdialoge.**

| Hürde | Status | Vorlaufzeit |
|---|---|---|
| **Apple Developer Program** | ⚠️ **Kritischer Pfad.** Erik ist minderjährig und kann das Program License Agreement rechtlich nicht selbst schließen — Apple verlangt Volljährigkeit. Der Account **muss** auf die Lokenberg Capital GmbH laufen. | **Organisations-Account braucht eine D-U-N-S-Nummer: 5–14 Werktage** (kostenlos bei Dun & Bradstreet). Falls Veras Zertifikat auf einem privaten Account liegt, ist die Migration ein echtes Projekt. **Woche 1, Punkt 1.** |
| Program-Gebühr | 99 $/Jahr | sofort, sofern Account steht |
| Signierung + Notarization | Pipeline existiert und hat funktionierende DMGs produziert | Minuten pro Build |
| **Mac App Store** | **Bewusst nicht für v1.** 30 %/15 % Provision, App-Review-Latenz, und die Sandbox erschwert das Lesen beliebiger Dateipfade. Direktvertrieb per DMG ist bereits gelöst. | entfällt |
| Impressum / DDG | ❌ **Fehlt heute auf vera-sandy.vercel.app.** In Deutschland abmahnfähig. Muss GmbH, Geschäftsführer, Registernummer und USt-IdNr. nennen. | 1 Stunde, Woche 1 |
| Lizenzschlüssel-Prüfung | Ed25519-signierter Offline-Schlüssel, keine Server-Kommunikation | 1 Tag |

---

# GESCHÄFT

## Pricing mit Herleitung

**Was ist die Alternative des Kunden und was kostet sie ihn?**

| Alternative | Reale Kosten |
|---|---|
| **Video selbst durchsehen** | Ein 10-Minuten-Video kostet 10 Minuten Sichtung — und Menschen übersehen genau das, wonach sie suchen. GitLab hat es deshalb automatisiert. Bei 4 Videos/Monat sind das **40 Minuten monatlich**, schlecht ausgeführt. |
| **Nicht prüfen und leaken** | **[ANNAHME]** Kosten eines geleakten Keys: Rotation, Incident, im schlimmsten Fall Missbrauchsrechnung. Spanne **200–2.000 €**; Wahrscheinlichkeit pro ungeprüftem Video grob **0,5–2 %**. Erwartungswert je Video also **1–40 €** — sehr breite Spanne, aber die Untergrenze allein rechtfertigt schon den Preis. |
| **GitLabs OSS-Ansatz nachbauen** | Kostenlos, aber: GCP-Projekt, Video-Intelligence-API mit Minutenpreisen, Python-Pipeline, kein UI. Realistisch **3–6 Stunden Einrichtung** plus laufende Cloud-Kosten plus das eigene Video in Googles Cloud. |

**Preisanker im Nachbarmarkt:** CleanShot X 29 $ einmalig · MacWhisper 59 € einmalig · Screen Studio 9–29 $/Monat · Superwhisper 249 $ Lifetime.

**Entscheidung: 39 € einmalig, unbefristete Lizenz mit 12 Monaten Updates. Danach optional 19 €/Jahr für weitere Updates.**

Begründung im Einzelnen:
- **Über CleanShots 29 €**, weil der Einsatz höher ist — ein übersehener Key kostet mehr als ein umständlicher Screenshot.
- **Unter MacWhispers 59 €**, weil Preflight schmaler ist und episodisch benutzt wird.
- **Einmalkauf statt Abo**, weil das Werkzeug episodisch benutzt wird (beim Veröffentlichen, nicht täglich). Ein Abo auf episodische Nutzung erzeugt hohe Kündigungsraten und damit Rückgewinnungsarbeit — genau das, was 12 h/Woche nicht verträgt.
- **Der Update-Anschluss (19 €/Jahr) ist die ehrliche Quelle wiederkehrenden Umsatzes** — das Sketch-/JetBrains-Modell. Self-Serve, kein Vertrieb, individuelle Käufer. **[ANNAHME]** Verlängerungsrate 40–60 %.
- **Kein Gratis-Tarif.** Stattdessen: **die ersten 3 Minuten jedes Videos werden kostenlos gescannt.** Das beweist den Wert am echten eigenen Material und ist eine natürliche, ehrliche Grenze statt einer künstlichen Funktionssperre.

## Unit Economics

| Position | Wert |
|---|---|
| Grenzkosten pro Kunde | **≈ 0 €** — keine Server, keine Inferenz, keine Cloud. Auslieferung über GitHub Releases / Vercel-Free-Tier. |
| Zahlungsabwicklung (Lemon Squeezy, 5 % + 0,50 $) | 1,95 € + ~0,46 € = **2,41 €** pro 39-€-Verkauf |
| **Bruttomarge** | **≈ 94 %** |
| Fixkosten p. a. | Apple Developer Program 99 $ (~92 €) + Domain ~12 € + Hosting 0 € = **~104 €/Jahr ≈ 8,70 €/Monat** |
| **Break-even** | **3 Verkäufe pro Jahr.** Ab Verkauf Nr. 3 ist alles Deckungsbeitrag. |
| **Kapitalbedarf zum Start** | **~104 €** — deutlich unter dem 500-€-Constraint ✓ |

## Umsatzpfad — und was jeweils bricht

| Stufe | Umsatz | Was auf dem Weg dorthin bricht |
|---|---|---|
| **10 Kunden** | 390 € einmalig | Nichts Strukturelles. Zehn Kunden kommen aus persönlicher Ansprache (siehe GTM) und beweisen nur, dass das Produkt funktioniert — nicht, dass es einen Markt gibt. **Verwechsle das nicht mit Traktion.** |
| **100 Kunden** | 3.900 € einmalig | **Hängt vollständig am Launch.** Fällt der HN-Post durch, gibt es keinen zweiten Versuch mit derselben Geschichte. Hier bricht: die Annahme, dass ein Kanal reicht. |
| **1.000 Kunden** | 39.000 € einmalig + ab Jahr 2 rund **7.600–11.400 €/Jahr** wiederkehrend aus Update-Verlängerungen (bei 40–60 % Rate) | **Hier bricht das Preismodell.** Einmalzahlung heißt: Umsatz ist eine reine Funktion von Neukunden. Nach dem Launch-Peak fällt er auf nahe null, wenn kein wiederholbarer Kanal existiert. **Das ist die zentrale offene Frage dieses Plans, keine gelöste.** Kill-Gate 3 in Woche 13 testet genau sie. |

Ich behaupte hier bewusst **keine** saubere MRR-Geschichte. Ein Produkt mit Einmalzahlung, das episodisch benutzt wird, hat keine — und der ehrliche Umgang damit ist, es als Hypothese zu behandeln, die in 90 Tagen widerlegt werden kann.

## Rechtliche Struktur mit minderjährigem Gründer

Erik ist 15 und in Deutschland nach §§ 106–113 BGB beschränkt geschäftsfähig. Er kann keine Dauerschuldverhältnisse wirksam eingehen. **Jede vertragliche Beziehung läuft über die Lokenberg Capital GmbH, mit einem Elternteil als Geschäftsführer und Unterzeichner.**

| Was | Wie konkret |
|---|---|
| **Verkäufer / Vertragspartei** | Lokenberg Capital GmbH |
| **Zahlungsabwicklung** | **Lemon Squeezy** (seit 2024 Teil von Stripe), Konto auf die GmbH, Elternteil als Kontoinhaber. **5 % + 0,50 $.** Entscheidend: Lemon Squeezy ist **Merchant of Record** — sie sind der rechtliche Verkäufer und übernehmen Umsatzsteuer, EU-OSS-Meldungen und US-Sales-Tax vollständig. Das ist die mit Abstand größte Verwaltungsersparnis und für einen minderjährigen Gründer der Unterschied zwischen machbar und nicht machbar. |
| *Alternative* | Paddle (ebenfalls MoR, reifere Abo-Werkzeuge). Für einen Einmalkauf ist Lemon Squeezy die einfachere Wahl. **Nicht** Stripe direkt — dann läge die Steuerpflicht bei der GmbH. |
| **Apple Developer Program** | Organisations-Account auf die GmbH. **Braucht D-U-N-S-Nummer, 5–14 Werktage Vorlauf.** Kritischer Pfad, Woche 1. |
| **Domain, Hosting** | Auf die GmbH registriert |
| **Impressum + Datenschutzerklärung** | Pflicht nach DDG. GmbH, Geschäftsführer, Handelsregisternummer, USt-IdNr. Fehlt heute bei Vera. |
| **Eriks Rolle** | Entwickler. Umsatz fließt der GmbH zu; die interne Regelung (Taschengeld, Darlehen, spätere Beteiligung) ist eine Familienfrage, keine strukturelle. |
| **Was Erik nie selbst tut** | Verträge unterschreiben, Konten eröffnen, Rechnungen stellen, mit Zahlungsdienstleistern verhandeln. |

---

# GO-TO-MARKET

## Der eine Kanal

**Hacker News.**

Nicht drei, nicht „HN und Product Hunt und Reddit". Einer, und zwar aus drei Gründen: Die Zielgruppe (Entwickler, die Bildschirmvideos veröffentlichen) ist dort überproportional vertreten. Die Geschichte ist HN-nativ — Sicherheit, echte Daten, offene Methodik. Und der Kanal kostet 0 €, was zum Kapital-Constraint passt.

Product Hunt und Reddit sind **Verstärker im Anschluss**, kein zweiter Kanal — sie werden nur bespielt, wenn HN funktioniert hat.

## Die ersten zehn Kunden — und wie Erik sie ohne Cold Call erreicht

**Der Kernmechanismus: Erik scannt ein bereits öffentliches Video der Person und schickt ihr das Ergebnis.** Das ist kein Verkaufsgespräch, das ist ein Geschenk. Es funktioniert in beiden Ausgängen: Ist das Video sauber, ist es eine nette Bestätigung mit einem Produkthinweis. Ist es nicht sauber, ist es die wertvollste E-Mail, die diese Person diesen Monat bekommt.

| # | Wer konkret | Wie gefunden | Kontaktweg |
|---|---|---|---|
| 1–3 | Indie-Entwickler, die in den letzten 90 Tagen auf **Product Hunt** gelauncht haben — jeder PH-Launch hat ein Demo-Video | PH-Archiv, öffentlich | X-DM oder die auf PH hinterlegte Mail, mit dem Scan-Report im Anhang |
| 4–5 | Aktive Mitglieder der **Screen-Studio-Community** (Discord/X), die über Screencast-Workflows sprechen | öffentliche Threads | Antwort im Thread, kein DM-Spam |
| 6–7 | **DevRel-Leute** bei kleinen Entwickler-Tool-Firmen, die regelmäßig Tutorials veröffentlichen | YouTube-Kanäle der Firmen | X, öffentlich, mit Report |
| 8–9 | **Dev-Education-YouTuber** mit 5k–50k Abonnenten (klein genug, um selbst zu antworten) | YouTube-Suche nach „VS Code tutorial", „API tutorial" | Kanal-Kontaktmail |
| 10 | **Konferenz-Organisatoren**, die Talk-Mitschnitte veröffentlichen | GitHub-Orgs von Community-Konferenzen | Issue oder Mail |

**Ethische Leitplanke, nicht verhandelbar und Teil des Produkts:** Wird in einem öffentlichen Video ein *echter, gültiger* Key gefunden, gilt Responsible Disclosure — private Meldung an die betroffene Person, Hinweis auf sofortige Rotation, **niemals** öffentliche Nennung, niemals als Marketingbeleg mit Namen. Verstöße dagegen würden das Produkt in genau der Community verbrennen, die es tragen soll. Aggregierte, anonymisierte Statistiken sind zulässig — das ist exakt, was GitLab publiziert hat.

## Der Launch-Post

- **Plattform:** Hacker News, `Show HN`
- **Titel:** *„Show HN: I scanned 500 public developer demo videos for leaked API keys"*
- **Timing:** Dienstag bis Donnerstag, 14:00–16:00 UTC (08:00–10:00 ET)
- **Kernbotschaft, in dieser Reihenfolge:**
  1. **Der Befund zuerst, das Produkt zuletzt.** HN belohnt Forschung und bestraft Werbung. Der Post führt mit Zahlen: wie viele Videos gescannt, wie viele mit sichtbaren Secrets, welche Typen, welche Apps. Methodik offen, Fehlerraten offen.
  2. **Die Vorarbeit anerkennen:** GitLab hat das Verfahren 2024 veröffentlicht. Das ehrlich zu benennen kostet nichts und kauft Glaubwürdigkeit — auf HN findet es ohnehin jemand.
  3. **Was fehlte:** eine lokale Mac-App, in die man ein Video zieht, statt einer GCP-Pipeline.
  4. **Was noch nicht geht** (die „Was v1 nicht kann"-Liste). Auf HN ist das ein Vertrauenssignal, kein Mangel.
  5. Preis und Download, in den letzten zwei Zeilen.
- **Was der Post nicht enthält:** kein einziger Name eines betroffenen Creators, kein Screenshot mit erkennbarer Quelle.

## Woche 3, wenn der HN-Traffic weg ist

Der Launch-Peak ist ein Ereignis, kein Kanal. Vier Dinge tragen danach — alle sind Nebenprodukte des Launches, keine neue Arbeit:

1. **Der Report als dauerhaftes Artefakt.** „State of Leaked Secrets in Developer Videos", quartalsweise aktualisiert, mit offener Methodik. Das ist ein zitierfähiges Dokument, das über Suchmaschinen und Verlinkungen dauerhaft Besucher bringt. Der Launch-Post ist nur seine erste Ausgabe.
2. **Der öffentliche Benchmark.** Ein offener Testdatensatz für OCR-fehlertolerante Secret-Erkennung mit veröffentlichten Precision-/Recall-Werten. Das ist genau Eriks ENGRAMM-Rigorosität, hier als Marketing-Instrument — und es zwingt jeden Nachahmer, sich öffentlich daran zu messen.
3. **Responsible Disclosures als Mundpropaganda.** Jede privat gemeldete echte Fundstelle erzeugt eine dankbare, oft sehr sichtbare Person. Das skaliert langsam, aber es hört nie auf.
4. **Integrationsgespräche mit Aufnahme-Werkzeugen** (Screen Studio, ScreenFlow, Descript). Preflight konkurriert nicht mit ihnen — es ist der Schritt zwischen „aufnehmen" und „veröffentlichen". Ein Aufnahme-Tool will kein Sicherheitsprodukt sein, weil es die Haftung nicht will; eine Integration ist deutlich wahrscheinlicher als ein Nachbau.

---

# MOAT

Hier gebe ich die unbequeme Antwort, weil die bequeme falsch wäre.

**Was der Moat NICHT ist:** Nicht die Technik. GitLab hat das Verfahren 2024 veröffentlicht. Nicht „bessere Ausführung" — das würde die Idee nach den Regeln der Aufgabenstellung disqualifizieren.

**Was er ist — der einzige belastbare Teil:**

**OCR-fehlertolerante Secret-Erkennung ist ein anderes Problem als jede benachbarte Lösung, und der Vorsprung darin verstärkt sich mit der Nutzung.**

Das ist keine Behauptung, sondern folgt aus der Beschaffenheit der Daten:
- **gitleaks und trufflehog** setzen perfekten Text voraus. Sie prüfen Dateien. Ihre Muster sind exakt.
- **Screenshot-Werkzeuge** (BlurData, MaskShot, Xnapper) schwärzen *Regionen*. Sie müssen nicht wissen, **welcher** String ein Secret ist — nur ungefähr, wo etwas Sensibles liegt. Ein Fehler kostet dort eine zu große schwarze Fläche.
- **Preflight bekommt korrumpierten Text.** OCR liest `sk-proj-Abc1` als `sk-proj-Abcl` oder `sk-pr0j-AbcI`. Damit versagt jedes exakte Regex-Muster, und die Entropie-Berechnung verschiebt sich. Der Detektor muss Secrets erkennen, **die er nie korrekt gelesen hat** — und gleichzeitig Commit-Hashes, UUIDs und Base64-Blobs verwerfen, die genauso aussehen.

Der Vermögenswert ist die wachsende Sammlung: **welche OCR-Verwechslungen bei welcher Schriftart, welchem Farbschema, welcher Auflösung und welcher Anwendung auftreten** — plus jede gemeldete Falsch-Positiv-Meldung. Das ist ein Korpus, kein Algorithmus, und er wächst mit jedem Scan.

**Und jetzt die Einschränkung, die ich nicht wegdiskutiere:**

Dieser Moat wird in **Quartalen gemessen, nicht in Jahren.** Ein entschlossener Wettbewerber mit einem Team baut denselben Korpus in sechs bis zwölf Monaten nach. Bei der Frage aus der Aufgabenstellung — „Warum kann das in 24 Monaten nicht einfach kopiert werden?" — ist meine ehrliche Antwort: **Es kann kopiert werden. Es ist nur unangenehm genug, dass es in den nächsten vier bis sechs Quartalen wahrscheinlich niemand tut, weil der Markt für einen finanzierten Anbieter zu klein ist.**

Das ist ein Positions-Moat („zu klein, um interessant zu sein, groß genug, um einen Einzelnen zu ernähren"), kein Struktur-Moat. Phase 5 hat gezeigt, dass **alle** Kandidaten unter diesen Constraints diese Schwäche teilen — Verteidigbarkeit war bei allen dreien die schlechteste Achse. Ich habe die Suche nicht abgekürzt; der Suchraum gibt unter „kein Kapital, kein Vertrieb, 12 h/Woche" schlicht nichts Besseres her.

**Die richtige strategische Antwort darauf ist Tempo, nicht Selbstbetrug:** schnell zu Umsatz, den Korpus früh aufbauen, den Benchmark öffentlich besetzen — und akzeptieren, dass die 24-Monats-Verteidigbarkeit ungeklärt ist.

---

# 90-TAGE-PLAN

Jede Woche hat ein überprüfbares Ergebnis. Grundlage: 12 h/Woche.

## Block 1 — Machbarkeit (Woche 1–2)

| Woche | Ergebnis |
|---|---|
| **1** | **Parallel, weil der Apple-Pfad Vorlauf hat:** (a) D-U-N-S-Antrag für die GmbH gestellt und Apple-Developer-Organisations-Account beantragt. (b) Domain geprüft und registriert. (c) Testkorpus gebaut: 3-Min-Screencast mit 20 gepflanzten Secrets über Themes/Auflösungen + 30 Min echte, saubere Screencasts. (d) R1 gemessen: Vision-OCR-Trefferquote auf den 20 Secrets. |
| **2** | R2 und R3 gemessen: Fehlalarmrate über die 30 sauberen Minuten, Scan-Durchsatz mit Perceptual-Dedupe. **Ergebnis: eine Tabelle mit drei Zahlen.** |

### 🚦 KILL-GATE 1 — Ende Woche 2 · Technische Machbarkeit

| Metrik | Zielwert |
|---|---|
| OCR-Trefferquote auf gepflanzten Secrets | **≥ 90 %** |
| Fehlalarme | **< 1 pro 10 Min Video** |
| Scandauer für ein 10-Min-Video | **< 90 Sekunden** |

**Verfehlt (eine Metrik unter Ziel, aber OCR ≥ 75 %):** eine Woche Nachbesserung an der Detektions-Heuristik, danach erneut messen. Genau eine Verlängerung, keine zweite.
**Verfehlt (OCR < 75 %):** **Sofortiger Abbruch.** Das Produkt ist physikalisch nicht baubar. Weiter zu Backup #1 in Phase 8. Verbrauchter Einsatz: 24 Stunden und ~104 €. Das ist der Sinn dieses Gates.

## Block 2 — Bauen (Woche 3–7)

| Woche | Ergebnis |
|---|---|
| **3** | Detection-Engine in Rust, **mit Testsuite zuerst** — die konsolidierte Ein-Implementierung, die Vera dreimal falsch hatte. Grün gegen den Testkorpus. |
| **4** | Sidecars angebunden (`frame-extract` + `ocr-helper`), Scan-Pipeline läuft auf der Kommandozeile Ende-zu-Ende. |
| **5** | UI: Ablagebereich, Fortschritt, Ergebnisliste mit Zeitstempel, Vorschaubild, Sprung zur Fundstelle. Ein Fenster. |
| **6** | Lizenzprüfung (Ed25519, offline), 3-Minuten-Gratisgrenze, Lemon-Squeezy-Checkout, Landing Page **mit Impressum**. Signiertes, notarisiertes DMG gebaut und auf einem fremden Mac installiert. |
| **7** | **Die Recherche für den Launch-Post:** 500 öffentliche Developer-Demo-Videos scannen, Ergebnisse aggregieren, alle echten Funde privat melden. Post schreiben. Beta an 10 Personen aus der Erstkundenliste. |

## Block 3 — Launch (Woche 8–9)

| Woche | Ergebnis |
|---|---|
| **8** | **Show HN.** Dienstag–Donnerstag, 14:00 UTC. Den ganzen Tag in den Kommentaren. Alles beheben, was innerhalb von 24 h behebbar ist. |
| **9** | Nachlauf: Product Hunt und die passenden Subreddits **nur wenn HN funktioniert hat**. Verkaufszahlen auswerten. Jede Support-Mail beantworten. |

### 🚦 KILL-GATE 2 — Ende Woche 9 · Nachfrage

| Metrik | Zielwert |
|---|---|
| Zahlende Kunden binnen 14 Tagen nach Launch | **≥ 40** (≈ 1.560 €) |

**≥ 40:** weiter zu Block 4.
**15–39:** **eine** Repositionierung erlaubt — anderer Titel, andere Hauptzielgruppe (z. B. Kursersteller statt Indie-Entwickler), Relaunch in Woche 11. Danach keine weitere.
**< 15:** **Abbruch.** Ein Produkt, das aus einem HN-Frontpage-Peak keine 15 Käufer zu 39 € zieht, hat keinen Markt in dieser Zielgruppe. Kein „weitermachen und hoffen" — Backup #1.

## Block 4 — Wiederholbarkeit (Woche 10–13)

| Woche | Ergebnis |
|---|---|
| **10** | Die drei häufigsten Beschwerden aus dem Launch beheben. Falsch-Positiv-Meldungen in den Korpus einpflegen. |
| **11** | Öffentlicher Benchmark veröffentlicht: Testdatensatz, Methodik, Precision/Recall. Als eigenständiger Post. |
| **12** | Integrationsanfragen an drei Aufnahme-Werkzeuge. Report-Seite als dauerhaftes, aktualisierbares Artefakt aufgesetzt. |
| **13** | Auswertung: Woher kamen die Verkäufe der letzten 30 Tage? Kanal-Zuordnung, so gut es ohne Telemetrie geht (Kaufzeitpunkt, Empfehlungsquelle in der Kaufbestätigung abgefragt). |

### 🚦 KILL-GATE 3 — Ende Woche 13 · Ist es ein Geschäft oder war es ein Ereignis?

| Metrik | Zielwert |
|---|---|
| Verkäufe **in den 30 Tagen nach dem Launch-Peak** (nicht launchgetrieben) | **≥ 15** |
| Davon aus einem Kanal, den Erik **benennen und wiederholen** kann | **≥ 8** |

**Beide erfüllt:** Es ist ein Geschäft. Weiter, Fokus auf den identifizierten Kanal und den Update-Verlängerungspfad.
**≥ 15 Verkäufe, aber < 8 aus einem benennbaren Kanal:** Es verkauft sich, aber Erik weiß nicht warum. Sechs Wochen ausschließlich für Kanal-Attribution, keine neuen Funktionen.
**< 5 Verkäufe:** Der Launch war ein Ereignis, kein Kanal. **Kein Weiterbauen.** Preflight wird eingefroren: es bleibt kaufbar, der Report bleibt online, es kostet ~104 €/Jahr und erzeugt passiv etwas Umsatz — aber es bekommt keine Arbeitsstunde mehr. Weiter zu Backup #1.

---

## Was dieser Plan bewusst nicht verspricht

- **Keine MRR-Geschichte.** Einmalzahlung bei episodischer Nutzung erzeugt keine. Der Update-Verlängerungspfad ist eine Hypothese für Jahr 2, kein Plan für Jahr 1.
- **Keine 24-Monats-Verteidigbarkeit.** Der Moat trägt Quartale. Das steht oben ausformuliert.
- **Keine große Zahl.** 1.000 Kunden sind 39.000 € einmalig. Das ist ein sehr gutes Ergebnis für einen Fünfzehnjährigen mit 12 h/Woche und 104 € Einsatz — und es ist kein Unternehmen, das jemand kauft.

Was der Plan liefert: **ein reales Geschäft mit 94 % Marge, Break-even bei drei Verkäufen, einem Kapitalbedarf von 104 €, drei harten Ausstiegspunkten und einer Antwort in 90 Tagen** — gegen ein Vorgängerprojekt, bei dem nach sieben Wochen nicht einmal feststellbar war, ob es einen einzigen Nutzer gab.

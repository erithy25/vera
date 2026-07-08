# Vera Umbauplan — Vom "lokalen KI-Begleiter" zum Abrechnungs-Copiloten

Stand: Juli 2026. Dieses Dokument ist die strategische Grundlage für den Umbau.
Wir bauen in Schichten (siehe unten); jede Schicht wird einzeln umgesetzt und
abgenommen, bevor die nächste beginnt.

---

## 1. Warum der Umbau — die Friedhofs-Analyse

### Gescheiterte / verschwundene Modelle und ihre Todesursache

| Wer | Was passierte | Lektion für uns |
|---|---|---|
| **Rewind AI** ($350M Bewertung) | Pivot zu Limitless (Hardware), Dez. 2025 von Meta gekauft, App am 19.12.2025 abgeschaltet | Horizontales "Screen-Memory" hat keinen täglichen Nutzungsanker → keine Retention → kein Abo. Und: Der Privacy-Vertrauensbruch (Meta) hat die Nutzerbasis verbrannt — es gibt jetzt heimatlose, privacy-sensible Ex-Rewind-Nutzer. |
| **Passive Zeiterfassung 1.0** (WiseTime-Generation, Chrometa etc.) | Nur 10–15 % Adoption in Kanzleien, die es einführten (ABA Journal) | Aktivität *erfassen* reicht nicht. Wenn das Tool keine **fertigen, einreichbaren Einträge samt Beschreibung** erzeugt, ist der Review-Aufwand höher als manuelle Erfassung. Das Produkt muss den Eintrag schreiben, nicht nur die Daten liefern. |
| **Microsoft Recall** | Massiver öffentlicher Backlash, mehrfach verschoben, nur mit Opt-in + Abschottung tragbar | "Zeichnet deinen Bildschirm auf" ist als Consumer-Botschaft toxisch. Die Botschaft muss das *Ergebnis* sein (Geld, Zeit), nicht der Mechanismus. Privacy-Architektur muss beweisbar sein, nicht behauptet. |

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
DB + lokales LLM (Ollama) bereits existieren. Und sie hat regulatorischen
Rückenwind: BRAK-Leitlinien (Dez. 2024) empfehlen, nur anonymisierte Eingaben
an Cloud-KI zu geben; § 203 StGB (Mandatsgeheimnis) und DSGVO machen
Cloud-Verarbeitung von Mandats-/Klientendaten für Anwälte, Steuerberater und
viele Berater zum Compliance-Risiko. On-Device ist hier kein Feature, sondern
Kaufvoraussetzung — und für Cloud-Anbieter strukturell nicht kopierbar.

---

## 2. Die neue Positionierung

> **Vera holt Abrechnern verlorene Stunden zurück — und kein Byte verlässt je
> das Gerät.**
>
> Vera rekonstruiert deinen Arbeitstag inhaltlich (nicht nur "war in Chrome"),
> ordnet Blöcke Kunden/Projekten/Mandaten zu, schreibt abrechnungsfertige
> Leistungsbeschreibungen und übergibt sie per Klick an dein
> Abrechnungssystem. Alles lokal, verschlüsselt, DSGVO-nativ.

**Zielkunde (Beachhead, Phase Mac):** Selbstständige und kleine Teams, die
nach Zeit abrechnen und auf Mac arbeiten — Agenturen, Design-/Dev-Studios,
Consultants, Freelancer (DACH + englischsprachig). Zahlungsbereitschaft hoch,
weil jede wiedergefundene Stunde direkt Umsatz ist.

**Zielkunde (Skalierung, Phase Windows):** Deutsche Anwälte und Steuerberater
(RA-MICRO/DATEV-Welt, fast ausschließlich Windows). Größter Schmerz, höchste
Zahlungsbereitschaft, stärkstes On-Device-Argument — aber erst erreichbar,
wenn die Capture-Schicht auf Windows portiert ist. Bewusst Phase 2.

**North-Star-Metrik:** bestätigte abrechenbare Minuten pro Nutzer pro Woche.
Sekundär: Anteil der Tage mit abgeschlossenem Tages-Review ("Daily Close").

**Der Retention-Anker** (Anti-Rewind-Design): Es gibt einen Grund, die App
*täglich* zu öffnen (3-Minuten-Tagesabschluss = Geld) und *wöchentlich* einen
Beweis des Werts (Report: "Diese Woche X Stunden / Y € zurückgeholt").

---

## 3. Was aus dem Bestand wird

| Bestand | Entscheidung |
|---|---|
| Capture-Pipeline (tracker.m, frame-capture.swift, tracker-ocr.swift) | **Fundament.** Bleibt, wird zur Session-Erfassung ausgebaut. |
| Verschlüsselte SQLite-DB (vault.m, db.ts) | **Fundament.** Schema wird um Kunden/Projekte/Blöcke/Einträge erweitert. |
| Ollama-Anbindung (ollama.ts, engine.ts) | **Fundament.** Wird Zuordnungs- + Formulierungs-Motor. |
| Retrieval (retrieval.ts, textSimilarity.ts) | Bleibt als interner Baustein (Zuordnung, Suche im Review). |
| Timeline (Timeline.tsx) | **Umgebaut** zur Tagesansicht mit Zeitblöcken. |
| Dashboard/TodayCard/TopAppsCard | **Umgebaut** zu Auslastung/Umsatz-Sicht. |
| Agenten Planner/Writer/Researcher/Coach, AgentChat | **Eingefroren/entfernt.** Verwässern die Positionierung. Der "Writer" geht konzeptionell im Leistungsbeschreibungs-Generator auf. |
| Goals | **Umgewidmet** zu Auslastungs-/Umsatzzielen (später) oder entfernt. |
| Knowledge / NotesComposer | **Eingefroren.** Kein Teil des Kernprodukts. |
| website/ | **Umgebaut** auf neue Positionierung + Warteliste (Schicht 0). |

**Anti-Scope (bauen wir NICHT):** generischer KI-Chat, Coach/Wellness,
Wissensmanagement, Cloud-Sync in v1, Mobile-App, Team-Überwachungsfeatures
(Mitarbeiter-Monitoring ist Gift für die Marke — Datenhoheit bleibt immer
beim Einzelnen).

---

## 4. Der Schichtenplan

Jede Schicht ist einzeln shippbar und hat ein klares Abnahmekriterium.
Reihenfolge ist verbindlich; wir beginnen erst nach Freigabe der vorherigen
Schicht mit der nächsten.

### Schicht 0 — Validierung & Schärfung (kein Produktcode)
- 10–15 Interviews mit Zielkunden (Agentur-/Studio-Inhaber, Consultants auf
  Mac; zusätzlich 3–5 Anwälte für Phase-2-Validierung). Eine Kernfrage: "Wie
  erfasst du heute deine Zeit, und was entgeht dir dadurch — in Euro?"
- Landingpage im website/-Ordner auf neue Positionierung umbauen, Warteliste
  mit E-Mail-Erfassung, 2 Varianten der Botschaft testen (Geld vs. Privacy).
- Preis-Hypothese: Solo €19/Monat, Pro €29 (Integrationen), Kanzlei €49
  (Phase 2). Im Interview gegentesten.
- **Abnahme / Kill-Kriterium:** Mind. 8 von 15 Interviews zeigen benennbaren
  Schmerz mit Betrag UND mind. 5 würden einen Beta-Zugang mit Kreditkarte
  reservieren. Sonst: Positionierung nachschärfen, nicht bauen.

### Schicht 1 — Vom Gedächtnis zum Arbeitstag (Fundament-Umbau)
- Session-Engine: kontinuierliche Frames (App, Fenster, OCR-Text, URL) zu
  lückenlosen **Arbeitsblöcken** segmentieren (App-/Kontextwechsel, Pausen,
  Idle-Erkennung).
- Datenmodell: Kunden/Projekte/Mandate als Entitäten, Blöcke mit Start/Ende,
  Quell-Frames referenziert, alles in der bestehenden verschlüsselten DB.
- Privacy-Kontrollen als Produktfeature: App-Blockliste, Privat-Modus
  (Pause), Inkognito-Fenster nie erfassen, Auto-Löschung der Roh-Frames nach
  konfigurierbarer Frist (Blöcke bleiben, Rohdaten verschwinden).
- Neue Hauptansicht "Mein Tag": Zeitblöcke statt Frame-Timeline.
- **Abnahme:** Ein voller Arbeitstag erscheint als lückenlose, plausible
  Blockfolge; Privacy-Kontrollen wirksam; Bestandsnutzer-Migration ok.

### Schicht 2 — Der Zuordnungs-Motor
- Zuordnung von Blöcken zu Kunde/Projekt: erst deterministische Regeln
  (Fenstertitel, Domains, Pfade, Kalender), dann lokale LLM-Klassifikation
  über den OCR-Inhalt, mit Konfidenz-Anzeige.
- Lernschleife: jede manuelle Korrektur wird zur Regel bzw. zum Few-Shot-
  Beispiel — das Tool wird pro Nutzer täglich besser (Wechselkosten!).
- **Abnahme:** Nach 2 Wochen Nutzung sind ≥80 % der Blöcke korrekt
  vor-zugeordnet (gemessen an Korrekturen).

### Schicht 3 — Der Leistungsbeschreibungs-Generator (Herzstück)
- Lokales LLM formuliert pro Block/Tag abrechnungsfertige
  Leistungsbeschreibungen (DE/EN), Ton und Detailgrad konfigurierbar,
  Branchen-Vorlagen (Agentur, Beratung, Kanzlei).
- Täglicher 3-Minuten-Review: bestätigen / bearbeiten / zusammenführen /
  verwerfen. Tagesabschluss-Flow mit Fortschritt.
- Das ist die direkte Antwort auf das 10–15 %-Adoptionsproblem der
  WiseTime-Generation: Vera liefert fertige Einträge, keine Rohdaten.
- **Abnahme:** Tagesabschluss in <5 Minuten; ≥70 % der generierten
  Beschreibungen ohne Bearbeitung übernehmbar.

### Schicht 4 — Export & Integrationen (der Graben)
- Stufe 1: CSV/Excel-Export in gängigen Abrechnungsformaten.
- Stufe 2: Direkt-Integrationen nach Nachfrage aus Schicht-0-Interviews —
  Kandidaten: Toggl, Harvest, Moco, awork (Agenturen); Clio (EN-Kanzleien);
  Rechnungs-Tools (Lexoffice/sevDesk) für Freelancer.
- Jede Integration = Verkaufsargument + Wechselkosten + SEO-Landingpage.
- **Abnahme:** Ein-Klick-Übergabe eines Abrechnungsmonats in mind. 2 externe
  Systeme, von echten Beta-Nutzern produktiv genutzt.

### Schicht 5 — Der Geld-Report (Retention-Anker)
- Wochenreport: zurückgeholte Stunden/€ (Blöcke, die ohne Vera nicht erfasst
  worden wären), Auslastung, unabgerechnete Zeit, Trend.
- Onboarding auf "Time-to-Wow" getrimmt: innerhalb der ersten 24 h zeigt
  Vera den ersten vergessenen abrechenbaren Block ("Diese 47 Minuten für
  Kunde X hättest du vergessen — das sind 94 €").
- **Abnahme:** Beta-Nutzer teilen den Report unaufgefordert / bestätigen ihn
  als Haupt-Verbleibsgrund (qualitativ abgefragt).

### Schicht 6 — Monetarisierung & Go-to-Market
- Lizenz/Abo-Infrastruktur (Paddle oder Lemon Squeezy — übernehmen
  EU-Steuerabwicklung), 14-Tage-Trial mit laufendem "gefundenes Geld"-Zähler.
- Pricing gemäß Schicht-0-Erkenntnissen (Startpunkt: €19/€29/€49 pro Sitz).
- Distribution: SEO auf Vergleichs-Keywords ("Memtime Alternative",
  "Rewind Alternative", "automatische Zeiterfassung Agentur"), die
  Ex-Rewind-Nutzerschaft gezielt ansprechen (Privacy-Story!), Communities,
  LinkedIn-Content mit Report-Screenshots, Partnerprogramm mit
  Agentursoftware-Anbietern.
- **Abnahme:** 100 zahlende Nutzer; Ziel-Marke €10k MRR; Churn <5 %/Monat.

### Schicht 7 — Vertical Kanzlei + Windows (die Skalierungsstufe)
- Windows-Capture-Schicht (Tauri ist cross-platform; native Erfassung neu zu
  bauen), damit die RA-MICRO/DATEV-Welt erreichbar wird.
- Kanzlei-Edition: DATEV-/RA-MICRO-kompatible Exporte, RVG-/Stundensatz-
  Logik, Mandats-Terminologie, BRAK-konforme Kommunikation ("On-Device statt
  Anonymisierungs-Akrobatik").
- Preisstufe €49+/Sitz. Vertrieb über Kanzlei-Netzwerke, Legal-Tech-Messen,
  Steuerberater-Foren.
- **Abnahme:** 10 zahlende Kanzleien/Steuerberater als Referenzkunden.

### Schicht 8 — Team-Ebene & Verteidigung
- Multi-Seat mit Admin-Sicht nur auf aggregierte, freigegebene Daten
  (explizit kein Monitoring — Datenhoheit beim Einzelnen als Markenkern).
- Optional: feinjustiertes kleines lokales Modell für
  Leistungsbeschreibungen (in der App ausgeliefert) als technischer Graben.
- Sicherheits-Nachweise für größere Kunden (Pentest-Report, später ISO/SOC2).

---

## 5. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| macOS TCC: monatliche Re-Bestätigung der Bildschirmaufnahme | In-App-Erklärflow; prüfen, wie viel über Accessibility-APIs (Fenstertitel, Textextraktion) statt Voll-Capture abbildbar ist; MDM-Profil-Doku für Teams. |
| Apple sherlockt On-Device-Kontext | Vertikalisierung: Abrechnungs-Workflow, Integrationen und Branchensprache sind keine OS-Features. Geschwindigkeit in Schichten 1–4. |
| Memtime/Rize ergänzen Content-Lesen | Unwahrscheinlich kurzfristig (deren Privacy-Marketing verbietet es quasi); unser Vorsprung: lokales LLM-Formulieren + Lernschleife. Tempo entscheidet. |
| Cloud-Player (Ajax etc.) kommen nach DACH | Ihr strukturelles Handicap: Cloud + § 203 StGB/BRAK. Unsere On-Device-Story früh mit Kanzlei-Referenzen zementieren (Schicht 7). |
| LLM-Qualität lokaler Modelle reicht nicht für Beschreibungen | Schicht 3 früh mit echten Nutzern testen; Fallback: kleinere strukturierte Templates + LLM nur für Feinschliff; Modellwahl pro Hardware. |
| Adoptions-Falle (WiseTime-Muster) | Nordstern "Tagesabschluss <5 min, ≥70 % Einträge unbearbeitet übernehmbar" ist hartes Abnahmekriterium von Schicht 3. |
| Solo-Kapazität | Schichten strikt sequenziell, Anti-Scope-Liste durchsetzen, jede Schicht shippt Wert. |

---

## 6. Kill-Kriterien (ehrlich bleiben)

- Schicht 0 verfehlt (kein benennbarer Schmerz mit Betrag) → nicht bauen,
  Positionierung überarbeiten.
- Schicht 3 verfehlt nach 2 Iterationen (Review dauert länger als manuelle
  Erfassung) → Kernhypothese gescheitert; Pivot-Optionen neu bewerten.
- Schicht 6: <30 zahlende Nutzer nach 3 Monaten aktiven Vertriebs →
  Beachhead falsch gewählt; Segment wechseln bevor Windows-Investment.

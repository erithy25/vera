# Phase 6 — Red Team

Top 3: **Ü2 Difftruth (64)**, **Ü3 ShareGuard (64)**, **Ü1 BLACKBOX (58)**.

Meine Rolle hier ist nicht, die Ideen zu prüfen. Sie ist, sie zu erledigen.

**Vorab zwei Korrekturen an meiner eigenen Phase-4-Arbeit.** In Phase 4 habe ich geschrieben, der Redaction-Cluster sei „bei Live-Streams leer". Das ist falsch. Bei der Nachrecherche für dieses Kapitel fand ich [StreamBlur](https://streamblur.com/) („Protect Your Stream from API Key Leaks") sowie mindestens eine [Chrome-Erweiterung für genau den Screen-Sharing-Fall](https://dev.to/razcodev/i-leaked-an-api-key-while-screen-sharing-this-chrome-extension-wouldve-saved-me-fbg). Der Besetzt-Filter hätte ShareGuard in seiner ursprünglichen Form härter treffen müssen. Zweitens habe ich einen relevanten Präzedenzfall übersehen, der die Bewertung in die andere Richtung verschiebt: [Screen Studio](https://www.starterstory.com/screen-studio-breakdown) — Solo-Gründer, bootstrapped, **8.000 Kunden in 9 Monaten**, 9–29 $/Monat, Kunden bei Google, Vercel und Stripe. Beides fließt unten ein.

---

## Ü2 · Difftruth

### 1. Das Argument, das die Idee erledigt

Du verkaufst ein Misstrauens-Werkzeug an den Menschen, der die Ursache des Misstrauens selbst ausgelöst hat.

Wer den Agenten laufen lässt, ist derselbe, der seine Behauptungen prüfen müsste. Das ist keine Absicherung gegenüber einem Dritten, das ist Selbstkontrolle — und für Selbstkontrolle zahlt niemand, weil die kostenlose Alternative („ich führe die Tests einfach selbst aus", drei Sekunden, `npm test`) bereits existiert und exakt so zuverlässig ist. Der ganze Wert von Difftruth kondensiert damit auf Bequemlichkeit, und Bequemlichkeit bei Entwicklern ist der Bereich, in dem der Gratis-Filter alles tötet.

Sobald jemand *anders* die Prüfung braucht — ein Reviewer, ein Team, ein Maintainer — hast du einen Käufer, der nicht der Nutzer ist. Und das ist der Moment, in dem du entweder Team-Verkauf machst (Constraint verletzt) oder an Open-Source-Maintainer verkaufst (die notorisch nichts zahlen).

**Es gibt keine Konfiguration, in der Zahler, Nutzer und Leidtragender dieselbe Person sind.** Das ist ein struktureller Defekt, kein Positionierungsproblem.

### 2. Konkurrenz-Reaktion

Der stärkste Anbieter ist GitHub, und GitHubs Interessenlage ist eindeutig **für** den Bau dieser Funktion: Sie besitzen die CI, sie besitzen die PR-Oberfläche, sie besitzen mit Copilot einen Agenten, dessen Glaubwürdigkeit sie stärken wollen. Ein Häkchen „diese Checks liefen wirklich in Actions" ist für GitHub ein Nachmittag Arbeit an einer Datenbank, die sie ohnehin haben — sie kennen jeden Workflow-Run bereits. **Zeitbedarf: ein Quartal, wenn sie es priorisieren.** Erik überlebt das nicht, weil er auf derselben Plattform steht, die ihn ersetzt.

Anthropic und Cursor haben eine schwächere Motivation, aber auch für sie ist ein signierter Ausführungsnachweis ein Vertrauens-Feature, mit dem man wirbt.

### 3. Schlimmster realistischer Verlauf, Monat 1–12

**M1–2:** Bau der GitHub Action. Funktioniert. **M3:** „Show HN" auf Platz 4, 380 Punkte, 1.900 Installationen in zwei Wochen. Erik hält das für Product-Market-Fit. **M4:** Erste Rechnungen. 11 zahlende Nutzer, 130 € MRR. Der Rest sind OSS-Repos im Gratis-Tier. **M5–6:** Drei Teams fragen an, alle wollen SSO, ein DPA und eine Rechnung auf Firmenanschrift. Erik verbringt fünf Wochenenden mit Papierkram und der Familien-GmbH statt mit Code. **M7:** Ein Kommentar unter einem Blogpost: „Das sind 40 Zeilen in unserer CI." Der Kommentar bekommt mehr Upvotes als der Post. **M8:** GitHub kündigt auf der Universe „Verified Agent Runs" an. Kostenlos. In der PR-Oberfläche. **M9–10:** Installationen stagnieren bei 2.100, MRR bei 340 €, Churn übersteigt Neukunden. **M11:** Erik beantwortet Issues nicht mehr. **M12:** Repo archiviert.

### 4. Der ehrliche Rettungsanker

**Nein.** Ich finde keine Version, die meine eigene Kritik überlebt.

Ich habe drei geprüft und alle verworfen: *Lokales Pre-Commit-Werkzeug* verschiebt nur die Oberfläche, der Zahler-Nutzer-Defekt bleibt. *Verkauf an Maintainer* stößt auf null Zahlungsbereitschaft. *Anbieterneutrale kryptografische Attestierung* ist nicht mehr Difftruth, sondern BLACKBOX — und erbt dessen Käuferproblem.

Der Defekt sitzt in der Fundamentalstruktur: Nutzer, Zahler und Geschädigter fallen nie zusammen. **Difftruth ist tot.**

---

## Ü3 · ShareGuard

### 1. Das Argument, das die Idee erledigt

Du baust ein Sicherheitsprodukt, das in Echtzeit über eine unkontrollierbare Matrix aus Meeting-Apps, macOS-Versionen und Monitorkonfigurationen hinweg **perfekt** sein muss — und du baust es mit 12 Stunden pro Woche.

Ein Passwortmanager, der 97 % der Passwörter speichert, ist nutzlos. Ein Redaction-Tool, das 97 % der Secrets schwärzt, ist **schlimmer als nutzlos**, weil es Sorglosigkeit erzeugt: Der Nutzer teilt seinen Bildschirm jetzt entspannter als vorher, und beim einen Mal, wo die OCR-Box um zwölf Pixel verrutscht, ist der Schaden größer, als er ohne das Produkt je gewesen wäre. Sicherheitsprodukte haben eine asymmetrische Fehlerkostenfunktion, und die verträgt sich nicht mit einem Solo-Entwickler ohne Testmatrix, ohne CI und — laut Phase 1 — ohne einen einzigen Test in seinem letzten Projekt.

Dazu die technische Wette: Um den geteilten Strom zu verändern, musst du dich als virtuelle Anzeigequelle einklinken. Chrome filtert virtuelle Displays in seinem Bildschirm-Picker heraus. Das heißt: **Google Meet, der meistgenutzte Kanal deiner Zielgruppe, funktioniert womöglich gar nicht** — und das erfährst du nach dem Bau, nicht davor.

Und die Kategorie ist nicht leer: [StreamBlur](https://streamblur.com/) existiert bereits.

### 2. Konkurrenz-Reaktion

Zwei Fronten. **Apple** könnte in macOS 28 einen „Sharing Privacy Mode" einbauen — sie haben mit Focus-Modi bereits die halbe Infrastruktur und mit ScreenCaptureKit die andere. Wahrscheinlichkeit mittel, Zeitbedarf 12–18 Monate. **Zoom, Google und Microsoft** können es in ihren Client legen, wo es technisch trivial ist, weil sie den Stream ohnehin besitzen — kein virtuelles Display nötig. Zeitbedarf: zwei Quartale, wenn ein Kunde laut genug ruft.

Am gefährlichsten ist aber der schnellste Gegner: **Xnapper oder CleanShot X**, die die Detektionslogik bereits besitzen und nur den Live-Pfad ergänzen müssten. Zeitbedarf: ein Quartal. Erik überlebt eine Apple-Reaktion (18 Monate reichen für Umsatz), aber nicht die CleanShot-Reaktion.

### 3. Schlimmster realistischer Verlauf, Monat 1–12

Steht in Phase 5 und ich halte ihn unverändert: Woche 3 bringt den Chrome-Picker-Befund, es folgen drei Wochen Workarounds pro Plattform, jedes macOS-Update bricht einen. Launch mit 41 Verkäufen à 29 €. Dann die Support-Matrix: andere Meeting-App, externer Monitor, andere Skalierung, OCR-Box verrutscht, Passwort halb sichtbar. Ein Nutzer twittert den Screenshot. Version zurückgezogen. Bei 12 h/Woche keine Chance, die Matrix je abzudecken.

### 4. Der ehrliche Rettungsanker

**Ja — und er ist deutlich stärker als das Original.** Er entsteht, indem man exakt die drei Dinge streicht, die es töten: Echtzeit, Stream-Manipulation und die App-Matrix.

**Die überlebende Version: ein Werkzeug, das eine fertige Bildschirmaufnahme scannt und jedes Frame mit einem Secret meldet, bevor das Video veröffentlicht wird.**

Warum das jede einzelne meiner Kritiken entkräftet:

- **Kein virtuelles Display, keine Meeting-App-Matrix, keine Latenz.** Es liest eine Videodatei. Das eliminiert die gesamte technische Wette und den Chrome-Picker-Befund.
- **Die Fehlerkostenfunktion kehrt sich um.** Es verändert nichts und verspricht keine Unfehlbarkeit — es zeigt dir Frame 4:12 mit einem markierten Token und du entscheidest. Ein übersehener Treffer ist so schlimm wie kein Werkzeug, nicht schlimmer. Falsch-Positive kosten drei Sekunden statt eines Leaks. Das ist der entscheidende Unterschied zum Live-Ansatz.
- **Der Schmerz wird von latent zu akut und wiederkehrend.** Nicht „falls ich mal etwas leake", sondern „ich veröffentliche Donnerstag ein Demo-Video und muss es vorher prüfen". Jedes Video, jedes Mal.
- **Die Zielgruppe ist erreichbar und zahlt bereits.** Entwickler, die Demos, Screencasts, Tutorials und Launch-Videos veröffentlichen — auf HN, Product Hunt, YouTube und Twitch. Präzedenzfall direkt daneben: **Screen Studio, Solo-Gründer, bootstrapped, 8.000 Kunden in 9 Monaten, 9–29 $/Monat.** Dieselben Leute, derselbe Kanal, derselbe Preispunkt.
- **Es konkurriert nicht mit Screen Studio, es ergänzt es.** Damit fällt der gefährlichste Sherlock-Pfad weg: Ein Aufnahme-Werkzeug will kein Sicherheitsprodukt sein, weil es die Haftung nicht will. Eine Integration ist wahrscheinlicher als ein Nachbau.
- **Parität-Test perfekt bestanden:** kein Sprachmodell nötig, nur OCR plus Regex plus Entropie. Deterministisch, prüfbar in Sekunden.

Was ich **nicht** wegdiskutiere: Der Moat bleibt schwach. Die Marktgröße ist kleiner als beim Live-Ansatz. Und es bleibt ein Ein-Zweck-Werkzeug.

**ShareGuard in seiner ursprünglichen Form ist tot. Die Post-Processing-Variante lebt.**

---

## Ü1 · BLACKBOX

### 1. Das Argument, das die Idee erledigt

Kryptografische Nicht-Abstreitbarkeit ist eine Antwort auf eine Frage, die dein Käufer nicht stellt.

Nicht-Abstreitbarkeit ist nur dort wertvoll, wo ein **Gegner** existiert, der bestreiten könnte, und eine **Instanz**, vor der man den Beweis vorlegt. Bei einem Entwickler, der Claude Code auf seinem eigenen Repository laufen lässt, gibt es weder das eine noch das andere. Er will Einsicht, nicht Beweiskraft — und Einsicht bekommt er kostenlos, im Transcript, das das Werkzeug ohnehin anzeigt.

Es gibt genau einen Kontext, in dem die Beweiskraft einen Preis hat: Regulierung und Haftung. Das ist der EU AI Act mit Pflichten ab dem 02.08.2026. Und dieser Käufer ist eine Compliance-Abteilung, die SOC-2-Fragebögen, ein DPA, eine Rechtsform, ein Sicherheitsaudit und einen erreichbaren Ansprechpartner verlangt — also **exakt der Enterprise-Zyklus, den die Aufgabenstellung als harten Constraint ausschließt**, betrieben von einem Fünfzehnjährigen mit 12 Stunden pro Woche über die GmbH seiner Eltern.

Die Idee ist nicht falsch. Sie ist für **diesen** Gründer unter **diesen** Constraints falsch, und das ist ein härteres Urteil, weil es sich nicht durch bessere Ausführung beheben lässt.

### 2. Konkurrenz-Reaktion

Anders als bei Ü2 und Ü3 ist die Reaktion **kein** Problem — das ist die Ironie. Kein Agentenanbieter wird einen anbieterneutralen, gegen sich selbst gerichteten Auditnachweis bauen; die Counter-Position ist echt. Die Observability-Anbieter (Braintrust, LangSmith, Helicone, Datadog) bewegen sich nicht in Richtung Manipulationssicherheit, weil ihre Kunden es nicht verlangen.

**Und genau das ist das Todesurteil, nicht die Rettung.** Eine Nische, in die kein finanzierter Anbieter eindringt, obwohl alle sie sehen könnten, ist meistens keine geschützte Nische — sondern eine, in der kein Geld liegt. Wenn Datadog eine Compliance-getriebene Audit-Anforderung mit hartem Stichtag als lukrativ einschätzen würde, wäre Datadog längst dort.

### 3. Schlimmster realistischer Verlauf, Monat 1–12

**M1–3:** Der Bau macht Spaß, das Ergebnis ist elegant — Merkle-Inklusionsbeweise, Verifier in Rust, alles korrekt. **M4:** „Show HN", 220 Punkte, viel echte Bewunderung, und in jedem zweiten Kommentar dieselbe Frage in anderen Worten: „Cool. Aber wem beweise ich das?" **M5:** 900 Stars, null Umsatz. **M6–8:** Zwei Compliance-getriebene Anfragen. Erik füllt zwei Fragebögen über die Familien-GmbH aus, vier Wochen pro Stück, für Deals à 2.000 €. Einer davon bricht ab, weil der Einkauf keinen Lieferanten ohne Sicherheitsaudit freigibt. **M9–11:** Erik baut Features, die niemand angefragt hat, weil Bauen angenehmer ist als die unbeantwortbare Frage. **M12:** 1.400 Stars, drei zahlende Kunden, 180 € MRR — und damit dasselbe Ergebnis wie Vera, nur mit besserer Kryptografie.

### 4. Der ehrliche Rettungsanker

**Nein, nicht als Unternehmen.**

Ich habe zwei Versionen geprüft. *Nachweis für OSS-Maintainer bei AI-PRs*: die Zielgruppe zahlt nicht, das ist empirisch geklärt. *Nachweis als Feature innerhalb eines größeren Werkzeugs*: dann ist BLACKBOX kein Produkt, sondern eine Bibliothek — und Bibliotheken sind in Phase 4 am Zahlungs-Filter gestorben.

Was **bleibt**, ist etwas anderes und nicht wertlos: BLACKBOX ist das glaubwürdigste technische Aushängeschild, das Erik besitzt. Als veröffentlichtes OSS-Projekt mit sauberer Kryptografie und einem Blogpost über Hash-Ketten ist es ein Reputations-Asset, das Aufmerksamkeit auf alles lenkt, was er sonst verkauft — und das im Zusammenspiel mit dem Alters-Asset überproportional wirkt.

**Als Unternehmen tot. Als Verstärker lebendig.** Phase 8 greift das auf.

---

## Ergebnis des Red Teams

| Konzept | Score | Urteil nach Red Team |
|---|---|---|
| Ü2 · Difftruth | 64 | **Tot.** Struktureller Defekt: Nutzer, Zahler und Geschädigter fallen nie zusammen. Kein Rettungsanker. |
| Ü3 · ShareGuard *(Live)* | 64 | **Tot in der ursprünglichen Form.** → Überlebt als **Post-Processing-Scan vor der Veröffentlichung**, mit stärkerem Profil als das Original. |
| Ü1 · BLACKBOX | 58 | **Tot als Unternehmen.** Überlebt als OSS-Reputations-Asset. |

Von drei Kandidaten hat einer einen Rettungsanker, der meine eigene Kritik trägt — und er ist nicht die Idee, mit der er in die Phase ging. Das Red Team hat die Rangfolge aus Phase 5 nicht bestätigt, sondern **eine der drei Ideen umgebaut**, und zwar an genau der Stelle, an der sie sonst gestorben wäre.

Phase 7 entscheidet auf dieser Grundlage.

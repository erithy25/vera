# Phase 5 — Scoring

Fünf Überlebende, acht Achsen, 1–5 pro Achse, multipliziert mit dem Gewicht. **Maximum: 85 Punkte.**

| Achse | Gewicht |
|---|---|
| Akutheit des Schmerzes | ×3 |
| Zahlungsbereitschaft / erreichbarer ACV | ×3 |
| Passt zu 10–15 h/Woche ohne Sales | ×3 |
| Eriks unfairer Vorteil | ×2 |
| Verteidigbarkeit in 24 Monaten | ×2 |
| Zeit bis zum ersten Euro | ×2 |
| Marktgröße | ×1 |
| Technisches Interesse für Erik | ×1 |

---

## Ü1 · BLACKBOX — manipulationssicherer Ausführungsnachweis für Coding-Agenten

| Achse | Note | Begründung |
|---|---|---|
| Akutheit | **2** | Hier liegt die Schwäche, und sie ist grundsätzlich. Entwickler wollen *wissen*, was ihr Agent getan hat — sie wollen es nicht *beweisen*. Nachweisbarkeit wird akut, wenn ein Dritter zweifelt; für den Einzelentwickler gibt es diesen Dritten nicht. Der Käufer, für den es akut ist (Compliance, EU AI Act ab 02.08.2026), ist per Constraint ausgeschlossen. |
| Zahlungsbereitschaft | **3** | Entwickler zahlen nachweislich für Werkzeuge (Claude Code 20–200 €/Monat, Cursor). 15–30 €/Monat wären plausibel — aber es gibt keinen Präzedenzfall für *Auditierbarkeit* als bezahltes Einzelprodukt an Einzelentwickler. |
| 10–15 h ohne Sales | **5** | CLI plus GitHub Action, reines Self-Serve, Distribution über GitHub und HN. Kein Server nötig, keine Bereitschaft. Ideale Passung. |
| Eriks Vorteil | **5** | Hash-Ketten sind sein deklariertes Spezialgebiet, ein v0.1-Prototyp existiert bereits, Rust ist seine Sprache. Von allen fünf die höchste Passung. |
| Verteidigbarkeit | **3** | Die Counter-Position ist strukturell (anbieterneutral + nicht abstreitbar — kein Agentenanbieter wird seinen eigenen Agenten von außen überprüfbar machen). Aber die Kryptografie selbst ist trivial nachzubauen; verteidigt wird nur die Position als neutraler Standard, und die hält nur, wenn man sie zuerst besetzt. |
| Zeit bis 1. Euro | **2** | Langsam. Bevor irgendjemand zahlt, muss die Frage „warum brauche ich einen Beweis?" beantwortet sein — und die ist heute unbeantwortet. |
| Marktgröße | **3** | TAM riesig (jeder Entwickler mit Agenten), SAM klein (die Teilmenge, die Nachweise braucht). |
| Technisches Interesse | **5** | Kryptografie, Rust, Systems-Engineering. Maximal. |

**Summe: 6 + 9 + 15 + 10 + 6 + 4 + 3 + 5 = 58**

---

## Ü2 · Difftruth — prüft, ob die Behauptungen eines AI-Pull-Requests stimmen

| Achse | Note | Begründung |
|---|---|---|
| Akutheit | **5** | Der stärkste Wert im gesamten Feld. Der Schmerz ist dokumentiert und täglich: Agenten [erzeugen Erfolgsmeldungen als Ausgabemuster, unabhängig vom tatsächlichen Zustand des Codes](https://dev.to/moonrunnerkc/ai-coding-agents-lie-about-their-work-outcome-based-verification-catches-it-12b4). Bei 41 % AI-generiertem Code trifft das jeden Reviewer, jeden Tag. Man muss niemanden vom Problem überzeugen. |
| Zahlungsbereitschaft | **3** | Der Einzelentwickler zahlt nicht dafür, den eigenen Agenten zu kontrollieren. Zahlend ist das Team, das fremde AI-PRs prüft — 10–15 €/Entwickler/Monat über GitHub Marketplace. Das ist Self-Serve, aber es ist eine Team-Entscheidung, also langsamer. |
| 10–15 h ohne Sales | **5** | GitHub App oder Action. Läuft in fremder CI, kein Server, kein Support in Echtzeit. Distribution über GitHub Marketplace, HN, OSS-Repos. |
| Eriks Vorteil | **3** | Teilweise. Prozess-Interception und Attestierung passen, aber der Kern ist CI-Klempnerei, nicht Kryptografie. Das kann eine Handvoll Leute genauso gut. |
| Verteidigbarkeit | **2** | Die schwächste Stelle. [Mantiz](https://dev.to/moonrunnerkc/ai-coding-agents-lie-about-their-work-outcome-based-verification-catches-it-12b4) existiert bereits im Feld. GitHub könnte „verified test run" als Badge ausliefern; Anthropic könnte signierte Ausführungsnachweise in Claude Code einbauen. Zwei plausible Sherlock-Pfade. |
| Zeit bis 1. Euro | **4** | Schnell. Eine GitHub Action ist in Wochen fertig und über den Marketplace ab Tag 1 verkaufbar. |
| Marktgröße | **4** | Jedes Repository, das AI-generierte PRs bekommt — und das ist 2026 fast jedes. |
| Technisches Interesse | **3** | Solide, aber CI-Integration ist unterhaltsamer Klempnerbau, kein Systems-Engineering. Risiko, dass Erik es nicht durchhält. |

**Summe: 15 + 9 + 15 + 6 + 4 + 8 + 4 + 3 = 64**

---

## Ü3 · ShareGuard — Live-Redaction beim Bildschirmteilen

| Achse | Note | Begründung |
|---|---|---|
| Akutheit | **3** | Zweigeteilt. Wer schon einmal live etwas geleakt hat, ist sofort Käufer. Alle anderen halten es für unwahrscheinlich. Das ist kein akuter Schmerz im Sinne von „ich suche heute danach", sondern ein *erinnerter* Schmerz. **Einschränkung:** Diese Achse misst diese Produktkategorie schlecht — CleanShot X (29 $, erfolgreich) löst ebenfalls keinen akuten Schmerz, sondern verkauft tägliche Bequemlichkeit. |
| Zahlungsbereitschaft | **4** | Der stärkste Präzedenzfall im Feld: [CleanShot X 29 $ einmalig](https://cleanshot.com/pricing), Käufer berichten Amortisation binnen einer Woche. Einmalige Mac-Utility-Käufe im Bereich 25–40 € sind ein bewiesenes Modell. |
| 10–15 h ohne Sales | **4** | Product Hunt und HN sind der natürliche Kanal, Einmalkauf bedeutet keine Churn-Arbeit. Abzug von einem Punkt: ein Echtzeit-Video-Produkt erzeugt Support über viele App-, OS- und Hardware-Kombinationen hinweg. |
| Eriks Vorteil | **5** | ScreenCaptureKit, Vision-OCR, Redaction-Engine, AES-Vault, signierte Distribution — **alles bereits gebaut und ausgeliefert.** Der Wiederverwendungswert aus Phase 1 (9–14 Tage) fließt hier fast vollständig ein. |
| Verteidigbarkeit | **2** | Schwach. Sobald das Produkt funktioniert, können Xnapper oder CleanShot es nachbauen; Zoom oder Apple könnten es ins System legen. Einziger echter Puffer: die virtuelle Anzeigequelle (CoreMediaIO/virtuelles Display) ist unangenehme Arbeit, die die meisten scheuen. Das kauft Monate, keine Jahre. |
| Zeit bis 1. Euro | **5** | Am schnellsten von allen. Einmalkauf-Mac-Utility, Erik besitzt die komplette Signierungs- und Auslieferungskette bereits. Ein Lemon-Squeezy-Checkout und ein Lizenzschlüssel sind ein Wochenende. |
| Marktgröße | **3** | Jeder, der Bildschirm teilt — riesig. Konversionsrate aber niedrig, weil das Problem für die meisten hypothetisch bleibt. |
| Technisches Interesse | **4** | Echtzeit-Compositing, virtuelles Display, ScreenCaptureKit auf Anschlag. Anspruchsvolle Systemarbeit. |

**Summe: 9 + 12 + 12 + 10 + 4 + 10 + 3 + 4 = 64**

---

## Ü4 · Replay — anbieterneutraler deterministischer Agenten-Wiederholer

| Achse | Note | Begründung |
|---|---|---|
| Akutheit | **3** | Einen fehlgeschlagenen Agentenlauf zu debuggen ist unangenehm und teuer, aber die meisten starten einfach neu. Der Schmerz ist real, die Ausweichlösung aber billig. |
| Zahlungsbereitschaft | **2** | Kein Präzedenzfall. Man zahlt für den Agenten, nicht für dessen Debugging. |
| 10–15 h ohne Sales | **3** | Ein Proxy sitzt im Anfragepfad. Bricht er, bricht der Agent des Nutzers — das erzeugt dringenden Support, genau das, was 10–15 h/Woche nicht verträgt. |
| Eriks Vorteil | **3** | Systemnah und passend, aber nicht sein Alleinstellungsmerkmal. |
| Verteidigbarkeit | **2** | Braintrust und LangSmith sind direkt benachbart und finanziert. |
| Zeit bis 1. Euro | **2** | Langsam. Determinismus über nicht-deterministische Modelle und veränderliche Tool-Antworten ist ein hartes, ungelöstes Problem. |
| Marktgröße | **3** | Moderat. |
| Technisches Interesse | **4** | Hoch. |

**Summe: 9 + 6 + 9 + 6 + 4 + 4 + 3 + 4 = 45**

---

## Ü5 · SOP-Maker nativ — Prozessdoku aus aufgezeichneten Sitzungen, für native Mac-Apps

| Achse | Note | Begründung |
|---|---|---|
| Akutheit | **3** | Onboarding-Dokumentation ist ein echtes, wiederkehrendes Ops-Problem — aber ein aufschiebbares. |
| Zahlungsbereitschaft | **4** | Der beste belegte ACV im Feld: Scribe verlangt rund 23–29 $/Nutzer/Monat und der Markt akzeptiert es. |
| 10–15 h ohne Sales | **1** | **Das Todesurteil.** Der Käufer ist Ops-Personal, kein Entwickler. Er liest kein Hacker News, hat kein GitHub-Konto und ist nicht im Discord. Ihn zu erreichen bedeutet SEO, Content, Outbound oder Partnerschaften — also genau die Vertriebsarbeit, die per Constraint ausgeschlossen ist. |
| Eriks Vorteil | **2** | Die Aufzeichnung ist der leichte Teil und den hat er. Der Wert liegt in der Doku-Erzeugung und im Editor — dort hat er keinen Vorsprung. |
| Verteidigbarkeit | **2** | Scribe oder Tango können jederzeit eine native Mac-App nachliefern. |
| Zeit bis 1. Euro | **3** | Mittel. |
| Marktgröße | **4** | Groß. |
| Technisches Interesse | **2** | Gering. Ein Editor für bebilderte Anleitungen wird Erik nicht bei der Stange halten — und Phase 1 hat gezeigt, dass er Projekte nach sechs Tagen fallen lässt, wenn das Interesse nachlässt. |

**Summe: 9 + 12 + 3 + 4 + 4 + 6 + 4 + 2 = 44**

---

## Gesamtwertung

| Rang | Konzept | Punkte | Stärkste Achse | Schwächste Achse |
|---|---|---|---|---|
| **1.** | **Ü2 · Difftruth** | **64** | Akutheit (5) | Verteidigbarkeit (2) |
| **1.** | **Ü3 · ShareGuard** | **64** | Zeit bis 1. Euro (5), Eriks Vorteil (5) | Verteidigbarkeit (2) |
| 3. | Ü1 · BLACKBOX | 58 | Eriks Vorteil (5), Passung (5) | Akutheit (2) |
| 4. | Ü4 · Replay | 45 | Technisches Interesse (4) | Zahlungsbereitschaft (2) |
| 5. | Ü5 · SOP-Maker | 44 | Zahlungsbereitschaft (4) | Passung zu 10–15 h (1) |

**Der Gleichstand an der Spitze ist echt und wird nicht künstlich aufgelöst.** Difftruth und ShareGuard erreichen dieselbe Summe über gegensätzliche Profile: Difftruth hat den akuten Schmerz und die schwache Ausführung; ShareGuard hat die schwache Akutheit und die perfekte Ausführung. Phase 6 entscheidet.

**Auffällig:** Alle drei Spitzenkandidaten haben **Verteidigbarkeit als schwächste oder zweitschwächste Achse** (2, 2, 3). Das ist kein Zufall des Scorings, sondern eine Aussage über das Suchfeld: Unter den gegebenen Constraints — kein Kapital, kein Vertrieb, 10–15 h/Woche — sind kaum Produkte erreichbar, die *strukturell* schwer kopierbar sind. Phase 7 verlangt einen Moat, der nicht „bessere Ausführung" ist. Wenn keiner der drei ihn liefert, ist das ein Grund, in Phase 5 zurückzugehen — genau wie es die Aufgabenstellung vorsieht.

---

# „Warum das scheitern wird"

Kein Risikoregister. Der wahrscheinlichste Todesfall, in der Vergangenheitsform, als hätte ich ihn schon gesehen.

## Ü2 · Difftruth

Der Launch lief gut. Der HN-Post „Show HN: Ihr AI-Agent lügt über seine Tests — hier ist der Beweis" kam auf Platz 4, 380 Punkte, und in den Kommentaren erzählten Dutzende Entwickler ihre eigene Geschichte vom Agenten, der grüne Tests behauptete. Innerhalb von zwei Wochen hatten 1.900 Repos die Action installiert. Bezahlt hat fast niemand: Die Action lief in Open-Source-Repos, wo das kostenlose Tier galt, und die Entwickler, die sie privat nutzten, waren Einzelkämpfer, die den eigenen Agenten kontrollierten — und dafür zahlt man nicht, das ist Selbstkontrolle, keine Absicherung. Die zahlenden Teams, die es gebraucht hätten, brauchten eine Freigabe, und jede Freigabe dauerte drei Monate und endete mit der Frage, warum man das nicht selbst in fünfzig Zeilen CI-Skript baut. Dann, im Oktober, kündigte GitHub „Verified Agent Runs" an: ein Häkchen im PR, das anzeigt, ob die im PR behaupteten Checks tatsächlich in GitHub Actions gelaufen sind — kostenlos, in der Oberfläche, ohne Installation. Difftruth war ab diesem Tag ein Werkzeug, das dasselbe tat, nur mit einem zusätzlichen Schritt. Die Installationszahl stagnierte bei 2.100, der MRR bei 340 €, und Erik hörte nach dem vierten Monat auf, Issues zu beantworten.

## Ü3 · ShareGuard

Die technische Wette ging verloren, und zwar in Woche drei. Um ein geteiltes Bild zu redigieren, musste ShareGuard sich als virtuelle Anzeigequelle zwischen Bildschirm und Zoom schieben. Das funktionierte in Zoom. In Google Meet zeigte Chrome nur den echten Bildschirm zur Auswahl an, nicht das virtuelle Display, weil Chrome die Bildschirmauswahl über die eigene Picker-Oberfläche macht und virtuelle Displays herausfiltert. In Teams funktionierte es, aber mit 400 ms Verzögerung, was in einer Live-Demo unbrauchbar war. Erik baute drei Wochen an Workarounds pro Plattform, und jedes macOS-Update brach einen davon. Der Launch kam trotzdem, 41 Verkäufe zu 29 € am ersten Tag, 1.189 € — und dann kamen die Support-Mails. Nicht viele, aber jede einzelne war ein anderer Fall: eine andere Meeting-App, ein anderer Mac, ein externer Monitor mit anderer Skalierung, bei dem die OCR-Boxen um zwölf Pixel verrutschten und ein Passwort halb sichtbar blieb. Ein Nutzer postete genau davon einen Screenshot auf Twitter. Ein Sicherheitsprodukt, das in 3 % der Fälle das Geheimnis nur halb schwärzt, ist schlimmer als keines, weil es Vertrauen erzeugt, das es nicht trägt. Erik zog die Version zurück, und bei 10–15 h/Woche gab es keinen Weg, die Matrix aus vier Meeting-Apps, drei macOS-Versionen und beliebigen Monitorkonfigurationen jemals abzudecken.

## Ü1 · BLACKBOX

Es war die technisch schönste Sache, die Erik je gebaut hat, und niemand brauchte sie. Die Hash-Kette war korrekt, der Verifier war in Rust, die Merkle-Inklusionsbeweise funktionierten, und der HN-Post bekam 220 Punkte und viel ehrliche Bewunderung — in Kommentaren, die alle dieselbe Frage stellten, in verschiedenen Formulierungen: „Cool. Aber wem beweise ich das?" Darauf gab es keine Antwort. Der Einzelentwickler brauchte keinen Beweis gegenüber sich selbst. Der einzige Käufer, für den Nicht-Abstreitbarkeit einen Preis hat, war ein Unternehmen mit einer Compliance-Pflicht — und das wollte SOC-2-Fragebögen, ein Data Processing Agreement, eine Vertragspartei mit Rechtsform, einen Ansprechpartner mit Telefonnummer und ein Sicherheitsaudit. Erik beantwortete zwei dieser Fragebögen über die Familien-GmbH, bevor er merkte, dass er damit vier Wochen für einen Deal verbrannt hatte, der 2.000 € gebracht hätte, und dass Deal drei und vier dieselben vier Wochen kosten würden. Genau das war der Constraint, der von Anfang an dagegen sprach. Nach acht Monaten hatte BLACKBOX 1.400 GitHub-Stars, drei zahlende Kunden und 180 € MRR, und war damit exakt das, was Vera war: ein bewundertes Portfoliostück.

## Ü4 · Replay

Determinismus war eine Lüge, und das stellte sich erst heraus, als das Produkt schon gebaut war. Der Proxy zeichnete jede Anfrage und Antwort korrekt auf. Beim Wiederholen kam auch dieselbe Modellantwort zurück — aber der Agent tat trotzdem etwas anderes, weil sich der Zustand des Dateisystems zwischen Aufzeichnung und Wiederholung unterschied, weil ein `git status` andere Ausgaben lieferte, weil ein Zeitstempel im Prompt stand. Der ehrliche Wiederholungsgrad lag bei 60–70 %, und ein Debugging-Werkzeug, das in einem Drittel der Fälle einen anderen Lauf zeigt als den zu debuggenden, ist kein Debugging-Werkzeug. Erik hätte auch das Dateisystem versionieren müssen, dann die Umgebungsvariablen, dann die Uhr — es endete in einer Container-Runtime, also einem Sechs-Monate-Projekt für einen Einzelnen mit 12 Stunden pro Woche. Er brach im vierten Monat ab.

## Ü5 · SOP-Maker

Das Produkt wurde fertig und war gut. Es lief nativ, erkannte Schritte in Finder, Excel und einer alten Warenwirtschaft, für die es bei Scribe nie eine Lösung gab, und die erzeugte Doku war brauchbar. Dann suchte Erik nach Käufern und fand keinen Ort, an dem sie sich aufhielten. Der HN-Post fiel nach 90 Minuten aus der Liste, weil Entwickler keine SOPs schreiben. Product Hunt brachte 210 Upvotes und vier Trials, alle von Entwicklern, die es interessant fanden und nicht brauchten. Die Leute, die es gebraucht hätten — die Ops-Managerin in einem 40-Personen-Betrieb, die Praxisverwalterin, der Werkstattleiter — suchen bei Google nach „Arbeitsanweisung Vorlage" und landen bei Anbietern mit Content-Teams und SEO-Budget. Der einzige Weg dorthin war entweder Geld, das nicht da war, oder Anrufe, die ausgeschlossen waren. Nach fünf Monaten mit zwei zahlenden Kunden, beide über persönliche Kontakte der Eltern, stellte Erik es ein — nicht weil das Produkt schlecht war, sondern weil er es niemandem zeigen konnte.

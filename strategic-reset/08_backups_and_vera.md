# Phase 8 — Backups und Vera-Entscheidung

---

## Vorbemerkung: warum die Backups nach Ausfallgrund sortiert sind, nicht nach Punktzahl

Eine nach Punktzahl geordnete Ersatzliste ist wertlos, wenn der Grund des Scheiterns die Alternativen mitreißt. Fällt Preflight an **Kill-Gate 1** (OCR liest Code-Text vom Bildschirm nicht zuverlässig), ist damit **jedes** Konzept tot, das auf Bildschirm-OCR beruht — und das betrifft mehrere Überlebende aus Phase 4. Fällt es an **Gate 2 oder 3** (Technik funktioniert, niemand kauft), ist die Detection-Engine intakt und wertvoll, nur die Zielgruppe war falsch.

Die Backups sind deshalb an Bedingungen gekoppelt.

**Difftruth ist ausdrücklich kein Backup**, obwohl es in Phase 5 mit 64 Punkten den geteilten ersten Platz hielt. Das Red Team hat einen strukturellen Defekt gefunden — Nutzer, Zahler und Geschädigter fallen nie zusammen — und für den existiert kein Rettungsanker. Eine Rückfallposition, von der bereits bewiesen ist, dass sie bricht, ist keine Rückfallposition.

---

## Backup #1 · BLACKBOX — Hash-Chain-Ausführungsnachweis für Coding-Agenten

**Platz 2 in der Ersatzordnung.** Phase-5-Score 58, damit der höchstbewertete Kandidat nach dem Gewinner. Ein v0.1-Prototyp existiert bereits.

**Was es ist:** Ein manipulationssicherer, kryptografisch verketteter Ausführungsnachweis für Agentenläufe — jeder Tool-Call, jede Dateiänderung, jeder Prozess-Exit in einer Kette, die nachträglich nicht änderbar ist, mit einem eigenständigen Verifier.

**Warum Platz 2 und nicht Platz 1:** Das Red Team hat es als Unternehmen erledigt, und das Argument steht. Nicht-Abstreitbarkeit braucht einen Gegner, der bestreitet, und eine Instanz, vor der man den Beweis vorlegt. Beim Entwickler auf dem eigenen Repository gibt es beides nicht. Der einzige zahlende Käufer ist Compliance — und der verlangt SOC-2-Fragebögen, DPA, Sicherheitsaudit und einen erreichbaren Ansprechpartner, also exakt den Enterprise-Zyklus, den die Constraints ausschließen.

**Warum es trotzdem Platz 2 ist:** Es hat die höchste Erik-Passung aller 44 Konzepte (5/5), es ist der einzige Kandidat mit einer *strukturellen* Counter-Position — kein Agentenanbieter wird seinen eigenen Agenten von außen überprüfbar machen — und es teilt **keine einzige technische Abhängigkeit** mit Preflight. Kein OCR, kein Vision-Framework, keine Videoverarbeitung. Genau das macht es zum richtigen Backup für einen Gate-1-Ausfall.

**Unter welcher Bedingung wird gewechselt:**
> **Kill-Gate 1 verfehlt (OCR-Trefferquote < 75 %).** Dann ist die gesamte Bildschirm-OCR-Familie tot, und BLACKBOX ist das einzige verbliebene Konzept mit hoher Erik-Passung, das davon unberührt ist.

**In welcher Form — und das ist die Änderung gegenüber der ursprünglichen Idee:** Nicht als Produkt mit Preisschild. Als **veröffentlichtes Open-Source-Projekt mit sauberer Kryptografie, einem eigenständigen Verifier und einem technisch ernsthaften Blogpost über Hash-Ketten in Agenten-Pipelines.** Der Ertrag ist nicht Umsatz, sondern Reputation — und die ist bei einem fünfzehnjährigen Entwickler mit nachweisbarer Kryptografie-Kompetenz ein überproportional wirksames Asset, das auf alles einzahlt, was danach kommt. Die Monetarisierung bleibt bewusst offen, bis ein Käufer sich von selbst meldet. Meldet sich nach sechs Monaten keiner, ist das die Bestätigung des Red-Team-Urteils, und der Umstieg auf Backup #2 folgt.

---

## Backup #2 · Preflight mit gewechselter Zielgruppe

**Platz 3 in der Ersatzordnung.**

**Was es ist:** Dieselbe Detection-Engine, dasselbe Produkt, anderer Käufer. Statt einzelner Indie-Entwickler und Creator die Gruppen, die Bildschirmvideos **in Menge** veröffentlichen und für die ein Leak keine Peinlichkeit, sondern ein meldepflichtiger Vorfall ist: Kursplattformen mit Video-Katalog, Konferenz-Video-Pipelines, Entwickler-Tool-Firmen mit großem Tutorial-Archiv. Zusätzlich das **rückwirkende Scannen bestehender Archive** — ein Katalog mit 400 veröffentlichten Videos ist ein Auftrag, kein Einzelverkauf.

**Warum Platz 3:** Es kollidiert teilweise mit dem Distributions-Constraint. Diese Käufer sind Organisationen, und auch wenn der Erstkontakt über die technische Community entstehen kann, endet der Abschluss näher an einem Vertriebsgespräch als bei einem 39-€-Einmalkauf. Das ist genau die Verwässerung, vor der Phase 4 gewarnt hat — deshalb Platz 3 und nicht Platz 2.

**Warum es trotzdem drin ist:** Weil es die einzige Option ist, die bei einem Gate-2- oder Gate-3-Ausfall den gesamten Bauaufwand rettet. Fällt Preflight nicht an der Technik, sondern am Markt, ist die Engine bewiesen, der Korpus existiert, das DMG ist signiert — und nur die Antwort auf „wer zahlt" war falsch. Der Wechsel kostet dann Wochen, nicht Monate.

**Unter welcher Bedingung wird gewechselt:**
> **Kill-Gate 2 verfehlt (< 15 Käufer nach einem HN-Frontpage-Peak) oder Kill-Gate 3 verfehlt (< 5 Verkäufe nach dem Peak) — bei bestandenem Gate 1.** Technik funktioniert, Einzelkäufer nicht. Dann wird die Zielgruppe gewechselt, bevor das Produkt aufgegeben wird — aber **genau einmal**, mit einem eigenen 60-Tage-Fenster und einem eigenen harten Gate.

---

# Die Vera-Entscheidung

## Die Antwort

> **Ausschlachten und archivieren. Nicht weiterbauen, nicht als aktives Produkt stehen lassen.**

Von den vier zur Wahl stehenden Optionen scheiden zwei sofort aus, und die verbleibenden zwei werden kombiniert:

- **Weiterbauen: nein.** Phase 2 hat das beantwortet. Der Kategorieführer Rewind ist am 19.12.2025 gestorben; Apple hat am 08.06.2026 — dem Tag der Repo-Erstellung — onscreen awareness und persönlichen Kontext in Spotlight angekündigt; Screenpipe hat 16.000+ Sterne gegen Veras 0 und ist kostenlos. Zusätzliche Stunden in Vera sind Stunden, die gegen Apple, Microsoft und ein MIT-lizenziertes Projekt mit 80 Contributors arbeiten.
- **Als aktives Portfolio-Artefakt stehen lassen: nein**, und der Grund ist wichtiger als er klingt — siehe unten.
- **Ausschlachten: ja**, und zwar sofort und vollständig. 18–26 Personentage wandern in Preflight.
- **Archivieren: ja**, mit einer ehrlichen Abschluss-Notiz statt der aktuellen.

## Warum „einfach liegen lassen" die falsche Antwort ist

Das ist der Punkt, an dem ich am deutlichsten widerspreche, falls der Instinkt „schadet ja nicht" lautet. Er schadet.

**1. Die öffentlichen Aussagen sind nicht mehr haltbar.** Das README behauptet, Vera sei *„an active personal project"* und *„ships in iterations"* — bei einem einzigen, rein kosmetischen Commit in sechs Wochen. Es wirbt mit *„encrypts every frame with AES-256-GCM before it ever touches the disk"*, während Phase 1 belegt hat, dass jedes in der Timeline betrachtete Frame einen **dauerhaften unverschlüsselten Screenshot im Temp-Verzeichnis** hinterlässt (F-3), der nie gelöscht wird. Die Landing Page bewirbt *„Local agents — Planner, Writer, Researcher and Coach"* als *„a team"*, während es sich um vier Prompt-Strings handelt, von denen einer (`Writer`) buchstäblich `context: ""` bekommt.

**2. Genau die Leute, die Preflight kaufen sollen, prüfen so etwas.** Der Launch-Plan setzt auf Hacker News. Ein „Show HN" von einem Fünfzehnjährigen mit einem Sicherheitsprodukt zieht Neugier auf sein GitHub-Profil — und dort steht ein Repository, dessen Marketingtext den eigenen Code überzeichnet. Auf HN findet das jemand, und der Kommentar kommt am Launch-Tag. **Ein überzogenes README ist bei einem Sicherheitsprodukt ein Reputationsrisiko, kein Portfolio-Gewinn.**

**3. Ein ehrlich archiviertes Projekt ist für technische Leser mehr wert als ein aufgehübschtes aktives.** „Ich habe das in sieben Tagen gebaut, ausgeliefert, signiert und notarisiert — und dann festgestellt, dass Apple die Kategorie am Tag meines Projektstarts ins OS geholt hat. Hier ist das Audit" ist eine deutlich stärkere Geschichte als ein stilles Repo mit 0 Sternen und einem Werbetext. Sie zeigt Auslieferungsfähigkeit **und** Urteilsvermögen. Das zweite ist seltener.

**4. Ein sicherheitskritischer Defekt darf nicht als Download stehen bleiben.** Die Wahrscheinlichkeit, dass jemand Vera installiert hat, ist sehr niedrig — aber nicht null, und das DMG ist öffentlich abrufbar. Wer es installiert und einen Cloud-Modus einrichtet, legt seinen Anthropic- oder OpenAI-Schlüssel **im Klartext** in eine SQLite-Datei (F-1). Wer die visuelle Erinnerung nutzt, verliert sie beim nächsten Fingerabdruck-Wechsel oder Mac-Umzug **vollständig und ohne Warnung** (F-4). Ein signiertes, notarisiertes Installationspaket mit diesen beiden Eigenschaften öffentlich stehen zu lassen, während man gleichzeitig ein Sicherheitsprodukt verkauft, ist die Position, in der man nicht sein will.

## Konkrete Schritte

Geschätzter Gesamtaufwand: **4–6 Stunden.** Vor dem Preflight-Launch abzuschließen, nicht danach.

| # | Schritt | Aufwand |
|---|---|---|
| **1** | **Download offline nehmen.** `Vera.dmg` und `Vera.app.tar.gz` von der Website entfernen, `updater/latest.json` entfernen. Kein Fix der Sicherheitsfunde — bei ~0 Nutzern wäre das Tage für nichts. Entfernen ist die richtige, billige Antwort. | 30 Min |
| **2** | **Landing Page ersetzen** durch eine einseitige, ehrliche Projektnotiz: was es war, was daran technisch funktionierte, warum es eingestellt wurde. Verlinkt auf das Repo. **Impressum ergänzen** (fehlt heute, DDG-Pflicht). | 1 Std |
| **3** | **README neu schreiben.** Status oben: archiviert, mit Datum und Grund. Die Feature-Behauptungen auf das reduzieren, was der Code belegbar tut — insbesondere „four local agents" und die Verschlüsselungsaussage korrigieren. Die bekannten Sicherheitsfunde offen benennen. Das kostet nichts und ist glaubwürdiger als jede Bewerbung. | 1,5 Std |
| **4** | **`strategic-reset/` im Repo belassen.** Es ist das stärkste Einzelstück in Eriks öffentlichem Portfolio: ein schonungsloses Audit des eigenen Projekts mit Zeilenangaben, Sicherheitsfunden und einer belegten Marktobduktion. Das schreiben die wenigsten Erwachsenen über die eigene Arbeit. | 0 |
| **5** | **Repository auf GitHub archivieren** (read-only). Signalisiert den Status ohne Erklärung. | 5 Min |
| **6** | **Bausteine nach Preflight extrahieren:** Release-Pipeline, `ocr-helper`, `frame-extract`, Perceptual-Hash-Dedupe, Sidecar-Supervisor, Secret-Muster (zu **einer** getesteten Implementierung konsolidiert). Das ist keine separate Arbeit — es ist Woche 3–4 des 90-Tage-Plans. | im Plan enthalten |
| **7** | **Apple-Developer-Account und Signaturidentität behalten und auf die GmbH überführen.** Der eigentliche Vermögenswert des ganzen Projekts. Kritischer Pfad wegen D-U-N-S-Vorlauf — Woche 1. | siehe Phase 7 |
| **8** | *Optional, niedrige Priorität:* Die ~67 MB Build-Artefakte aus der Git-History entfernen (4× DMG, 4× App-Tarball). Kosmetisch, kein Nutzen für ein archiviertes Repo. | 1 Std |

## Was Vera unterm Strich wert war

**Als Produkt: null.** Null Umsatz, null Nutzer, null Sterne, keine Möglichkeit, das Gegenteil je festzustellen — und eine Kategorie, die zum Zeitpunkt des Baubeginns bereits von Apple absorbiert wurde.

**Als Fundament: 18–26 Personentage**, die direkt in Preflight fließen, plus ein bezahlter und funktionierender Apple-Signierungs- und Notarisierungspfad, der für die meisten Indie-Entwickler eine Hürde von Wochen ist.

**Als Lehre: die einzige, die zählt.** Vera wurde in sechs Tagen gebaut, signiert, notarisiert und ausgeliefert — und dann niemandem gezeigt, ohne Preis, ohne Konto, ohne eine einzige Stelle im Produkt oder auf der Website, an der Geld hätte fließen können. Der Bau war nie das Problem. Der 90-Tage-Plan in Phase 7 ist genau darauf gebaut: **Kill-Gate 1 steht in Woche 2, bevor irgendetwas gebaut wird, und die Zahlungsabwicklung steht in Woche 6, bevor der erste Nutzer die App sieht.**

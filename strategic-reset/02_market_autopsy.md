# Phase 2 — Markt- und Obduktionsanalyse

**GATE 1.** Alle Zahlen unten stammen aus Websuchen mit Quellenangabe. Wo ich schätze, steht **[ANNAHME]**.

---

## Teil 1 — Warum hat Vera keinen Umsatz?

Sieben konkurrierende Hypothesen, nach Erklärungskraft geordnet. Die ersten beiden sind die *unmittelbaren* Ursachen. Die restlichen fünf sind der Grund, warum die Behebung der ersten beiden **nichts** geändert hätte.

### H1 — Es gab nie einen Kaufmechanismus. Umsatz war strukturell unmöglich. · Wahrscheinlichkeit: 100 % (belegt, keine Hypothese)

Das ist kein Marktversagen, sondern eine Tatsache aus Phase 0:

- Die Landing Page hat **keinen Preis, keinen Checkout, keinen Warenkorb, kein E-Mail-Feld, keine Waitlist**. Der einzige CTA ist viermal derselbe statische Link auf `/downloads/Vera.dmg`.
- Das Produkt ist an drei Stellen aktiv als kostenlos positioniert: „Free · macOS 12+ · No account" (2×) und FAQ: *„Vera itself is free."*
- Es gibt kein Konto, keine Lizenzprüfung, keinen Server, kein Entitlement — im gesamten Repo existiert keine einzige Zeile Code, die einen zahlenden von einem nicht zahlenden Nutzer unterscheiden könnte.

**Die Frage „Warum hat Vera keinen Umsatz?" hat also eine triviale Antwort: weil nie etwas zum Verkauf stand.** Die interessante Frage ist die dahinter — warum es keine Nutzer gibt und warum ein nachträglich eingebauter Bezahl-Layer daran nichts geändert hätte. Dafür H2–H7.

### H2 — Es hat nie einen Launch gegeben. Distribution war null, nicht schwach. · Sehr hoch

0 Stars, 0 Forks, 0 Watchers, 0 Issues nach sieben Wochen. Ein Repo mit einem einzigen ungewollten Besucher hätte statistisch mindestens einen Star. Diese Zahlen sind nicht das Ergebnis eines schlechten Launches — sie sind das Ergebnis von **gar keinem Launch**. In README, Website und Commit-History findet sich kein Verweis auf einen HN-Post, Product Hunt, Reddit, Discord oder Twitter.

Dazu kommt: das einzige GitHub-Release ist als `v0.1.0` getaggt, während die App bei 0.5.2 steht. Wer der README-Anweisung folgt („Download the latest signed `.dmg` from the Releases page"), landet bei einer vier Minor-Versionen alten Build. Und `has_downloads` ist `false`.

**Das Produkt wurde gebaut, verpackt, signiert, notarisiert — und dann niemandem gezeigt.**

### H3 — Die Kategorie wurde ein halbes Jahr vor dem Bau beerdigt und am Tag des Baubeginns vom Plattformbesitzer absorbiert. · Sehr hoch

Zwei Daten nebeneinander:

| Datum | Ereignis |
|---|---|
| **19.12.2025** | Rewind AI — der a16z-finanzierte Kategorieführer für „Mac screen memory" — schaltet Screen- und Audio-Capture endgültig ab. Team via Limitless-Übernahme zu Meta. ([9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/), [rewind.ai](https://rewind.ai/what-happened-to-rewind/)) |
| **08.06.2026** | Apple kündigt „Siri AI" an: **onscreen awareness**, **personal context** über Apps hinweg, **in Spotlight auf dem Mac integriert**, on-device + Private Cloud Compute. macOS 27. ([Apple Newsroom](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)) |
| **08.06.2026, 22:58 UTC** | Das Repository `erithy25/vera` wird erstellt. (GitHub API) |

Das ist kein rhetorischer Kniff, das ist der Zeitstempel: **Vera wurde am selben Kalendertag begonnen, an dem Apple ankündigte, exakt diese Funktion ins Betriebssystem zu integrieren.** Apples Beschreibung — „answer questions related to the content on a user's screen", Zugriff auf persönlichen Kontext quer über Apps, direkt in Spotlight — ist Wort für Wort Veras Wertversprechen, kostenlos, vorinstalliert, ohne Ollama-Installation, ohne Screen-Recording-Permission-Dialog, ohne 3B-Modell.

Auf der Windows-Seite dasselbe: Microsoft Recall ist auf Copilot+-PCs allgemein verfügbar, macht alle 3–5 Sekunden Screenshots, OCR, lokal verschlüsselt, durchsuchbare semantische Timeline — als OS-Funktion. ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/client-management/manage-recall))

Der **Sherlock-Fall ist bei Vera nicht ein Risiko, sondern bereits eingetreten**, bevor die erste Zeile Code geschrieben war.

### H4 — Das Kernversprechen ist mit einem lokalen 3B-Modell technisch nicht einlösbar. · Hoch

Rewind hatte GPT-4-Klasse-Modelle, ein finanziertes Team und Jahre Vorlauf. Der **zweithäufigste Kündigungsgrund** war trotzdem, dass die KI-Funktionen nicht gut genug waren: *„Ask Rewind and Meeting Summaries were impressive prototypes, but always walked the line of the accuracy needed for reliable use."* ([Andrew Schreiber](https://andrewschreiber.substack.com/p/an-early-adopters-thoughts-on-rewindais))

Veras Default-Konfiguration (Phase 1, Abschnitt 4): `llama3.2:3b`, 4 Frames, je 500 Zeichen, Gesamtkontext hart auf 4.000 Zeichen gedeckelt. Wenn ein GPT-4-Klasse-Modell mit vollem Kontext die nötige Zuverlässigkeit knapp verfehlte, dann erreicht ein 3-Milliarden-Parameter-Modell mit 2.000 Zeichen verrauschtem 1-fps-OCR-Text sie nicht annähernd.

Und der Nutzer kann es nicht einmal prüfen: Bei der Frage „Was habe ich heute Morgen gemacht?" gibt es keine Referenzantwort. Eine plausible, aber falsche Zusammenfassung ist von einer richtigen nicht unterscheidbar — bis sie es einmal zu offensichtlich ist und das Vertrauen komplett kippt.

### H5 — Die Kategorie hat einen kostenlosen Open-Source-Standard, der mehr kann. · Hoch

| Projekt | Lizenz | Reichweite | Kann mehr als Vera |
|---|---|---|---|
| [screenpipe](https://github.com/screenpipe/screenpipe) | MIT | **16k–19k GitHub-Stars**, 80+ Contributors, YC S26 | macOS + Windows + Linux, Audio-Transkription, Accessibility-API mit OCR-Fallback, Plugin-System („pipes"), REST-API, Ollama-Anbindung |
| [OpenRecall](https://openrecall.github.io/) | AGPLv3 | aktiv | plattformübergreifend, vollständig lokal |
| [Windrecorder](https://github.com/yuka-friends/Windrecorder) | OSS | aktiv | OCR + Bildbeschreibung + Aktivitätsstatistik |

Screenpipe allein hat **mindestens 16.000 Stars gegen Veras 0** und ist als Open-Source-Ersatz für Rewind fest etabliert. Es ist kostenlos, MIT-lizenziert, plattformübergreifend, hat eine API und ein Plugin-Ökosystem. Veras Alleinstellungsmerkmal gegenüber Screenpipe ist — nichts. Nicht die Verschlüsselung (Screenpipe ist lokal), nicht die Offenheit (beide auf GitHub), nicht der Funktionsumfang (Screenpipe hat mehr).

Der **Gratis-Filter ist damit für Vera in seiner heutigen Form eindeutig verletzt.**

### H6 — Zahlungsbereitschaft für „Privacy" als Hauptargument ist empirisch niedrig. · Mittel–hoch

Veras gesamte Positionierung ruht auf Datenschutz: die H1 lautet „Your day, remembered", aber die dominante Sektion der Seite ist ein ganzseitiges dunkles Band mit „Everything stays on your Mac."

Die Forschungslage dazu ist unfreundlich: Nur **31 %** der Befragten würden überhaupt mindestens 1 US-Dollar pro Monat zahlen, um ihre Social-Media-Daten zu schützen. ([Statista](https://www.statista.com/statistics/1023967/global-willingness-to-pay-monthly-fee-personal-data-protection/)) Wird Datenschutz nicht prominent gemacht, kaufen Konsumenten schlicht beim günstigsten Anbieter, unabhängig von der Datenschutzerklärung. ([Acquisti et al., CMU](https://www.heinz.cmu.edu/~acquisti/papers/acquisti-onlinepurchasing-privacy.pdf))

„Privacy" verkauft als **Tie-Breaker zwischen zwei gleichwertigen Produkten**. Als alleiniger Kaufgrund verkauft es fast nie. Und Veras Privacy-Vorteil besteht gegenüber wem? Gegenüber Apple, das dasselbe on-device plus Private Cloud Compute macht — und dem die Nutzer bereits ihre gesamte Festplatte anvertrauen.

### H7 — Die Ressourcenkosten übersteigen den wahrgenommenen Nutzen. · Mittel–hoch

Der **häufigste** Grund, warum Rewind-Nutzer aufhörten, war Performance: die App machte neue MacBooks zum „toaster" und verbrauchte **20–30 % Akku**. ([Schreiber](https://andrewschreiber.substack.com/p/an-early-adopters-thoughts-on-rewindais), [aigearbase](https://aigearbase.com/tool/rewind-ai)) Bemerkenswert: Speicherplatz war *nicht* das Problem — Rechenlast war es.

Vera fährt SCStream mit 1 fps, dazu Vision-OCR pro Frame, HEVC-Encoding, AES-GCM-Verschlüsselung jedes Segments — und für jede Antwort zusätzlich lokale LLM-Inferenz plus Embedding-Generierung. Ich habe das **nicht gemessen** (keine macOS-Umgebung), aber es gibt keinen Grund anzunehmen, dass ein Ein-Wochen-Projekt effizienter ist als ein finanziertes Team, das genau an dieser Hürde scheiterte. **[ANNAHME]** Veras Energieprofil liegt in derselben Größenordnung wie Rewinds, also 15–35 % Akkuverbrauch — Unsicherheitsspanne hoch, weil ungemessen.

### Rangfolge

| # | Hypothese | Erklärungskraft |
|---|---|---|
| 1 | H1 — kein Kaufmechanismus existiert | belegt |
| 2 | H2 — kein Launch, null Distribution | sehr hoch |
| 3 | H3 — Kategorie tot + von Apple/Microsoft absorbiert | sehr hoch |
| 4 | H4 — 3B-Modell kann das Versprechen nicht einlösen | hoch |
| 5 | H5 — kostenloser OSS-Standard mit mehr Funktionen | hoch |
| 6 | H7 — Ressourcenkosten > Nutzen | mittel–hoch |
| 7 | H6 — geringe Zahlungsbereitschaft für Privacy | mittel–hoch |

**Die entscheidende Aussage:** H1 und H2 sind reparierbar — Preis einbauen, auf HN posten. Das wäre in zwei Wochenenden erledigt. H3 bis H7 sind **nicht** reparierbar. Deshalb ist „Vera hatte nur kein Marketing" die bequeme und falsche Diagnose.

---

## Teil 2 — Obduktionen

### A. Gescheitert (5 gefordert, 6 dokumentiert)

**1. Rewind AI — Todesursache: Die Desktop-Prämisse trug nicht, nicht einmal mit a16z-Geld.**
Kategorieführer für Mac-Screen-Memory, 19 $/Monat. 2024 Rebranding zu Limitless und Pivot **weg vom Desktop** hin zu einem 99-$-Hardware-Pendant — das ist das eigentliche Todesurteil: das Team, das die Kategorie am besten kannte, verließ sie freiwillig. Im Dezember 2025 kaufte Meta Limitless; die Mac-App stellte Capture am **19.12.2025** ein, Nutzerdaten wurden gelöscht, EU/UK-Service beendet. Meta wollte das Wearables-Team, **nicht** das Desktop-Produkt.
Konkrete Churn-Gründe vor dem Ende: (1) Performance/Akku 20–30 %, (2) KI-Qualität unzureichend.
[TechCrunch](https://techcrunch.com/2024/04/17/a16z-backed-rewind-pivots-to-build-ai-powered-pendant-to-record-your-conversations/) · [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/) · [rewind.ai](https://rewind.ai/what-happened-to-rewind/) · [Schreiber](https://andrewschreiber.substack.com/p/an-early-adopters-thoughts-on-rewindais)

**2. Limitless Pendant — Todesursache: Auch der Ausweg aus der Kategorie hielt nicht.**
Der Pivot selbst scheiterte. Meta stoppte den Verkauf, unterstützt Bestandskunden noch bis Ende 2026, danach Obsoleszenz. Lehre: Das Problem war nicht der Formfaktor Desktop — es war die These „ein Gerät zeichnet alles auf und beantwortet später Fragen darüber".
[digitalmarketreports](https://digitalmarketreports.com/news/55791/meta-buys-limitless-and-shuts-down-sales-of-its-ai-recording-pendant/)

**3. Humane AI Pin — Todesursache: Produkt vor der Modellreife ausgeliefert.**
230 Mio. $ eingesammelt, Spitzenbewertung über 700 Mio. $, **unter 10.000 verkaufte Geräte**, Verkauf an HP im Februar 2025 für 116 Mio. $ — die Hälfte des eingesammelten Kapitals. Server am 28.02.2025 abgeschaltet. Kritik durchgängig: langsam, unzuverlässig, Akku- und Hitzeprobleme.
[AOL/Reuters](https://www.aol.com/news/ai-startup-humane-wind-down-124051163.html) · [technowize](https://www.technowize.com/the-humane-ai-pin-shutdown-surprises-no-one-hp-walks-away-a-winner/)

**4. Rabbit R1 — Todesursache: Demo ≠ Produkt.**
100.000 verkaufte Einheiten, danach Massenretouren; das Unternehmen soll Schwierigkeiten haben, die Gehälter zu zahlen. Kanonisches Beispiel für „AI-Gadget vor der Zeit".
[blogviro](https://blogviro.com/world-wide/humane-ai-pin-vs-rabbit-r1-why-both-failed/) · [digitalapplied](https://www.digitalapplied.com/blog/ai-product-failures-2026-sora-humane-rabbit-lessons)

**5. OpenAI Atlas Browser — Todesursache: Selbst der Modellanbieter kann eine Kontext-Schicht über der täglichen Arbeit nicht halten.**
Nach **8 Monaten** eingestellt, Datenexport-Frist 09.08.2026. Direkt relevant: Atlas war der Versuch, eine KI-Schicht über alles zu legen, was der Nutzer tut — mit den besten Modellen der Welt, unbegrenztem Budget und einer eingebauten Nutzerbasis. Es hielt nicht.
[TechTimes](https://www.techtimes.com/articles/320183/20260711/openai-kills-atlas-browser-after-8-months-what-replaces-it-what-users-must-do-now.htm)

**6. Google Try-On — Todesursache: Sherlock in Reinform.**
Schaffte es auf TIMEs „Best Inventions of 2025" und wurde weniger als ein Jahr später eingestellt, weil die Funktion in die Google-Shopping-Suche absorbiert wurde. Ausgezeichnetes Produkt, ausgezeichnete Technik, vom Plattformbesitzer geschluckt.

**Gemeinsames Muster aller sechs:** Das Produkt versprach breite, ambiente Intelligenz („es weiß, was du getan hast, frag es einfach"), aber die Modellqualität reichte nicht für die versprochene Zuverlässigkeit, die Ressourcenkosten waren spürbar, und der Nutzen war nicht überprüfbar. Kapital hat in keinem Fall geholfen.

### B. Erfolgreich (3 gefordert, 4 dokumentiert)

**1. MacWhisper — Jordi Bruin, Solo-Entwickler, 59 € einmalig.**
Lokale On-Device-Transkription auf Whisper/Parakeet-Basis. **4,8/5 aus fast 1.900 Product-Hunt-Bewertungen**, eines der populärsten Mac-Audio-Tools.
*Was anders war:* Eine einzige, eng umrissene Aufgabe. Das Ergebnis ist **sofort überprüfbar** — der Nutzer hört das Audio und liest den Text. Und entscheidend: **das lokale Modell ist bei dieser Aufgabe auf Augenhöhe mit der Cloud.** Whisper on-device ist kein Kompromiss, es ist gleichwertig. „Lokal" ist hier ein echter Vorteil (Geschwindigkeit, keine Kosten pro Minute, Vertraulichkeit) statt eines Qualitätsabstrichs.
[todayonmac](https://www.todayonmac.com/macwhisper-your-private-transcription-assistant-that-never-phones-home/) · [getvoibe](https://www.getvoibe.com/resources/macwhisper-review/)

**2. Superwhisper — 249,99 $ Lifetime-Lizenz.**
Dasselbe Muster, anderer Anwendungsfall: Echtzeit-Diktat statt Batch-Transkription. Ein Preispunkt, den man für „ein Feature" nur verlangen kann, wenn es täglich und mit sichtbarem Ergebnis benutzt wird.
[getvoibe](https://www.getvoibe.com/resources/superwhisper-review/)

**3. Raycast — 8–10 $/Monat Pro, 20 $/Nutzer/Monat Team.**
47,8 Mio. $ Funding, 45 Mitarbeiter (Stand 30.06.2026).
*Was anders war:* Raycast wurde **zuerst als Launcher** erfolgreich — ein Werkzeug, das man 50× am Tag benutzt und dessen Nutzen in der ersten Minute offensichtlich ist. KI kam Jahre später obendrauf. Die Reihenfolge ist die Lehre: erst tägliche Gewohnheit, dann KI. Nicht umgekehrt. (Einschränkung: VC-finanziert, damit nur bedingt als Vorbild für einen Solo-Gründer mit 10–15 h/Woche.)
[Tracxn](https://tracxn.com/d/companies/raycast/__VNiI9rqA4HFcosfhPf0QoAIcecG3jJRlMCseC8jQeOw) · [toolradar](https://toolradar.com/tools/raycast/pricing)

**4. CleanShot X — 29 $ einmalig.**
Kein KI-Produkt, aber der sauberste Beleg für das ökonomische Muster: Es ersetzt ein eingebautes macOS-Werkzeug durch ein spürbar besseres und wird **jeden Tag** benutzt. Käufer berichten, dass sich der Preis binnen einer Woche amortisiert habe.
[cleanshot.com/pricing](https://cleanshot.com/pricing)

**Gemeinsames Muster aller vier:** eng, täglich, sofort überprüfbar, sofort wertvoll ab Nutzer Nr. 1 — und dort, wo KI im Spiel ist, ist das lokale Modell **gleichwertig** zur Cloud, nicht schwächer.

---

## Teil 3 — Kategorien-Urteil

**Frage: Ist „local-first AI assistant" 2026 eine Kategorie, in der noch Geld zu verdienen ist?**

**Antwort: Nein — nicht als „Assistent". Ja — als eng umrissenes Werkzeug, bei dem das lokale Modell der Cloud ebenbürtig ist.**

Die Belege trennen sauber entlang einer einzigen Linie:

| | Breiter „Assistent" (Vera, Rewind, Atlas, Humane) | Enges Werkzeug (MacWhisper, Superwhisper) |
|---|---|---|
| Aufgabe | „frag mich alles über deinen Tag" | „transkribiere diese Datei" |
| Lokales Modell vs. Cloud | **schlechter** (llama3.2:3b vs. GPT-5-Klasse) | **ebenbürtig** (Whisper on-device) |
| Ergebnis überprüfbar? | nein | sofort |
| Wert bei Nutzer Nr. 1 | erst nach Wochen Datensammlung | in der ersten Minute |
| Ressourcenkosten | dauerhaft, im Hintergrund, spürbar | nur bei Benutzung |
| Ergebnis am Markt | Rewind †, Limitless †, Atlas †, Humane †, Rabbit † | 59 € / 249 $, profitabel, Solo-Entwickler |

Drei zusätzliche harte Randbedingungen für die breite Variante:

1. **Der Plattformbesitzer liefert sie jetzt mit.** Apple seit 08.06.2026 (Siri AI, onscreen awareness, in Spotlight, macOS 27); Microsoft mit Recall auf Copilot+-PCs. Ein bezahltes Drittanbieter-Produkt muss besser sein als eine kostenlose, tief integrierte OS-Funktion — bei gleichzeitig schlechterem Modell und ohne Systemzugriff.
2. **Der kostenlose Open-Source-Standard ist bereits etabliert.** Screenpipe: 16k–19k Stars, MIT, YC S26, plattformübergreifend, Plugin-API. Ein bezahltes Produkt muss zusätzlich gegen *das* bestehen.
3. **Das allgemeine Umfeld ist brutal.** 2025 stellten 3.800 KI-Startups den Betrieb ein (27 % der 2024 gegründeten), Anfang 2026 weitere 1.800 — rund **40 % Ausfallquote in unter 24 Monaten**. ([techstartups](https://techstartups.com/2025/12/09/top-ai-startups-that-shut-down-in-2025-what-founders-can-learn/), [ideaproof](https://ideaproof.io/failures/ai-startups)) **[ANNAHME]** Diese Aggregatzahlen stammen aus Sekundärquellen ohne offengelegte Methodik; die Größenordnung ist plausibel, die exakten Werte behandle ich mit ±30 % Unsicherheit.

**Konsequenz für die Phasen 3–7:** „Local-first" bleibt als *Eigenschaft* nutzbar und ist Eriks technisches Heimspiel. Als *Kategorie* — „ein lokaler KI-Assistent, der deinen Bildschirm beobachtet" — ist sie geschlossen. Jedes Konzept ab Phase 3 muss den Test bestehen: **Ist das lokale Modell bei dieser konkreten Aufgabe der Cloud ebenbürtig oder überlegen? Und kann der Nutzer das Ergebnis in unter 10 Sekunden selbst überprüfen?** Wer beides nicht mit Ja beantwortet, ist in Phase 4 tot.

---

## Quellen

- [Apple Newsroom — Apple introduces Siri AI (08.06.2026)](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)
- [9to5Mac — Rewind Mac app shutting down following Meta acquisition](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/)
- [rewind.ai — What Happened to Rewind AI?](https://rewind.ai/what-happened-to-rewind/)
- [TechCrunch — a16z-backed Rewind pivots to build AI-powered pendant](https://techcrunch.com/2024/04/17/a16z-backed-rewind-pivots-to-build-ai-powered-pendant-to-record-your-conversations/)
- [Andrew Schreiber — An early adopter's thoughts on Rewind.ai's $350m pivot](https://andrewschreiber.substack.com/p/an-early-adopters-thoughts-on-rewindais)
- [digitalmarketreports — Meta Buys Limitless and Shuts Down Sales of Its AI Recording Pendant](https://digitalmarketreports.com/news/55791/meta-buys-limitless-and-shuts-down-sales-of-its-ai-recording-pendant/)
- [GitHub — screenpipe/screenpipe](https://github.com/screenpipe/screenpipe)
- [OpenRecall](https://openrecall.github.io/) · [Windrecorder](https://github.com/yuka-friends/Windrecorder)
- [Microsoft Learn — Manage Recall for Windows clients](https://learn.microsoft.com/en-us/windows/client-management/manage-recall)
- [TechTimes — OpenAI Kills Atlas Browser After 8 Months](https://www.techtimes.com/articles/320183/20260711/openai-kills-atlas-browser-after-8-months-what-replaces-it-what-users-must-do-now.htm)
- [AOL/Reuters — AI startup Humane to wind down wearable pin business, sell assets to HP](https://www.aol.com/news/ai-startup-humane-wind-down-124051163.html)
- [technowize — The Humane AI Pin's Shutdown Surprises No One](https://www.technowize.com/the-humane-ai-pin-shutdown-surprises-no-one-hp-walks-away-a-winner/)
- [digitalapplied — AI Product Failures 2026: Sora, Humane & Rabbit](https://www.digitalapplied.com/blog/ai-product-failures-2026-sora-humane-rabbit-lessons)
- [todayonmac — MacWhisper](https://www.todayonmac.com/macwhisper-your-private-transcription-assistant-that-never-phones-home/) · [getvoibe — MacWhisper Review](https://www.getvoibe.com/resources/macwhisper-review/) · [getvoibe — Superwhisper Review](https://www.getvoibe.com/resources/superwhisper-review/)
- [Tracxn — Raycast company profile](https://tracxn.com/d/companies/raycast/__VNiI9rqA4HFcosfhPf0QoAIcecG3jJRlMCseC8jQeOw) · [toolradar — Raycast Pricing 2026](https://toolradar.com/tools/raycast/pricing)
- [CleanShot X — Pricing](https://cleanshot.com/pricing)
- [Statista — Global consumer willingness to pay for data protection](https://www.statista.com/statistics/1023967/global-willingness-to-pay-monthly-fee-personal-data-protection/) · [Acquisti et al. (CMU)](https://www.heinz.cmu.edu/~acquisti/papers/acquisti-onlinepurchasing-privacy.pdf)
- [techstartups — Top AI Startups That Shut Down in 2025](https://techstartups.com/2025/12/09/top-ai-startups-that-shut-down-in-2025-what-founders-can-learn/) · [ideaproof — 319+ AI Startups That Failed](https://ideaproof.io/failures/ai-startups)

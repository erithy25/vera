# Phase 4 — Kill-Filter

44 Konzepte, sechs Filter, nacheinander angewendet. Jedes gestrichene Konzept mit einer Zeile Begründung.

**Ergebnis: 44 → 5.** Davon 3 uneingeschränkt, 2 bedingt.

Zusätzlich zu den sechs vorgegebenen Filtern habe ich den in Phase 2 hergeleiteten Test mitgeführt, weil er die Ursache von Veras Scheitern kodiert:

> **Parität-Test:** Ist das lokale/deterministische Verfahren bei dieser konkreten Aufgabe der Cloud *ebenbürtig oder überlegen* — und kann der Nutzer das Ergebnis in unter 10 Sekunden selbst überprüfen?

---

## Filter 1 — Constraint-Verletzung

Verletzt das Konzept einen harten Constraint aus Abschnitt 1?

| # | Konzept | † Begründung |
|---|---|---|
| A1 | Proctor | Käufer ist eine Bildungseinrichtung — Einkauf, Datenschutzbeauftragter, Rechtsabteilung. Klassischer Enterprise-Zyklus. Zusätzlich: ein Minderjähriger, der Überwachungsdaten anderer Minderjähriger verarbeitet, ist rechtlich unhaltbar. |
| A8 | Consent | Käufer ist ein Betriebsrat oder eine Gewerkschaft. Institutioneller Verkauf, kein Self-Serve. |
| D3 | Provenance | Der tatsächlich zahlende Käufer ist ein Security- oder Compliance-Team. Genau der verbotene Zyklus. |
| D4 | Sealbench | Käufer ist ein Institut oder Labor mit Jahresbudget und Beschaffungsprozess. |
| E7 | Licensecheck | Käufer ist explizit eine Rechtsabteilung — in der Aufgabenstellung namentlich ausgeschlossen. |
| E10 | Nightshift | Fremde Agentenläufe über Nacht zu betreiben heißt Infrastruktur, Support und Bereitschaft. Unvereinbar mit 10–15 h/Woche. |

**6 tot. 38 übrig.**

---

## Filter 2 — Akutheit

Sucht heute jemand aktiv nach einer Lösung (akut) — oder müsste man ihn erst vom Problem überzeugen (latent)?

| # | Konzept | † Begründung |
|---|---|---|
| A2 | Ledger | Versicherungsförmig: der Schmerz entsteht im Streitfall, aber da braucht man die Aufzeichnung von *vorher*. Niemand kauft prophylaktisch. |
| A6 | Studybank | Latent. Schüler suchen nicht nach besseren Wiederholungskarten, sie suchen nach weniger Lernen. |
| A7 | Tabmemory | Latent. Die Browser-Historie ist seit 20 Jahren nutzlos und niemand hat je dafür gezahlt, das zu ändern. |
| B8 | PermissionLens | Neugier, kein Schmerz. Niemand wacht mit diesem Problem auf. |
| C2 | Clipvault | Latent. Dass Clipboard-Manager Passwörter im Klartext halten, ist bekannt und wird bewusst ignoriert. |
| C4 | Focusproof | Latent, und die Kategorie (RescueTime) schrumpft seit Jahren. |
| C7 | Handoff | Im Konzept selbst schon als schwer verkäuflich markiert. Kontextverlust ist real, aber niemand sucht danach. |
| D9 | Attest | Für die breite Zielgruppe latent. Zeitstempel-Beweise sucht man erst, wenn es zu spät ist. |
| E1 | Contextlint | Latent. Niemand weiß, dass seine Agenten-Regeldateien wirkungslos sind — man müsste ihn erst überzeugen. |
| E3 | Deadcode | Latent. Toter Code tut nicht weh, er liegt nur herum. |
| E11 | Handbrake | Der Schmerz ist punktuell und selten, nicht wiederkehrend. Man abonniert keinen Not-Aus. Und `Ctrl+C` existiert. |

**11 tot. 27 übrig.**

---

## Filter 3 — Zahlungs-Filter

Gibt es einen belegbaren Präzedenzfall, dass jemand dafür Geld ausgibt?

| # | Konzept | † Begründung |
|---|---|---|
| B2 | vault-rs | Duale Lizenzierung eines Rust-Crates durch einen Solo-Entwickler: praktisch kein Präzedenzfall. Bleibt ein Reputations-Asset, kein Umsatz. |
| B4 | ocr-fast | Im Konzept selbst mit „zahlt: nichts" angesetzt. Kein Geschäft. |
| B5 | tauri-sidecar | Ebenso. Reines Reputationsspiel. |
| B6 | secretgrep | Bibliotheks-Monetarisierung für einen Einzelentwickler: kein tragfähiger Präzedenzfall. |
| B7 | framedb | Kein Umsatzmodell, kein Käufer. |
| D6 | Buildproof | Sponsoring-Modell. Kein Umsatz. |
| E6 | Modelmeter | Als Lead-Magnet konzipiert — ein Lead-Magnet ohne Produkt dahinter ist kein Geschäft. |

**7 tot. 20 übrig.**

---

## Filter 4 — Besetzt-Filter (Websuche verpflichtend)

Gibt es einen gut finanzierten oder etablierten Anbieter, der genau das macht? Wenn ja: existiert eine strukturelle Counter-Position, die er nicht kopieren kann?

| # | Konzept | † Begründung (mit Recherche) |
|---|---|---|
| B1 | Redactor | Gesättigt. [BlurData](https://blurdata.app/), [Pixera](https://pixeratools.com/redact-screenshots-mac/), Xnapper, CleanShot X — BlurData betreibt sogar eine [Vergleichsseite über „jedes Mac-Redaction-Tool 2026"](https://blurdata.app/alternatives). Keine Counter-Position erkennbar. |
| C1 | Cleanlog | Derselbe Cluster, plus gitleaks/trufflehog kostenlos. |
| C3 | Demomode | Derselbe Cluster (Xnapper, BlurData decken den Anwendungsfall statisch ab). |
| A3 | Rewind-for-Bugs | Massiv besetzt: [Jam.dev](https://jam.dev/), LogRocket, ngram, Requestly, BetterBugs, IssueCapture. Sechs Anbieter, mehrere finanziert. |
| A4 | SOP-Maker | Scribe und Tango dominieren — **aber beide sind browserbasiert.** Native macOS-Apps sind eine echte Lücke. → **überlebt bedingt**, siehe unten. |
| B3 | Notarize | Tauri liefert Notarization inzwischen [im Framework selbst](https://v2.tauri.app/distribute/sign/macos/) („handles notarization automatically during the build process"), inklusive `tauri-macos-sign`-Crate. Das Problem, das Erik gelöst hat, löst das Framework jetzt für alle. |
| D8 | MCP-Audit | Besetzt und gratis: MCP-Scan v0.4.3, [Cisco mcp-scanner v4.3.0](https://arxiv.org/html/2603.21641v1), MCPTox, MindGuard, `@hailbytes/mcp-security-scanner`. |
| E5 | Cronwatch | Healthchecks.io, Cronitor, Better Stack — etabliert und billig. |
| E9 | Pipelock | Socket.dev, gut finanziert, plus npm-Provenance nativ. |
| E12 | Schoolproof | [Grammarly Authorship](https://fast.io/resources/grammarly-ai-detector-review-2026/) macht exakt das — **kostenlos mit Account**. |
| C6 | Diskmap | DaisyDisk (etabliert, bezahlt), GrandPerspective (gratis). |

**10 tot (A4 bedingt weiter). 10 übrig.**

---

## Filter 5 — Sherlock-Filter

Würde Apple, OpenAI oder Anthropic das in der nächsten Version einfach mitliefern?

| # | Konzept | † Begründung |
|---|---|---|
| E4 | Snapshot | **Bereits passiert.** Claude Code hat seit v2.0 [Checkpointing und `/rewind`](https://code.claude.com/docs/en/checkpointing) (ESC ×2); Cursor hat Checkpoints. Das Produkt existiert bereits im Werkzeug. |
| D5 | Agentcage | Sandboxing wird von den Agenten-Anbietern nativ ausgeliefert. Ein Drittanbieter-Käfig um einen Agenten, der schon einen hat, verkauft sich nicht. |
| D7 | Tokenwatch | Doppelt tot: Anbieter liefern eigene Dashboards **und** [ccusage](https://ccusage.com/), CodeBurn (31 Werkzeuge), Claude Usage Tracker (MIT) sind kostenlos. |
| E8 | Localsearch | **Bereits passiert.** Apple hat am 08.06.2026 semantische, kontextbewusste Suche in Spotlight integriert (Siri AI, macOS 27). |
| D2 | Replay | Deterministische Wiederholung von Agentenläufen ist genau die Funktion, die die Anbieter selbst brauchen und liefern werden — und sie kontrollieren die Schnittstelle. → **überlebt bedingt**, weil ein anbieterneutraler Proxy sie nicht braucht. |

**4 tot (D2 bedingt weiter). 6 übrig.**

---

## Filter 6 — Gratis-Filter

Gibt es eine gute Open-Source-Alternative, die das kostenlos tut?

| # | Konzept | † Begründung |
|---|---|---|
| C5 | Envguard | gitleaks, git-secrets, pre-commit-Hooks — kostenlos, etabliert, gut. Keine überzeugende Gegenposition. |

**1 tot. 5 übrig.**

---

## Die Überlebenden

### Uneingeschränkt

**Ü1 · BLACKBOX** *(D1)* — Manipulationssicherer Hash-Chain-Ausführungsnachweis für Coding-Agenten: jeder Tool-Call, jede Dateiänderung, jeder Prozess-Exit in einer kryptografisch verketteten, nachträglich nicht änderbaren Aufzeichnung.
*Warum es überlebt:* Der Besetzt-Filter greift nicht, obwohl das Feld voll aussieht. Braintrust, LangSmith, Helicone und Datadog machen **Observability für LLM-Anwendungsentwickler** — Traces, Kosten, Latenz. Und die Anbieter selbst liefern inzwischen Audit-Logs *in* Cursor, Claude Code und Copilot ([Augment Code](https://www.augmentcode.com/tools/best-ai-agent-observability-tools)). Beides hat dieselbe strukturelle Schwäche: **es ist Selbstauskunft.** Ein Log, das der Agentenanbieter über seinen eigenen Agenten führt, taugt nicht als Nachweis gegenüber Dritten, und keiner dieser Anbieter macht Manipulationssicherheit. Die Counter-Position ist damit strukturell und nicht durch bessere Ausführung: **anbieterneutral + kryptografisch nicht abstreitbar.** Kein Agentenanbieter wird das bauen, weil kein Anbieter ein Interesse daran hat, dass sein Agent von außen überprüfbar wird.
*Parität-Test:* bestanden. Hash-Ketten brauchen kein Modell; die Verifikation ist deterministisch und in Sekunden prüfbar.

**Ü2 · Difftruth** *(E2)* — Prüft bei einem AI-generierten Pull Request, welche Behauptungen des Agenten stimmen: wurden die Tests wirklich ausgeführt, ist der Build wirklich grün, wurde wirklich das geändert, was im Text steht.
*Warum es überlebt:* Der Schmerz ist dokumentiert akut — Agenten [erzeugen Erfolgsmeldungen als Ausgabemuster, unabhängig vom tatsächlichen Zustand](https://dev.to/moonrunnerkc/ai-coding-agents-lie-about-their-work-outcome-based-verification-catches-it-12b4). Bei 41 % AI-generiertem Code trifft das jeden Reviewer täglich.
*Einschränkung, die ich nicht verschweige:* **Mantiz** existiert bereits und adressiert genau das (Erkennung, wenn Agenten Tests deaktivieren oder Assertions aushebeln). Der Ansatz ist aber ein KI-Detektor — also selbst wieder probabilistisch. Die Gegenposition wäre ein deterministischer Ausführungsnachweis statt einer Erkennung.
*Anmerkung:* Ü1 und Ü2 sind technisch dasselbe Fundament mit zwei verschiedenen Käufern und Vertriebswegen. Das ist kein Zufall — die Divergenz ist hier konvergiert. Phase 5 behandelt sie getrennt, weil ACV und Go-to-Market sich stark unterscheiden.

**Ü3 · ShareGuard** *(A5)* — Live-Redaction beim Bildschirmteilen: erkennt und schwärzt Secrets, Tokens und Notifications in Echtzeit im geteilten Bild.
*Warum es überlebt:* Der Redaction-Cluster ist bei **statischen** Screenshots gesättigt — bei **Live-Streams** ist er leer. Das ist ein anderes technisches Problem (Echtzeit-Compositing, virtuelle Anzeigequelle) und deshalb keine Konkurrenz, sondern eine Nachbarkategorie. macOS-Focus-Modi unterdrücken Notifications, aber nichts unterdrückt ein Token im Terminal.
*Parität-Test:* bestanden, und zwar besonders klar — es wird **überhaupt kein Sprachmodell benötigt**, nur OCR plus Regex plus Entropie. Der Nutzer sieht die Schwärzung sofort.
*Erik-Passung:* ScreenCaptureKit, Vision-OCR, Redaction-Engine und Compositing hat er alle schon gebaut.

### Bedingt

**Ü4 · Replay** *(D2)* — Anbieterneutraler lokaler Proxy, der Agentenläufe aufzeichnet und deterministisch wiederholbar macht.
*Bedingung:* Überlebt nur, weil ein Proxy vor der API keine Kooperation des Anbieters braucht. Nähe zu Ü1 ist groß; wenn Phase 5 zeigt, dass es dieselbe Wette mit mehr technischem Risiko ist, fällt es weg.

**Ü5 · SOP-Maker nativ** *(A4)* — Bebilderte Prozessdokumentation aus einer aufgezeichneten Sitzung, für **native macOS-Apps**, nicht nur den Browser.
*Bedingung:* Überlebt nur wegen der echten Lücke bei nativen Anwendungen. Schwerste Schwäche: der Käufer ist kein Entwickler und hält sich nicht auf HN, Reddit oder GitHub auf — das kollidiert direkt mit dem Distributions-Constraint. Bleibt drin, damit Phase 5 mindestens einen Kandidaten mit nicht-technischem Käufer bewerten kann.

---

## Was der Filter über das Suchfeld verrät

Drei Muster, die für Phase 5 und 7 wichtig sind:

1. **Alles, was ein „nettes Werkzeug für Entwickler" ist, stirbt am Gratis-Filter.** Sieben Konzepte fielen, weil ein kostenloses OSS-Äquivalent existiert. Bei Entwicklern als Zielgruppe ist die Zahlungsbereitschaft nur dort vorhanden, wo etwas *nachweisbar* ist, das man selbst nicht bauen will — nicht dort, wo etwas *bequem* ist.
2. **Alles, was der Agentenanbieter selbst liefern könnte, ist bereits tot oder wird es.** Vier Konzepte fielen am Sherlock-Filter, zwei davon (`Snapshot`, `Localsearch`) waren zum Zeitpunkt der Prüfung **bereits ausgeliefert**. Das ist dieselbe Dynamik, die Vera getötet hat.
3. **Die einzigen Überlebenden teilen eine Eigenschaft: sie produzieren einen Nachweis, den der Anbieter der Sache selbst strukturell nicht liefern kann.** Ein Agentenanbieter kann seinen Agenten nicht glaubwürdig selbst auditieren. Ein Screenshot-Werkzeug kann keinen Live-Stream schwärzen. Das ist keine Ausführungs-Überlegenheit, sondern eine Positions-Überlegenheit — und damit das einzige, was den Moat-Test in Phase 7 überhaupt bestehen kann.

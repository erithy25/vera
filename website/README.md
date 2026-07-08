# Vera — Website

Die Marketing-Site für Vera: automatische Zeiterfassung, die Kunden zuordnet
und Leistungsbeschreibungen schreibt — 100 % auf dem Gerät. Eine kleine
Vite + React + Tailwind-4-Site mit Veras warmen Monochrom-Design-Tokens.

## Lokal starten

```bash
cd website
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # baut nach website/dist (inkl. TypeScript-Check)
npm run preview    # Production-Build lokal ansehen
```

## Warteliste konfigurieren (Pflicht vor dem Deploy)

Das Wartelisten-Formular schickt einen JSON-POST an einen
Formspree-kompatiblen Endpoint. Der Endpoint kommt aus der
Build-Umgebungsvariable `VITE_WAITLIST_ENDPOINT`:

1. Auf https://formspree.io ein kostenloses Formular anlegen (2 Minuten),
   die Endpoint-URL kopieren (Form: `https://formspree.io/f/<id>`).
2. Beim Deploy (z. B. Vercel → Project → Settings → Environment Variables)
   `VITE_WAITLIST_ENDPOINT=https://formspree.io/f/<id>` setzen.
3. Neu deployen.

Ohne gesetzten Endpoint zeigt das Formular beim Absenden eine ehrliche
Fehlermeldung — es gehen keine Eingaben stillschweigend verloren.

Jede Anmeldung enthält: `email`, `variant` (A/B-Hero-Variante `geld` oder
`privacy`), `segment` (Mehrfachauswahl), `kanzlei_interesse` (Checkbox für
die Kanzlei-Edition) und `quelle` (`hero` oder `formular`).

## A/B-Test der Hero-Botschaft

- Standard (`/`): Geld-Variante — "Vera holt dir verlorene abrechenbare
  Stunden zurück."
- `/?v=privacy`: Privacy-Variante — "Die einzige KI-Zeiterfassung, bei der
  kein Byte dein Gerät verlässt."

Die Variante wird bei jeder Wartelisten-Anmeldung mitgesendet und lässt sich
so direkt in den Formular-Daten auswerten.

## Deploy zu Vercel

Die Site ist eine Standard-Vite-App, Vercel erkennt sie automatisch.

1. Das Repo `erithy25/vera` in Vercel importieren.
2. **Root Directory** auf `website` setzen.
3. Framework-Preset: **Vite** (automatisch). Build `npm run build`,
   Output `dist` (beides vorausgefüllt).
4. `VITE_WAITLIST_ENDPOINT` als Environment Variable setzen (siehe oben).
5. Deployen.

## Downloads & Auto-Updater (nicht anfassen)

`public/downloads/` (DMG/tar.gz) und `public/updater/latest.json` werden vom
Auto-Updater **bestehender** Vera-Installationen abgefragt. Diese Pfade
bleiben unverändert liegen und werden erst mit dem nächsten Release
(Umbauplan Schicht 6) neu befüllt — dann kehrt auch der Download-Button auf
die Site zurück. Veröffentlichung wie gehabt:

```bash
# vom Repo-Root, nach `npm run tauri build`
cp src-tauri/target/release/bundle/dmg/Vera_*.dmg website/public/downloads/Vera.dmg
git add website/public/downloads/Vera.dmg && git commit -m "Publish latest Vera DMG"
```

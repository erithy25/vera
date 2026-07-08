import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Vera Marketing-Site — Landingpage für den Abrechnungs-Copiloten, in Veras
// warmem Monochrom-Design. Aufbau nach Umbauplan Schicht 0: Hero mit
// Warteliste → So funktioniert es → Geld-Rechner → Privacy-Band →
// Zielgruppen → Warteliste (voll) → FAQ → Footer.
// Der Download-Button erscheint erst wieder mit dem Release (Schicht 6);
// /downloads und /updater bleiben für bestehende Installationen unberührt.
// ---------------------------------------------------------------------------

const REPO = "erithy25/vera";

// Wartelisten-Endpoint (Formspree-kompatibel, nimmt JSON-POSTs an).
// Wird beim Build über die Umgebungsvariable VITE_WAITLIST_ENDPOINT gesetzt —
// siehe website/README.md. Ohne Endpoint zeigt das Formular einen ehrlichen
// Fehler statt Eingaben stillschweigend zu verwerfen.
const WAITLIST_ENDPOINT: string = import.meta.env.VITE_WAITLIST_ENDPOINT ?? "";

// A/B-Variante der Hero-Botschaft: Standard "geld", per ?v=privacy die
// Privacy-Variante. Die Variante wandert mit in jede Wartelisten-Anmeldung.
function getVariant(): "geld" | "privacy" {
  if (typeof window === "undefined") return "geld";
  return new URLSearchParams(window.location.search).get("v") === "privacy"
    ? "privacy"
    : "geld";
}

// --- Icons (inline, Lucide-artige Striche — passend zur Desktop-App) ---

const VMark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4l8 16 8-16" />
    <path d="M8 4l4 8 4-8" />
  </svg>
);

type IconProps = { size?: number };
const ClockIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const TagIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="8.5" cy="8.5" r="1.4" /></svg>
);
const ReceiptIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" /><path d="M9.5 8h5M9.5 12h5" /></svg>
);
const LockIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
);
const BriefcaseIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /></svg>
);
const CompassIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></svg>
);
const PenIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 4.5l5 5L8 21H3v-5L14.5 4.5z" /><path d="M12.5 6.5l5 5" /></svg>
);
const CheckIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" /></svg>
);

// --- Warteliste ---

type SubmitState = "idle" | "sending" | "ok" | "error";

interface WaitlistPayload {
  email: string;
  variant: string;
  segment: string[];
  kanzlei_interesse: boolean;
  quelle: string;
}

async function submitWaitlist(payload: WaitlistPayload): Promise<boolean> {
  if (!WAITLIST_ENDPOINT) return false;
  try {
    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Kompaktes E-Mail-Feld für den Hero — meldet direkt an (Variante inklusive).
function HeroWaitlist({ variant }: { variant: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("sending");
    const ok = await submitWaitlist({
      email,
      variant,
      segment: [],
      kanzlei_interesse: false,
      quelle: "hero",
    });
    setState(ok ? "ok" : "error");
  }

  if (state === "ok") {
    return (
      <div className="flex items-center gap-2 font-sans text-[15px] text-text-primary bg-card-surface border border-border-hairline rounded-xl px-5 py-3">
        <CheckIcon /> Du stehst auf der Warteliste — wir melden uns.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[440px] flex flex-col items-stretch gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.de"
          aria-label="E-Mail-Adresse für die Warteliste"
          className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-border-hairline bg-card-surface font-sans text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-text-muted"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="h-12 px-5 rounded-xl bg-text-primary text-card-surface font-sans font-medium text-[15px] cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60 whitespace-nowrap"
        >
          {state === "sending" ? "Sende…" : "Auf die Warteliste"}
        </button>
      </div>
      {state === "error" && (
        <span className="font-sans text-[13px] text-text-muted">
          Das hat gerade nicht geklappt — bitte versuch es unten im Formular noch einmal.
        </span>
      )}
      <span className="font-sans text-[12px] text-text-faint">
        Beta zuerst für die Warteliste · macOS · kein Account nötig
      </span>
    </form>
  );
}

// Volles Wartelisten-Formular mit Segment- und Kanzlei-Abfrage.
function WaitlistForm({ variant }: { variant: string }) {
  const [email, setEmail] = useState("");
  const [segments, setSegments] = useState<string[]>([]);
  const [kanzlei, setKanzlei] = useState(false);
  const [state, setState] = useState<SubmitState>("idle");

  const segmentOptions = [
    "Agentur / Studio",
    "Beratung / Consulting",
    "Freelancer",
    "Kanzlei / Steuerberatung",
    "Anderes",
  ];

  function toggleSegment(s: string) {
    setSegments((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("sending");
    const ok = await submitWaitlist({
      email,
      variant,
      segment: segments,
      kanzlei_interesse: kanzlei,
      quelle: "formular",
    });
    setState(ok ? "ok" : "error");
  }

  if (state === "ok") {
    return (
      <div className="card-style px-8 py-12 flex flex-col items-center text-center gap-3">
        <span className="w-10 h-10 rounded-full bg-text-primary text-card-surface flex items-center justify-center"><CheckIcon size={18} /></span>
        <h3 className="font-serif text-[26px] text-text-primary">Du bist dabei.</h3>
        <p className="font-sans text-[15px] text-text-muted max-w-[420px] leading-relaxed">
          Wir melden uns, sobald deine Beta bereitsteht. Bis dahin: Wenn du uns 15 Minuten
          zu deiner heutigen Zeiterfassung erzählen magst, antworte einfach auf die Bestätigungs-Mail.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-style px-6 sm:px-10 py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="wl-email" className="font-sans text-[13px] font-medium text-text-primary">E-Mail</label>
        <input
          id="wl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.de"
          className="h-12 px-4 rounded-xl border border-border-hairline bg-bg-warm font-sans text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-text-muted"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="font-sans text-[13px] font-medium text-text-primary">Womit verdienst du dein Geld? <span className="text-text-faint font-normal">(optional)</span></span>
        <div className="flex flex-wrap gap-2">
          {segmentOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSegment(s)}
              aria-pressed={segments.includes(s)}
              className={`px-3.5 py-2 rounded-lg border font-sans text-[13px] cursor-pointer transition-colors ${
                segments.includes(s)
                  ? "bg-text-primary text-card-surface border-text-primary"
                  : "bg-bg-warm text-text-muted border-border-hairline hover:text-text-primary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={kanzlei}
          onChange={(e) => setKanzlei(e.target.checked)}
          className="mt-1 w-4 h-4 cursor-pointer"
          style={{ accentColor: "#1c1c1a" }}
        />
        <span className="font-sans text-[13.5px] text-text-muted leading-relaxed">
          Ich interessiere mich für die <strong className="text-text-primary font-medium">Kanzlei-Edition</strong> (Windows,
          DATEV-/RA-MICRO-Export) und möchte informiert werden, sobald sie kommt.
        </span>
      </label>

      <button
        type="submit"
        disabled={state === "sending"}
        className="h-12 rounded-xl bg-text-primary text-card-surface font-sans font-medium text-[15px] cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60"
      >
        {state === "sending" ? "Sende…" : "Auf die Warteliste"}
      </button>

      {state === "error" && (
        <span className="font-sans text-[13px] text-text-muted text-center">
          Die Anmeldung ist gerade nicht erreichbar. Bitte versuch es in ein paar Minuten erneut.
        </span>
      )}
      <span className="font-sans text-[12px] text-text-faint text-center">
        Nur für die Warteliste — keine Werbung, jederzeit austragbar.
      </span>
    </form>
  );
}

// --- Produkt-Vorschau: der Tages-Review, wie ihn die neue Vera zeigt ---

function VeraWindow() {
  const blocks = [
    { zeit: "09:04 – 10:38", app: "Figma · kunde-nord.de", projekt: "Nordwind — Website Relaunch", konfidenz: "94 %", dauer: "1 h 34 m" },
    { zeit: "10:41 – 11:12", app: "Mail · Angebot_v2.pdf", projekt: "Bergmann Consulting — Angebot", konfidenz: "88 %", dauer: "31 m" },
    { zeit: "11:15 – 11:29", app: "Slack · #kunde-nord", projekt: "Nordwind — Website Relaunch", konfidenz: "91 %", dauer: "14 m" },
  ];
  return (
    <div className="relative w-full max-w-[780px] mx-auto">
      <div aria-hidden="true" className="absolute -inset-x-12 -top-12 bottom-0 -z-10 blur-3xl opacity-70" style={{ background: "radial-gradient(55% 55% at 50% 0%, rgba(210,207,198,0.6) 0%, rgba(247,246,243,0) 72%)" }} />
      <div className="card-style overflow-hidden shadow-[0_30px_70px_-24px_rgba(28,28,26,0.22)]">
        <div className="h-11 flex items-center px-4 border-b border-border-hairline relative">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#E6E4DD]" />
            <span className="w-3 h-3 rounded-full bg-[#E6E4DD]" />
            <span className="w-3 h-3 rounded-full bg-[#E6E4DD]" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 font-serif text-[14px] text-text-muted">Vera — Heute</span>
        </div>
        <div className="bg-bg-warm px-5 sm:px-8 py-7 flex flex-col gap-3">
          {blocks.map((b) => (
            <div key={b.zeit} className="card-style px-4 sm:px-5 py-3.5 flex items-center gap-4">
              <div className="flex flex-col min-w-[92px] shrink-0">
                <span className="font-sans text-[12px] text-text-muted tabular-nums">{b.zeit}</span>
                <span className="font-sans text-[11px] text-text-faint tabular-nums">{b.dauer}</span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-sans text-[13px] text-text-primary font-medium truncate">{b.projekt}</span>
                <span className="font-sans text-[12px] text-text-faint truncate">{b.app}</span>
              </div>
              <span className="hidden sm:inline font-sans text-[11px] px-2 py-1 rounded bg-active-hover text-text-muted border border-border-hairline shrink-0">{b.konfidenz}</span>
            </div>
          ))}
          <div className="card-style px-4 sm:px-5 py-4 flex flex-col gap-2">
            <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">Entwurf · Leistungsbeschreibung</span>
            <p className="font-serif text-[15.5px] text-text-muted italic leading-relaxed">
              „Überarbeitung der Startseiten-Layouts und Abstimmung der Designvarianten für den Website-Relaunch; Rückfragen des Kunden im Projektkanal beantwortet.“
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-sans text-[12px] text-text-faint">Nordwind — Website Relaunch · 1 h 48 m · 216 €</span>
              <span className="font-sans text-[12px] px-3 py-1.5 rounded-lg bg-text-primary text-card-surface">Tag abschließen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Geld-Rechner ---

function formatEuro(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function MoneyCalculator() {
  const [stundensatz, setStundensatz] = useState(120);
  const [minuten, setMinuten] = useState(20);
  const TAGE_PRO_JAHR = 220; // abrechenbare Arbeitstage

  const proJahr = useMemo(
    () => Math.round((stundensatz * minuten * TAGE_PRO_JAHR) / 60),
    [stundensatz, minuten]
  );

  return (
    <div className="card-style px-6 sm:px-10 py-10 flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="satz" className="font-sans text-[13px] font-medium text-text-primary">Dein Stundensatz</label>
            <span className="font-serif text-[22px] text-text-primary tabular-nums">{formatEuro(stundensatz)}</span>
          </div>
          <input
            id="satz"
            type="range"
            min={30}
            max={400}
            step={5}
            value={stundensatz}
            onChange={(e) => setStundensatz(Number(e.target.value))}
            className="w-full cursor-pointer"
            style={{ accentColor: "#1c1c1a" }}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="min" className="font-sans text-[13px] font-medium text-text-primary">Vergessene Minuten pro Tag</label>
            <span className="font-serif text-[22px] text-text-primary tabular-nums">{minuten} min</span>
          </div>
          <input
            id="min"
            type="range"
            min={5}
            max={60}
            step={5}
            value={minuten}
            onChange={(e) => setMinuten(Number(e.target.value))}
            className="w-full cursor-pointer"
            style={{ accentColor: "#1c1c1a" }}
          />
        </div>
      </div>
      <div className="flex flex-col items-center text-center gap-1 border-t border-border-hairline pt-8">
        <span className="font-sans text-[13px] text-text-muted">Nicht erfasste Zeit kostet dich pro Jahr</span>
        <span className="font-serif text-[clamp(40px,7vw,64px)] leading-none tracking-tight text-text-primary tabular-nums">{formatEuro(proJahr)}</span>
        <span className="font-sans text-[12px] text-text-faint mt-2">Annahme: {TAGE_PRO_JAHR} abrechenbare Tage im Jahr. Kurze Anrufe, Slack-Antworten, „nur schnell drübergeschaut“ — genau die Zeit, die in manueller Erfassung verloren geht.</span>
      </div>
    </div>
  );
}

// --- FAQ ---

const faqs = [
  {
    q: "Verlassen meine Daten wirklich nie das Gerät?",
    a: "Ja — und zwar architektonisch, nicht als Versprechen. Erfassung, Texterkennung, Datenbank und das KI-Modell (über Ollama) laufen vollständig auf deinem Mac; die Datenbank ist verschlüsselt. Es gibt keinen Account, keinen Server, keine Telemetrie. Der einzige Netzwerk-Kontakt der App ist die Update-Prüfung — und später die Lizenzprüfung beim Kauf.",
  },
  {
    q: "Welche Berechtigungen braucht Vera?",
    a: "Bildschirmaufnahme und Bedienungshilfen, damit Vera Fenster und Inhalte lokal auswerten kann. macOS fragt diese Freigabe aus Sicherheitsgründen etwa einmal im Monat neu ab — das ist normal, Vera weist dich rechtzeitig darauf hin und erklärt jeden Schritt.",
  },
  {
    q: "Was sieht Vera — und was nicht?",
    a: "Vera wertet aus, in welcher App, welchem Dokument und auf welcher Seite du arbeitest, um daraus Zeitblöcke zu bauen. Passwort-Manager sind ab Werk ausgeschlossen; eigene Apps und Domains kannst du jederzeit ausschließen, sensible Muster (Karten, IBANs, Schlüssel) werden automatisch geschwärzt, und mit einem Klick pausierst du die Erfassung komplett. Rohdaten verfallen nach einstellbarer Frist — deine Zeitblöcke bleiben.",
  },
  {
    q: "Brauche ich dafür Extra-Hardware oder ein Abo bei einem KI-Anbieter?",
    a: "Nein. Vera nutzt Ollama (kostenlos) mit einem lokalen Modell und richtet das beim Start mit dir ein. Empfohlen ist ein Mac mit Apple Silicon; je mehr Arbeitsspeicher, desto besser die Formulierungen.",
  },
  {
    q: "Funktioniert Vera offline?",
    a: "Ja. Erfassen, Zuordnen und Formulieren funktionieren ohne Internetverbindung — es gibt schlicht nichts, was eine Verbindung bräuchte.",
  },
  {
    q: "Was wird Vera kosten?",
    a: "Geplant ist ein Abo ab 19 € pro Monat — eine einzige wiedergefundene Stunde zahlt davon mehrere Monate. Die Warteliste bekommt die Beta zuerst und einen Frühbucher-Preis.",
  },
  {
    q: "Ich arbeite in einer Kanzlei auf Windows — was ist mit mir?",
    a: "Die Kanzlei-Edition (Windows, DATEV-/RA-MICRO-Export, 6-Minuten-Taktung) ist in Vorbereitung. Setz im Wartelisten-Formular den Haken bei Kanzlei-Edition, dann gehörst du zu den Ersten, die sie testen.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border-hairline">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-4 py-5 text-left cursor-pointer group">
        <span className="font-serif text-[18px] sm:text-[20px] text-text-primary">{q}</span>
        <span className={`text-text-muted transition-transform duration-200 shrink-0 ${open ? "rotate-45" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </span>
      </button>
      {open && <p className="font-sans text-[14px] sm:text-[15px] text-text-muted leading-relaxed pb-6 max-w-[680px]">{a}</p>}
    </div>
  );
}

// --- Seite ---

const steps = [
  {
    n: "01",
    icon: <ClockIcon />,
    title: "Erfassen",
    body: "Vera läuft leise im Hintergrund und baut aus deinem Arbeitstag lückenlose Zeitblöcke — lokal und verschlüsselt, ohne Timer, ohne Zettel.",
  },
  {
    n: "02",
    icon: <TagIcon />,
    title: "Zuordnen",
    body: "Ein lokales KI-Modell erkennt am Inhalt, für welchen Kunden und welches Projekt ein Block war — und lernt aus jeder Korrektur.",
  },
  {
    n: "03",
    icon: <ReceiptIcon />,
    title: "Abrechnen",
    body: "Vera schreibt abrechnungsfertige Leistungsbeschreibungen. Du bestätigst in drei Minuten deinen Tag und exportierst in dein Abrechnungssystem.",
  },
];

const zielgruppen = [
  {
    icon: <BriefcaseIcon />,
    title: "Agenturen & Studios",
    body: "Projektwechsel im Minutentakt, Retainer und Festpreise nebeneinander — Vera hält fest, wohin die Stunden wirklich gehen, und liefert saubere Nachweise für jeden Kunden.",
  },
  {
    icon: <CompassIcon />,
    title: "Beratungen & Consultants",
    body: "Zwischen Calls, Decks und Mandanten-Mails verdunstet abrechenbare Zeit. Vera rekonstruiert den Tag inhaltlich und macht daraus belastbare, formulierte Einträge.",
  },
  {
    icon: <PenIcon />,
    title: "Freelancer",
    body: "Du willst arbeiten, nicht Buch führen. Vera erfasst nebenbei, du bestätigst abends — und keine halbe Stunde „kurz noch was gefixt“ bleibt mehr unbezahlt.",
  },
];

const heroCopy = {
  geld: {
    eyebrow: "Automatische Zeiterfassung für Abrechner",
    h1: "Vera holt dir verlorene abrechenbare Stunden zurück.",
    sub: "Automatische Zeiterfassung, die deinen Tag versteht und deine Leistungsbeschreibungen schreibt — 100 % auf deinem Mac. Kein Byte verlässt das Gerät.",
  },
  privacy: {
    eyebrow: "Zeiterfassung ohne Cloud",
    h1: "Die einzige KI-Zeiterfassung, bei der kein Byte dein Gerät verlässt.",
    sub: "Vera versteht deinen Arbeitstag, ordnet ihn Kunden zu und schreibt deine Leistungsbeschreibungen — komplett lokal auf deinem Mac. Und holt dir dabei die Stunden zurück, die manuelle Erfassung verliert.",
  },
} as const;

export function App() {
  const variant = getVariant();
  const hero = heroCopy[variant];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Sticky Nav */}
      <header className="sticky top-0 z-50 bg-bg-warm/80 backdrop-blur-md border-b border-border-hairline/70">
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
            <span className="text-text-primary"><VMark size={19} /></span>
            <span className="font-serif text-[21px] tracking-tight">Vera</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 font-sans text-[13px] text-text-muted">
            <a href="#how" className="hover:text-text-primary transition-colors">So funktioniert es</a>
            <a href="#rechner" className="hover:text-text-primary transition-colors">Rechner</a>
            <a href="#privat" className="hover:text-text-primary transition-colors">Privatsphäre</a>
            <a href="#faq" className="hover:text-text-primary transition-colors">FAQ</a>
          </nav>
          <a href="#warteliste" className="inline-flex items-center justify-center rounded-xl font-sans font-medium border border-border-hairline text-text-primary hover:bg-active-hover text-[13px] px-4 py-2 transition-all cursor-pointer no-underline">
            Warteliste
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-20 sm:pt-28 flex flex-col items-center text-center">
          <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">{hero.eyebrow}</span>
          <h1 className="font-serif text-[clamp(40px,7.5vw,76px)] leading-[1.02] tracking-tight mt-5 max-w-[880px]">{hero.h1}</h1>
          <p className="font-sans text-[17px] sm:text-[19px] text-text-muted leading-relaxed max-w-[620px] mt-6">{hero.sub}</p>
          <div className="mt-9 w-full flex justify-center">
            <HeroWaitlist variant={variant} />
          </div>
        </section>

        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-16 sm:mt-20">
          <VeraWindow />
        </section>

        {/* So funktioniert es */}
        <section id="how" className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">So funktioniert es</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Du arbeitest. Vera rechnet ab.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {steps.map((s) => (
              <div key={s.n} className="card-style p-7 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">{s.icon}</div>
                  <span className="font-serif text-[34px] text-text-faint leading-none">{s.n}</span>
                </div>
                <h3 className="font-serif text-[20px] text-text-primary mt-1">{s.title}</h3>
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Geld-Rechner */}
        <section id="rechner" className="max-w-[920px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-10">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Der Rechner</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Was kostet dich vergessene Zeit?</h2>
          </div>
          <MoneyCalculator />
        </section>

        {/* Privacy-Band (dunkel) */}
        <section id="privat" className="mt-28 sm:mt-40 scroll-mt-20">
          <div className="bg-text-primary text-card-surface">
            <div className="max-w-[1120px] mx-auto px-6 sm:px-10 py-24 sm:py-32 flex flex-col items-center text-center">
              <span className="text-card-surface/60"><LockIcon size={26} /></span>
              <h2 className="font-serif text-[clamp(34px,6vw,60px)] leading-[1.05] tracking-tight mt-6 max-w-[820px]">
                Kein Account. Kein Server. Kein Byte verlässt dein Gerät.
              </h2>
              <p className="font-sans text-[16px] sm:text-[18px] text-card-surface/70 leading-relaxed max-w-[640px] mt-6">
                Andere KI-Zeiterfassungen schicken deine Arbeitsinhalte — Mandanten, Kunden, Verträge — in ihre Cloud.
                Vera nicht: Erfassung, verschlüsselte Datenbank und das KI-Modell laufen vollständig auf deinem Mac.
                Nicht als Einstellung, sondern als Architektur.
              </p>
              <p className="font-sans text-[14px] text-card-surface/50 leading-relaxed max-w-[640px] mt-5">
                Warum das zählt: 2025 wurde Rewind/Limitless — das bekannteste Aufzeichnungs-Tool — an Meta verkauft und abgeschaltet.
                Bei Vera gibt es nichts, was man verkaufen könnte: Deine Daten liegen bei dir, nicht bei uns.
              </p>
              <div className="mt-10">
                <a href="#warteliste" className="inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium bg-card-surface text-text-primary hover:bg-active-hover text-[15px] px-6 py-3 transition-all active:scale-[0.98] cursor-pointer no-underline">
                  Auf die Warteliste
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Zielgruppen */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Für alle, die nach Zeit abrechnen</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Gemacht für deine Abrechnung.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {zielgruppen.map((z) => (
              <div key={z.title} className="card-style p-7 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">{z.icon}</div>
                <h3 className="font-serif text-[19px] text-text-primary mt-1">{z.title}</h3>
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">{z.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 card-style px-7 py-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-serif text-[19px] text-text-primary">Kanzleien & Steuerberatungen</h3>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed mt-1">
                Die Kanzlei-Edition mit Windows-Version, DATEV-/RA-MICRO-Export und 6-Minuten-Taktung ist in Vorbereitung —
                On-Device statt Cloud, damit das Mandatsgeheimnis eine Architekturfrage ist und keine Vertrauensfrage.
              </p>
            </div>
            <a href="#warteliste" className="shrink-0 inline-flex items-center justify-center rounded-xl font-sans font-medium border border-border-hairline text-text-primary hover:bg-active-hover text-[13px] px-4 py-2.5 transition-all cursor-pointer no-underline">
              Kanzlei-Warteliste
            </a>
          </div>
        </section>

        {/* Warteliste */}
        <section id="warteliste" className="max-w-[640px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Beta-Zugang</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Hol dir deine Stunden zurück.</h2>
            <p className="font-sans text-[15px] text-text-muted max-w-[460px] leading-relaxed">
              Die Beta startet in kleinen Wellen. Warteliste zuerst, Frühbucher-Preis inklusive.
            </p>
          </div>
          <WaitlistForm variant={variant} />
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-[820px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 mb-28 sm:mb-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Fragen</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Gut zu wissen.</h2>
          </div>
          <div className="flex flex-col">
            {faqs.map((f) => <FAQItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-hairline">
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 py-12 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          <div className="flex flex-col gap-3 max-w-[300px]">
            <div className="flex items-center gap-2 text-text-primary select-none">
              <VMark size={17} />
              <span className="font-serif text-[18px]">Vera</span>
            </div>
            <p className="font-sans text-[13px] text-text-muted leading-relaxed">
              Automatische Zeiterfassung, die deine Abrechnung schreibt — 100 % auf deinem Gerät.
            </p>
          </div>
          <div className="flex gap-14 sm:gap-20">
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[11px] font-semibold tracking-widest uppercase text-text-faint">Produkt</span>
              <a href="#how" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">So funktioniert es</a>
              <a href="#rechner" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Rechner</a>
              <a href="#faq" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[11px] font-semibold tracking-widest uppercase text-text-faint">Mehr</span>
              <a href="#warteliste" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Warteliste</a>
              <a href={`https://github.com/${REPO}`} target="_blank" rel="noopener noreferrer" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pb-10">
          <span className="font-sans text-[12px] text-text-faint">© {new Date().getFullYear()} Vera · Zeiterfassung, die auf deinem Gerät bleibt</span>
        </div>
      </footer>
    </div>
  );
}

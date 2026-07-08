import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Vera marketing site — landing page for the billing copilot, in Vera's warm
// monochrome design. Structure per Umbauplan Schicht 0: hero with waitlist →
// how it works → money calculator → privacy band → audiences → full waitlist
// form → FAQ → footer. Site copy is ALWAYS English (owner decision).
// The public macOS download ships in Schicht 6 (DOWNLOAD_URL below);
// /downloads and /updater are populated by scripts/release-mac.sh.
// ---------------------------------------------------------------------------

const REPO = "erithy25/vera";

// Public download — the DMG released by scripts/release-mac.sh. Starting the
// 14-day trial needs no account: download, launch, done.
const DOWNLOAD_URL = "/downloads/Vera.dmg";

// Waitlist endpoint (Formspree-compatible, accepts JSON POSTs). Set at build
// time via VITE_WAITLIST_ENDPOINT — see website/README.md. Without an
// endpoint the form shows an honest error instead of silently dropping input.
const WAITLIST_ENDPOINT: string = import.meta.env.VITE_WAITLIST_ENDPOINT ?? "";

// Checkout links (merchant of record — Lemon Squeezy / Paddle) per plan. Set
// at build time via VITE_CHECKOUT_SOLO / _PRO / _FIRM. Until a store is live
// they fall back to the waitlist, so no CTA is ever a dead link.
const CHECKOUT = {
  solo: import.meta.env.VITE_CHECKOUT_SOLO ?? "",
  pro: import.meta.env.VITE_CHECKOUT_PRO ?? "",
  firm: import.meta.env.VITE_CHECKOUT_FIRM ?? "",
} as const;

// A/B hero variant: default "money", ?v=privacy switches to the privacy
// angle. The variant travels with every waitlist signup.
function getVariant(): "money" | "privacy" {
  if (typeof window === "undefined") return "money";
  return new URLSearchParams(window.location.search).get("v") === "privacy"
    ? "privacy"
    : "money";
}

// --- Icons (inline, Lucide-style strokes — matches the desktop app) ---

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

// --- Waitlist ---

type SubmitState = "idle" | "sending" | "ok" | "error";

interface WaitlistPayload {
  email: string;
  variant: string;
  segment: string[];
  firm_interest: boolean;
  source: string;
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

// Compact email field for the hero — signs up directly (variant included).
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
      firm_interest: false,
      source: "hero",
    });
    setState(ok ? "ok" : "error");
  }

  if (state === "ok") {
    return (
      <div className="flex items-center gap-2 font-sans text-[15px] text-text-primary bg-card-surface border border-border-hairline rounded-xl px-5 py-3">
        <CheckIcon /> You're on the waitlist — we'll be in touch.
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
          placeholder="you@email.com"
          aria-label="Email address for the waitlist"
          className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-border-hairline bg-card-surface font-sans text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-text-muted"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="h-12 px-5 rounded-xl bg-text-primary text-card-surface font-sans font-medium text-[15px] cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60 whitespace-nowrap"
        >
          {state === "sending" ? "Sending…" : "Join the waitlist"}
        </button>
      </div>
      {state === "error" && (
        <span className="font-sans text-[13px] text-text-muted">
          That didn't go through — please try again in the form below.
        </span>
      )}
      <span className="font-sans text-[12px] text-text-faint">
        Beta ships to the waitlist first · macOS · no account required
      </span>
    </form>
  );
}

// Full waitlist form with segment and firm-edition questions.
function WaitlistForm({ variant }: { variant: string }) {
  const [email, setEmail] = useState("");
  const [segments, setSegments] = useState<string[]>([]);
  const [firm, setFirm] = useState(false);
  const [state, setState] = useState<SubmitState>("idle");

  const segmentOptions = [
    "Agency / Studio",
    "Consulting",
    "Freelancer",
    "Law / Tax firm",
    "Other",
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
      firm_interest: firm,
      source: "form",
    });
    setState(ok ? "ok" : "error");
  }

  if (state === "ok") {
    return (
      <div className="card-style px-8 py-12 flex flex-col items-center text-center gap-3">
        <span className="w-10 h-10 rounded-full bg-text-primary text-card-surface flex items-center justify-center"><CheckIcon size={18} /></span>
        <h3 className="font-serif text-[26px] text-text-primary">You're in.</h3>
        <p className="font-sans text-[15px] text-text-muted max-w-[420px] leading-relaxed">
          We'll reach out as soon as your beta is ready. Until then: if you're up for
          15 minutes on how you track time today, just reply to the confirmation email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card-style px-6 sm:px-10 py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="wl-email" className="font-sans text-[13px] font-medium text-text-primary">Email</label>
        <input
          id="wl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="h-12 px-4 rounded-xl border border-border-hairline bg-bg-warm font-sans text-[15px] text-text-primary placeholder:text-text-faint outline-none focus:border-text-muted"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="font-sans text-[13px] font-medium text-text-primary">What do you bill for? <span className="text-text-faint font-normal">(optional)</span></span>
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
          checked={firm}
          onChange={(e) => setFirm(e.target.checked)}
          className="mt-1 w-4 h-4 cursor-pointer"
          style={{ accentColor: "#1c1c1a" }}
        />
        <span className="font-sans text-[13.5px] text-text-muted leading-relaxed">
          I'm interested in the <strong className="text-text-primary font-medium">Firm Edition</strong> (Windows,
          DATEV/RA-MICRO export) and want to hear when it ships.
        </span>
      </label>

      <button
        type="submit"
        disabled={state === "sending"}
        className="h-12 rounded-xl bg-text-primary text-card-surface font-sans font-medium text-[15px] cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Join the waitlist"}
      </button>

      {state === "error" && (
        <span className="font-sans text-[13px] text-text-muted text-center">
          Signup isn't reachable right now. Please try again in a few minutes.
        </span>
      )}
      <span className="font-sans text-[12px] text-text-faint text-center">
        Waitlist only — no marketing, unsubscribe anytime.
      </span>
    </form>
  );
}

// --- Product preview: the daily review as the new Vera shows it ---

function VeraWindow() {
  const blocks = [
    { time: "09:04 – 10:38", app: "Figma · northwind-client.com", project: "Northwind — Website Relaunch", confidence: "94%", duration: "1 h 34 m" },
    { time: "10:41 – 11:12", app: "Mail · Proposal_v2.pdf", project: "Bergman Consulting — Proposal", confidence: "88%", duration: "31 m" },
    { time: "11:15 – 11:29", app: "Slack · #client-northwind", project: "Northwind — Website Relaunch", confidence: "91%", duration: "14 m" },
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
          <span className="absolute left-1/2 -translate-x-1/2 font-serif text-[14px] text-text-muted">Vera — Today</span>
        </div>
        <div className="bg-bg-warm px-5 sm:px-8 py-7 flex flex-col gap-3">
          {blocks.map((b) => (
            <div key={b.time} className="card-style px-4 sm:px-5 py-3.5 flex items-center gap-4">
              <div className="flex flex-col min-w-[92px] shrink-0">
                <span className="font-sans text-[12px] text-text-muted tabular-nums">{b.time}</span>
                <span className="font-sans text-[11px] text-text-faint tabular-nums">{b.duration}</span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-sans text-[13px] text-text-primary font-medium truncate">{b.project}</span>
                <span className="font-sans text-[12px] text-text-faint truncate">{b.app}</span>
              </div>
              <span className="hidden sm:inline font-sans text-[11px] px-2 py-1 rounded bg-active-hover text-text-muted border border-border-hairline shrink-0">{b.confidence}</span>
            </div>
          ))}
          <div className="card-style px-4 sm:px-5 py-4 flex flex-col gap-2">
            <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">Draft · Billing narrative</span>
            <p className="font-serif text-[15.5px] text-text-muted italic leading-relaxed">
              "Revised homepage layouts and aligned design variants for the website relaunch; answered client questions in the project channel."
            </p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-sans text-[12px] text-text-faint">Northwind — Website Relaunch · 1 h 48 m · €216</span>
              <span className="font-sans text-[12px] px-3 py-1.5 rounded-lg bg-text-primary text-card-surface">Close the day</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Money calculator ---

function formatEuro(n: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function MoneyCalculator() {
  const [rate, setRate] = useState(120);
  const [minutes, setMinutes] = useState(20);
  const DAYS_PER_YEAR = 220; // billable working days

  const perYear = useMemo(
    () => Math.round((rate * minutes * DAYS_PER_YEAR) / 60),
    [rate, minutes]
  );

  return (
    <div className="card-style px-6 sm:px-10 py-10 flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="rate" className="font-sans text-[13px] font-medium text-text-primary">Your hourly rate</label>
            <span className="font-serif text-[22px] text-text-primary tabular-nums">{formatEuro(rate)}</span>
          </div>
          <input
            id="rate"
            type="range"
            min={30}
            max={400}
            step={5}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full cursor-pointer"
            style={{ accentColor: "#1c1c1a" }}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="min" className="font-sans text-[13px] font-medium text-text-primary">Forgotten minutes per day</label>
            <span className="font-serif text-[22px] text-text-primary tabular-nums">{minutes} min</span>
          </div>
          <input
            id="min"
            type="range"
            min={5}
            max={60}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full cursor-pointer"
            style={{ accentColor: "#1c1c1a" }}
          />
        </div>
      </div>
      <div className="flex flex-col items-center text-center gap-1 border-t border-border-hairline pt-8">
        <span className="font-sans text-[13px] text-text-muted">Untracked time costs you every year</span>
        <span className="font-serif text-[clamp(40px,7vw,64px)] leading-none tracking-tight text-text-primary tabular-nums">{formatEuro(perYear)}</span>
        <span className="font-sans text-[12px] text-text-faint mt-2">Assumes {DAYS_PER_YEAR} billable days a year. Quick calls, Slack replies, "just a quick look" — exactly the time manual tracking loses.</span>
      </div>
    </div>
  );
}

// --- Pricing ---

interface Tier {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  checkout: string;
  ctaLabel: string;
  trial: boolean; // trial plans start via the download; Firm ships later (waitlist)
  highlight?: boolean;
  note?: string;
}

const tiers: Tier[] = [
  {
    name: "Solo",
    price: "€19",
    cadence: "/ month",
    tagline: "For freelancers who bill their own time.",
    features: [
      "Automatic capture, blocks & assignment",
      "Local-AI billing narratives",
      "Daily close & rounding rules",
      "CSV export & reports",
      "100% on-device — no account",
    ],
    checkout: CHECKOUT.solo,
    ctaLabel: "Download & start free trial",
    trial: true,
  },
  {
    name: "Pro",
    price: "€29",
    cadence: "/ month",
    tagline: "For consultants & studios that push into billing tools.",
    features: [
      "Everything in Solo",
      "Direct integrations (Toggl, Harvest & more)",
      "Per-project rates & rounding overrides",
      "Recovered-time reports & share cards",
      "Priority support",
    ],
    checkout: CHECKOUT.pro,
    ctaLabel: "Download & start free trial",
    trial: true,
    highlight: true,
    note: "Integrations roll out with the Pro plan.",
  },
  {
    name: "Firm",
    price: "€49",
    cadence: "/ seat / month",
    tagline: "For law & tax firms with strict secrecy needs.",
    features: [
      "Everything in Pro",
      "Windows + macOS",
      "DATEV / RA-MICRO export, 6-minute increments",
      "Aggregated team summaries — no monitoring",
      "On-device by architecture (§203-friendly)",
    ],
    checkout: CHECKOUT.firm,
    ctaLabel: "Join the Firm waitlist",
    trial: false,
    note: "Firm Edition ships with the Windows version.",
  },
];

function Pricing() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
      {tiers.map((t) => (
        <div
          key={t.name}
          className={`card-style p-7 flex flex-col gap-5 ${
            t.highlight ? "border-text-primary shadow-[0_20px_50px_-24px_rgba(28,28,26,0.28)]" : ""
          }`}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-serif text-[22px] text-text-primary">{t.name}</span>
              {t.highlight && (
                <span className="font-sans text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-text-primary text-card-surface">
                  Most popular
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-serif text-[40px] tracking-tight text-text-primary tabular-nums">{t.price}</span>
              <span className="font-sans text-[13px] text-text-faint">{t.cadence}</span>
            </div>
            <p className="font-sans text-[13.5px] text-text-muted leading-relaxed mt-1">{t.tagline}</p>
          </div>

          <div className="h-px bg-border-hairline w-full" />

          <ul className="flex flex-col gap-2.5 flex-1">
            {t.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span className="text-text-primary shrink-0 mt-0.5"><CheckIcon size={15} /></span>
                <span className="font-sans text-[13.5px] text-text-muted leading-snug">{f}</span>
              </li>
            ))}
          </ul>

          {/* Trial plans start via the download (no account); Firm → waitlist. */}
          <a
            href={t.trial ? DOWNLOAD_URL : "#waitlist"}
            className={`inline-flex items-center justify-center rounded-xl font-sans font-medium text-[14px] px-5 py-3 transition-all active:scale-[0.98] cursor-pointer no-underline ${
              t.highlight
                ? "bg-text-primary text-card-surface hover:bg-text-muted"
                : "border border-border-hairline text-text-primary hover:bg-active-hover"
            }`}
          >
            {t.ctaLabel}
          </a>
          {t.trial && t.checkout && (
            <a
              href={t.checkout}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-[12px] text-text-muted hover:text-text-primary text-center -mt-2 no-underline"
            >
              or buy {t.name} now →
            </a>
          )}
          {t.note && <span className="font-sans text-[11.5px] text-text-faint text-center -mt-2">{t.note}</span>}
        </div>
      ))}
    </div>
  );
}

// --- FAQ ---

const faqs = [
  {
    q: "Does my data really never leave the device?",
    a: "Yes — by architecture, not by promise. Capture, text recognition, the database and the AI model (via Ollama) run entirely on your Mac; the database is encrypted. There is no account, no server, no telemetry. The app's only network contact is the update check — even your license is verified on-device, so buying and activating sends nothing.",
  },
  {
    q: "Which permissions does Vera need?",
    a: "Screen recording and accessibility, so Vera can evaluate windows and content locally. macOS re-confirms this permission roughly once a month for security reasons — that's normal; Vera points it out in time and explains every step.",
  },
  {
    q: "What does Vera see — and what doesn't it?",
    a: "Vera works out which app, document and page you're working in to build time blocks from it. Password managers are excluded out of the box; you can exclude your own apps and domains anytime, sensitive patterns (cards, IBANs, keys) are redacted automatically, and one click pauses capture entirely. Raw data expires after a configurable period — your time blocks remain.",
  },
  {
    q: "Do I need extra hardware or an AI provider subscription?",
    a: "No. Vera uses Ollama (free) with a local model and sets it up with you on first launch. A Mac with Apple Silicon is recommended; the more RAM, the better the narratives.",
  },
  {
    q: "Does Vera work offline?",
    a: "Yes. Capturing, assigning and drafting work without an internet connection — there's simply nothing that would need one.",
  },
  {
    q: "What will Vera cost?",
    a: "Planned is a subscription from €19 per month — a single recovered hour pays for several months of it. The waitlist gets the beta first and an early-bird price.",
  },
  {
    q: "I work at a law firm on Windows — what about me?",
    a: "The Firm Edition (Windows, DATEV/RA-MICRO export, 6-minute increments) is in the works. Tick the Firm Edition box in the waitlist form and you'll be among the first to test it.",
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

// --- Page ---

const steps = [
  {
    n: "01",
    icon: <ClockIcon />,
    title: "Capture",
    body: "Vera runs quietly in the background and turns your workday into seamless time blocks — local and encrypted, no timers, no sticky notes.",
  },
  {
    n: "02",
    icon: <TagIcon />,
    title: "Assign",
    body: "A local AI model recognizes from the content which client and project a block belongs to — and learns from every correction.",
  },
  {
    n: "03",
    icon: <ReceiptIcon />,
    title: "Bill",
    body: "Vera writes ready-to-bill narratives. You confirm your day in three minutes and export straight into your billing system.",
  },
];

const audiences = [
  {
    icon: <BriefcaseIcon />,
    title: "Agencies & studios",
    body: "Project switches by the minute, retainers and fixed fees side by side — Vera keeps track of where the hours really go and delivers clean records for every client.",
  },
  {
    icon: <CompassIcon />,
    title: "Consultancies & consultants",
    body: "Between calls, decks and client emails, billable time evaporates. Vera reconstructs the day from its content and turns it into solid, well-worded entries.",
  },
  {
    icon: <PenIcon />,
    title: "Freelancers",
    body: "You want to work, not keep books. Vera captures on the side, you confirm in the evening — and no half hour of \"quickly fixed something\" goes unpaid anymore.",
  },
];

const heroCopy = {
  money: {
    eyebrow: "Automatic time tracking for people who bill",
    h1: "Vera wins back your lost billable hours.",
    sub: "Automatic time tracking that understands your day and writes your billing narratives — 100% on your Mac. Not a single byte leaves your device.",
  },
  privacy: {
    eyebrow: "Time tracking without the cloud",
    h1: "The only AI time tracker where not a single byte leaves your device.",
    sub: "Vera understands your workday, assigns it to clients and writes your billing narratives — entirely on your Mac. And wins back the hours manual tracking loses along the way.",
  },
} as const;

export function App() {
  const variant = getVariant();
  const hero = heroCopy[variant];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 bg-bg-warm/80 backdrop-blur-md border-b border-border-hairline/70">
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
            <span className="text-text-primary"><VMark size={19} /></span>
            <span className="font-serif text-[21px] tracking-tight">Vera</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 font-sans text-[13px] text-text-muted">
            <a href="#how" className="hover:text-text-primary transition-colors">How it works</a>
            <a href="#calculator" className="hover:text-text-primary transition-colors">Calculator</a>
            <a href="#pricing" className="hover:text-text-primary transition-colors">Pricing</a>
            <a href="#private" className="hover:text-text-primary transition-colors">Privacy</a>
            <a href="#faq" className="hover:text-text-primary transition-colors">FAQ</a>
          </nav>
          <a href={DOWNLOAD_URL} className="inline-flex items-center justify-center rounded-xl font-sans font-medium bg-text-primary text-card-surface hover:bg-text-muted text-[13px] px-4 py-2 transition-all cursor-pointer no-underline">
            Download
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-20 sm:pt-28 flex flex-col items-center text-center">
          <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">{hero.eyebrow}</span>
          <h1 className="font-serif text-[clamp(40px,7.5vw,76px)] leading-[1.02] tracking-tight mt-5 max-w-[880px]">{hero.h1}</h1>
          <p className="font-sans text-[17px] sm:text-[19px] text-text-muted leading-relaxed max-w-[620px] mt-6">{hero.sub}</p>
          <div className="mt-9 flex flex-col items-center gap-3">
            <a
              href={DOWNLOAD_URL}
              className="inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium bg-text-primary text-card-surface hover:bg-text-muted text-[16px] px-7 py-3.5 transition-all active:scale-[0.98] cursor-pointer no-underline"
            >
              Download for macOS
            </a>
            <span className="font-sans text-[12px] text-text-faint">
              14-day free trial · no account · Apple Silicon
            </span>
          </div>
          <div className="mt-10 w-full flex flex-col items-center gap-2">
            <span className="font-sans text-[13px] text-text-muted">Prefer email updates first?</span>
            <HeroWaitlist variant={variant} />
          </div>
        </section>

        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-16 sm:mt-20">
          <VeraWindow />
        </section>

        {/* How it works */}
        <section id="how" className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">How it works</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">You do the work. Vera does the billing.</h2>
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

        {/* Money calculator */}
        <section id="calculator" className="max-w-[920px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-10">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">The calculator</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">What does forgotten time cost you?</h2>
          </div>
          <MoneyCalculator />
        </section>

        {/* Privacy band (dark) */}
        <section id="private" className="mt-28 sm:mt-40 scroll-mt-20">
          <div className="bg-text-primary text-card-surface">
            <div className="max-w-[1120px] mx-auto px-6 sm:px-10 py-24 sm:py-32 flex flex-col items-center text-center">
              <span className="text-card-surface/60"><LockIcon size={26} /></span>
              <h2 className="font-serif text-[clamp(34px,6vw,60px)] leading-[1.05] tracking-tight mt-6 max-w-[820px]">
                No account. No server. Not a single byte leaves your device.
              </h2>
              <p className="font-sans text-[16px] sm:text-[18px] text-card-surface/70 leading-relaxed max-w-[640px] mt-6">
                Other AI time trackers send your work content — clients, matters, contracts — to their cloud.
                Vera doesn't: capture, the encrypted database and the AI model run entirely on your Mac.
                Not as a setting, but as architecture.
              </p>
              <p className="font-sans text-[14px] text-card-surface/50 leading-relaxed max-w-[640px] mt-5">
                Why that matters: in 2025, Rewind/Limitless — the best-known recording tool — was sold to Meta and shut down.
                With Vera there is nothing to sell: your data lives with you, not with us.
              </p>
              <div className="mt-10">
                <a href="#waitlist" className="inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium bg-card-surface text-text-primary hover:bg-active-hover text-[15px] px-6 py-3 transition-all active:scale-[0.98] cursor-pointer no-underline">
                  Join the waitlist
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Audiences */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">For everyone who bills by the hour</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Built for your billing.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {audiences.map((z) => (
              <div key={z.title} className="card-style p-7 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">{z.icon}</div>
                <h3 className="font-serif text-[19px] text-text-primary mt-1">{z.title}</h3>
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">{z.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 card-style px-7 py-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-serif text-[19px] text-text-primary">Law & tax firms</h3>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed mt-1">
                The Firm Edition with a Windows version, DATEV/RA-MICRO export and 6-minute increments is in the works —
                on-device instead of cloud, so professional secrecy is a matter of architecture, not of trust.
              </p>
            </div>
            <a href="#waitlist" className="shrink-0 inline-flex items-center justify-center rounded-xl font-sans font-medium border border-border-hairline text-text-primary hover:bg-active-hover text-[13px] px-4 py-2.5 transition-all cursor-pointer no-underline">
              Firm waitlist
            </a>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Pricing</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">One recovered hour pays for months.</h2>
            <p className="font-sans text-[15px] text-text-muted max-w-[520px] leading-relaxed">
              14-day free trial, no account and no credit card. Your data stays on your device on every plan.
            </p>
          </div>
          <Pricing />
        </section>

        {/* Waitlist */}
        <section id="waitlist" className="max-w-[640px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Beta access</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Win back your hours.</h2>
            <p className="font-sans text-[15px] text-text-muted max-w-[460px] leading-relaxed">
              The beta rolls out in small waves. Waitlist first, early-bird price included.
            </p>
          </div>
          <WaitlistForm variant={variant} />
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-[820px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 mb-28 sm:mb-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Questions</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Good to know.</h2>
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
              Automatic time tracking that writes your billing — 100% on your device.
            </p>
          </div>
          <div className="flex gap-14 sm:gap-20">
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[11px] font-semibold tracking-widest uppercase text-text-faint">Product</span>
              <a href="#how" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">How it works</a>
              <a href="#calculator" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Calculator</a>
              <a href="#pricing" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Pricing</a>
              <a href="#faq" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[11px] font-semibold tracking-widest uppercase text-text-faint">More</span>
              <a href="#waitlist" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Waitlist</a>
              <a href={`https://github.com/${REPO}`} target="_blank" rel="noopener noreferrer" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pb-10">
          <span className="font-sans text-[12px] text-text-faint">© {new Date().getFullYear()} Vera · Time tracking that stays on your device</span>
        </div>
      </footer>
    </div>
  );
}

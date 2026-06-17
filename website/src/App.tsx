import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Vera marketing site — a full-length product landing page in Vera's warm
// monochrome design. Structure follows the common SaaS flow (sticky nav →
// hero with a real product preview → how it works → features → a bold
// privacy band → honest pillars → FAQ → closing CTA → footer).
// ---------------------------------------------------------------------------

const REPO = "erithy25/vera";
const DMG_PATH = "/downloads/Vera.dmg";

// --- Icons (inline, Lucide-style strokes — matches the desktop app) ---

const VMark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4l8 16 8-16" />
    <path d="M8 4l4 8 4-8" />
  </svg>
);

const AppleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.957 4.45z" />
  </svg>
);

const Sparkle = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.8 5.2a3 3 0 0 0 1.9 1.9L21 12l-5.3 1.8a3 3 0 0 0-1.9 1.9L12 21l-1.8-5.3a3 3 0 0 0-1.9-1.9L3 12l5.3-1.8a3 3 0 0 0 1.9-1.9z" />
  </svg>
);

const ArrowUpRight = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

type IconProps = { size?: number };
const EyeIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
const ClockIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const UsersIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M17.5 14.4A5.5 5.5 0 0 1 20.5 20" /></svg>
);
const TargetIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></svg>
);
const CpuIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2" /></svg>
);
const LockIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
);
const MenuBarIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 8h18" /><circle cx="17.4" cy="6" r="0.9" fill="currentColor" stroke="none" /></svg>
);

function DownloadButton({ variant = "solid", light = false }: { variant?: "solid" | "ghost"; light?: boolean }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium transition-all duration-200 cursor-pointer no-underline";
  let styles: string;
  if (variant === "solid") {
    styles = light
      ? "bg-card-surface text-text-primary hover:bg-active-hover text-[15px] px-6 py-3 active:scale-[0.98]"
      : "bg-text-primary text-card-surface hover:bg-text-muted text-[15px] px-6 py-3 active:scale-[0.98]";
  } else {
    styles = "border border-border-hairline text-text-primary hover:bg-active-hover text-[13px] px-4 py-2";
  }
  return (
    <a href={DMG_PATH} download className={`${base} ${styles}`} aria-label="Download Vera for Mac">
      <AppleIcon size={variant === "solid" ? 16 : 14} />
      Download for Mac
    </a>
  );
}

// Faithful recreation of Vera's Ask-bar + chat, so the page shows the real product.
function VeraWindow() {
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
          <span className="absolute left-1/2 -translate-x-1/2 font-serif text-[14px] text-text-muted">Vera</span>
        </div>
        <div className="bg-bg-warm px-5 sm:px-8 py-8 flex flex-col gap-5">
          <div className="w-full h-[64px] bg-card-surface border border-border-hairline rounded-[16px] flex items-center px-5 gap-4">
            <span className="text-text-muted shrink-0"><Sparkle size={20} /></span>
            <span className="flex-1 font-serif text-[19px] text-text-muted italic">Ask anything about your day</span>
            <span className="w-9 h-9 rounded-xl border border-border-hairline flex items-center justify-center text-text-faint shrink-0"><ArrowUpRight size={17} /></span>
          </div>
          <div className="card-style px-5 sm:px-6 py-5 flex flex-col">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0 mt-0.5">
                <span className="font-sans text-[10px] font-semibold text-text-primary">TM</span>
              </div>
              <div className="flex-1 font-sans text-[14px] text-text-primary leading-relaxed pt-1">What did I work on this morning?</div>
            </div>
            <div className="h-px bg-border-hairline w-full my-4" />
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-card-surface"><Sparkle size={13} /></span>
              </div>
              <div className="flex-1 flex flex-col gap-2 pt-0.5">
                <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">Vera</span>
                <p className="font-serif text-[16px] text-text-muted italic leading-relaxed">You spent most of the morning in Figma on the “Vera” file, then reviewed a pull request in Safari around 11:20.</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {["Figma · Vera", "Safari · GitHub"].map((s) => (
                    <span key={s} className="font-sans text-[11px] px-2 py-1 rounded bg-active-hover text-text-muted border border-border-hairline">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const steps = [
  { n: "01", title: "Install & allow", body: "Drag Vera into Applications and grant screen access. About a minute, once." },
  { n: "02", title: "Vera remembers", body: "In the background it notes your apps and reads your screen — only on your Mac." },
  { n: "03", title: "Just ask", body: "Ask anything about your day. Agents answer from your real context, with sources." },
];

const features = [
  { icon: <EyeIcon />, title: "Screen memory", body: "A private, searchable record of the text you saw — find anything you read days ago." },
  { icon: <ClockIcon />, title: "Timeline", body: "Rewind your day hour by hour: which apps, which windows, what was on screen." },
  { icon: <UsersIcon />, title: "Local agents", body: "Planner, Writer, Researcher and Coach — grounded in your real activity and notes." },
  { icon: <TargetIcon />, title: "Goals & notes", body: "Capture quick notes and track goals; your agents can even propose them for approval." },
  { icon: <CpuIcon />, title: "Local or cloud", body: "Runs on a local model by default. Prefer a stronger model? Bring your own API key." },
  { icon: <LockIcon />, title: "Private by design", body: "Exclude apps and domains, redact sensitive data, or pause capture — all in your hands." },
  { icon: <MenuBarIcon />, title: "Always on", body: "Lives in your menu bar and keeps remembering when the window is closed. Pause or quit anytime." },
];

const faqs = [
  { q: "Is it really private?", a: "Yes. Your activity, screen memory and the AI run on your Mac. Nothing is sent to a server. A cloud model is optional and uses your own API key — and even then, only your question plus the retrieved snippets are sent." },
  { q: "Do I need anything to use the AI?", a: "For the local AI, install Ollama (free) and pull the default models — Vera walks you through it. Or switch to Cloud and paste an Anthropic or OpenAI key." },
  { q: "Does it cost anything?", a: "Vera itself is free. In Cloud mode you pay your own provider directly for what you use." },
  { q: "Which Macs are supported?", a: "macOS 12 or newer on Apple Silicon. The download is signed and notarized by Apple, so it opens normally." },
  { q: "Can I keep sensitive things out?", a: "Password managers are excluded by default. You can add your own excluded apps and domains, turn on redaction, or pause capturing entirely — anytime." },
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

export function App() {
  // Show the version that is actually published, read from the same manifest
  // the release script writes alongside the DMG. This way the number on the
  // site can never drift from the real download (omitted if it can't load).
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch("/updater/latest.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.version === "string") setPublishedVersion(d.version);
      })
      .catch(() => {});
  }, []);

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
            <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
            <a href="#faq" className="hover:text-text-primary transition-colors">FAQ</a>
          </nav>
          <DownloadButton variant="ghost" />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 pt-20 sm:pt-28 flex flex-col items-center text-center">
          <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Local AI for macOS</span>
          <h1 className="font-serif text-[clamp(48px,9vw,88px)] leading-[1.0] tracking-tight mt-5">Your day, remembered.</h1>
          <p className="font-sans text-[17px] sm:text-[19px] text-text-muted leading-relaxed max-w-[540px] mt-6">
            Vera quietly remembers what you did and what was on your screen — then answers anything about it. Private, on your Mac.
          </p>
          <div className="mt-9 flex flex-col items-center gap-2.5">
            <DownloadButton variant="solid" />
            <span className="font-sans text-[12px] text-text-faint">Free · macOS 12+ · No account</span>
          </div>
        </section>

        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-16 sm:mt-20">
          <VeraWindow />
        </section>

        {/* How it works */}
        <section id="how" className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">How it works</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Set it up once. Then forget it's there.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {steps.map((s) => (
              <div key={s.n} className="card-style p-7 flex flex-col gap-3">
                <span className="font-serif text-[34px] text-text-faint leading-none">{s.n}</span>
                <h3 className="font-serif text-[20px] text-text-primary mt-1">{s.title}</h3>
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Everything in one quiet app</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">A memory, a timeline, and a team.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="card-style p-7 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">{f.icon}</div>
                <h3 className="font-serif text-[19px] text-text-primary mt-1">{f.title}</h3>
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bold privacy band (dark) */}
        <section className="mt-28 sm:mt-40">
          <div className="bg-text-primary text-card-surface">
            <div className="max-w-[1120px] mx-auto px-6 sm:px-10 py-24 sm:py-32 flex flex-col items-center text-center">
              <span className="text-card-surface/60"><LockIcon size={26} /></span>
              <h2 className="font-serif text-[clamp(34px,6vw,60px)] leading-[1.05] tracking-tight mt-6 max-w-[760px]">
                Everything stays on your Mac.
              </h2>
              <p className="font-sans text-[16px] sm:text-[18px] text-card-surface/70 leading-relaxed max-w-[560px] mt-6">
                No account. No server. No telemetry. Your screen memory and the AI run on-device. Cloud is optional — and uses a key only you hold.
              </p>
              <div className="mt-10">
                <DownloadButton variant="solid" light />
              </div>
            </div>
          </div>
        </section>

        {/* Honest pillars */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40">
          <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border-hairline text-center">
            {[
              { k: "On-device", v: "Capture, search and local AI never leave your Mac." },
              { k: "No account", v: "No sign-up, no login, no profile to manage." },
              { k: "Yours to control", v: "Exclude, redact, pause or wipe — whenever you want." },
            ].map((p) => (
              <div key={p.k} className="flex flex-col gap-2 py-6 sm:py-2 sm:px-8">
                <span className="font-serif text-[26px] text-text-primary">{p.k}</span>
                <span className="font-sans text-[13.5px] text-text-muted leading-relaxed">{p.v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-[820px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Questions</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">Good to know.</h2>
          </div>
          <div className="flex flex-col">
            {faqs.map((f) => <FAQItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 mb-28 sm:mb-40">
          <div className="card-style px-8 py-20 sm:py-28 flex flex-col items-center text-center">
            <h2 className="font-serif text-[clamp(36px,6vw,64px)] leading-[1.04] tracking-tight max-w-[640px]">
              Stop trying to remember.
            </h2>
            <p className="font-sans text-[16px] sm:text-[18px] text-text-muted leading-relaxed max-w-[480px] mt-6">
              Let Vera hold the details, privately, so you can ask later.
            </p>
            <div className="mt-9 flex flex-col items-center gap-2.5">
              <DownloadButton variant="solid" />
              <span className="font-sans text-[12px] text-text-faint">Free · macOS 12+ · No account</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-hairline">
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 py-12 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          <div className="flex flex-col gap-3 max-w-[280px]">
            <div className="flex items-center gap-2 text-text-primary select-none">
              <VMark size={17} />
              <span className="font-serif text-[18px]">Vera</span>
            </div>
            <p className="font-sans text-[13px] text-text-muted leading-relaxed">A private, local AI that remembers your day. Made for macOS.</p>
          </div>
          <div className="flex gap-14 sm:gap-20">
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[11px] font-semibold tracking-widest uppercase text-text-faint">Product</span>
              <a href="#how" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">How it works</a>
              <a href="#features" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Features</a>
              <a href="#faq" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[11px] font-semibold tracking-widest uppercase text-text-faint">More</span>
              <a href={DMG_PATH} download className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">Download</a>
              <a href={`https://github.com/${REPO}`} target="_blank" rel="noopener noreferrer" className="font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors">GitHub</a>
            </div>
          </div>
        </div>
        <div className="max-w-[1120px] mx-auto px-6 sm:px-10 pb-10">
          <span className="font-sans text-[12px] text-text-faint">© {new Date().getFullYear()} Vera · Local AI for macOS{publishedVersion ? ` · v${publishedVersion}` : ""}</span>
        </div>
      </footer>
    </div>
  );
}

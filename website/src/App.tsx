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

const ShieldAlertIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.6-7.5 9.8-4.4-1.2-7.5-5.2-7.5-9.8V6z" />
    <path d="M12 8.5v4" />
    <path d="M12 15.5h.01" />
  </svg>
);

const UploadIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V5" />
    <path d="M8 9l4-4 4 4" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </svg>
);

type IconProps = { size?: number };
const KeyIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="12" r="4" /><path d="M12 12h9" /><path d="M17.5 12v3.5" /><path d="M20.5 12v2.5" /></svg>
);
const ClockIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const BlurIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" /><path d="M6.2 6.3C3.6 8 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4.3-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
);
const BoltIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z" /></svg>
);
const FilterIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
);
const LockIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
);
const OfflineIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M5 12.5a10 10 0 0 1 3.4-2.2" /><path d="M15.6 10.3A10 10 0 0 1 19 12.5" /><path d="M8.5 16a5.5 5.5 0 0 1 7 0" /><path d="M12 20h.01" /></svg>
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

// Faithful recreation of Vera's drop zone + result list, so the page shows the
// real product. The findings below are the ones the app would actually
// produce — same labels, same masking, same ordering.
function VeraWindow() {
  const findings = [
    { dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200", level: "Critical", label: "OpenAI Project Key", preview: "sk-proj-••••••••••••Hd", at: "4:12", note: "on screen for 6 seconds" },
    { dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200", level: "Critical", label: "Connection string with password", preview: "postgres://•••••••@…", at: "7:48", note: "on screen for 2 seconds" },
    { dot: "bg-text-faint", chip: "bg-active-hover text-text-muted border-border-hairline", level: "Info", label: "Stripe Publishable Key", preview: "pk_live_••••••••••••2q", at: "9:05", note: "safe to publish" },
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
          <span className="absolute left-1/2 -translate-x-1/2 font-serif text-[14px] text-text-muted">Vera</span>
        </div>
        <div className="bg-bg-warm px-5 sm:px-8 py-8 flex flex-col gap-5">
          <div className="w-full h-[64px] bg-card-surface border border-border-hairline border-dashed rounded-[16px] flex items-center px-5 gap-4">
            <span className="text-text-muted shrink-0"><UploadIcon size={20} /></span>
            <span className="flex-1 font-serif text-[19px] text-text-muted italic">launch-demo.mov</span>
            <span className="font-sans text-[12px] text-text-faint shrink-0">12:04 · 724 frames read</span>
          </div>

          <div className="card-style px-5 sm:px-6 py-5 flex flex-col gap-4">
            <div className="flex gap-3 items-start">
              <span className="text-red-700 shrink-0 mt-0.5"><ShieldAlertIcon size={20} /></span>
              <div className="flex flex-col gap-1">
                <span className="font-serif text-[17px] text-text-primary leading-tight">2 things to fix before you publish</span>
                <span className="font-sans text-[12.5px] text-text-muted">Each one with the moment it appears, worst first.</span>
              </div>
            </div>

            <div className="h-px bg-border-hairline w-full" />

            <div className="flex flex-col gap-3">
              {findings.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${f.dot}`} />
                  <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-sans text-[13px] font-medium text-text-primary">{f.label}</span>
                      <span className={`font-sans text-[9.5px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border ${f.chip}`}>{f.level}</span>
                    </div>
                    <span className="font-mono text-[11.5px] text-text-muted truncate">{f.preview}</span>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="font-serif text-[16px] text-text-primary leading-none">{f.at}</span>
                    <span className="font-sans text-[10.5px] text-text-faint mt-0.5">{f.note}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const steps = [
  { n: "01", title: "Finish recording", body: "Record your demo, tutorial or talk exactly as you already do. Vera does not need to be running." },
  { n: "02", title: "Drop the file in", body: "Vera samples the video and reads every frame on your Mac. A ten-minute recording takes about a minute." },
  { n: "03", title: "Fix, then publish", body: "You get a timestamp for each finding. Rotate the key, cut the segment, re-record — then ship it." },
];

const features = [
  { icon: <KeyIcon />, title: "20 providers", body: "OpenAI, Anthropic, AWS, GitHub, Stripe, Slack, Google, GitLab, npm, Supabase and more — plus private keys, database URLs and JWTs." },
  { icon: <BlurIcon />, title: "Survives bad OCR", body: "Text read off video is always wrong. sk-proj- comes back as 5k-pr0j-. Vera matches prefixes loosely and bodies by shape, so the key is still found." },
  { icon: <FilterIcon />, title: "Quiet on purpose", body: "Your tutorial is full of sk-your-key-here and AKIAIOSFODNN7EXAMPLE. Vera knows the difference between a placeholder and a real key." },
  { icon: <ClockIcon />, title: "Exact timestamps", body: "Every finding tells you when it appears, how long it stays visible, and shows you the frame. No hunting through the timeline." },
  { icon: <BoltIcon />, title: "Skips what didn't change", body: "Most frames of a screen recording are identical to the one before. Vera reads those once, so the scan stays fast without missing the gap." },
  { icon: <LockIcon />, title: "Never keeps the secret", body: "A finding holds the type, the timestamp and a masked preview. The value itself is discarded before it ever reaches the window." },
  { icon: <OfflineIcon />, title: "No network, at all", body: "Your recording is never uploaded. Vera makes no requests while scanning — the only one it ever makes is the update check." },
];

const faqs = [
  { q: "Does my recording get uploaded?", a: "No. The file is read on your Mac and never leaves it. Vera makes no network requests while scanning — the only connection it ever opens is the update check, which sends nothing but a version number." },
  { q: "Does it store what it finds?", a: "No. There is no scan history and no cache. A finding holds the credential's type, its timestamp and a masked preview — the value itself is thrown away before the result reaches the window. Close the app and the results are gone." },
  { q: "Won't it flag every example key in my tutorial?", a: "That was the first thing built. Placeholders (sk-your-api-key-here, <YOUR_TOKEN>), the example values from providers' own docs (AKIAIOSFODNN7EXAMPLE), environment references (process.env.OPENAI_API_KEY), git SHAs, UUIDs, build hashes and version numbers are all recognised and ignored." },
  { q: "Can it blur or remove the secret for me?", a: "No, and that is deliberate. Vera finds; you fix. Editing the video would mean re-encoding it, losing quality and arguing with codecs — and you already have a tool that cuts video. Finding the frame is the hard part." },
  { q: "What does it cost?", a: "Vera is free. There is no account, no sign-up and no usage limit." },
  { q: "Which Macs are supported?", a: "macOS 12 or newer on Apple Silicon, with .mov, .mp4 and .m4v files. The download is signed and notarized by Apple, so it opens normally." },
  { q: "If it says clean, am I safe?", a: "It means Vera found none of the credential formats it knows about in the frames it sampled. It will not catch a password typed into a form, or a key that flashes up between two samples. It is a good last check, not a guarantee." },
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
          <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">For macOS</span>
          <h1 className="font-serif text-[clamp(48px,9vw,88px)] leading-[1.0] tracking-tight mt-5">Don't ship the key.</h1>
          <p className="font-sans text-[17px] sm:text-[19px] text-text-muted leading-relaxed max-w-[540px] mt-6">
            Vera reads your finished screen recording and tells you which API keys, tokens and passwords are visible in it — with the timestamp of each one. Before you publish.
          </p>
          <div className="mt-9 flex flex-col items-center gap-2.5">
            <DownloadButton variant="solid" />
            <span className="font-sans text-[12px] text-text-faint">
              Free · macOS 12+ · No account{publishedVersion ? ` · v${publishedVersion}` : ""}
            </span>
          </div>
        </section>

        <section className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-16 sm:mt-20">
          <VeraWindow />
        </section>

        {/* How it works */}
        <section id="how" className="max-w-[1120px] mx-auto px-6 sm:px-10 mt-28 sm:mt-40 scroll-mt-20">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">How it works</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">One file in. One list out.</h2>
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
            <span className="font-sans text-[12px] font-semibold tracking-[0.2em] uppercase text-text-faint">Built for one job</span>
            <h2 className="font-serif text-[clamp(32px,5vw,48px)] tracking-tight">A scanner that reads video, not files.</h2>
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
                Your recording never leaves your Mac.
              </h2>
              <p className="font-sans text-[16px] sm:text-[18px] text-card-surface/70 leading-relaxed max-w-[560px] mt-6">
                No upload, no account, no server, no telemetry. A tool that hunts for your credentials is the last one that should keep a copy of them — so it keeps none.
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
              { k: "On-device", v: "The file is read on your Mac. Nothing is uploaded." },
              { k: "Stores nothing", v: "No recordings, no frames, no findings. Not even a history." },
              { k: "Finds, doesn't edit", v: "You get the timestamp. Your editor does the cutting." },
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
              Check it before they do.
            </h2>
            <p className="font-sans text-[16px] sm:text-[18px] text-text-muted leading-relaxed max-w-[480px] mt-6">
              One minute now, or a rotated key and a re-uploaded video later.
            </p>
            <div className="mt-9 flex flex-col items-center gap-2.5">
              <DownloadButton variant="solid" />
              <span className="font-sans text-[12px] text-text-faint">
              Free · macOS 12+ · No account{publishedVersion ? ` · v${publishedVersion}` : ""}
            </span>
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
            <p className="font-sans text-[13px] text-text-muted leading-relaxed">Finds the API keys left visible in your screen recordings. Made for macOS.</p>
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
          <span className="font-sans text-[12px] text-text-faint">© {new Date().getFullYear()} Vera · Recording scanner for macOS{publishedVersion ? ` · v${publishedVersion}` : ""}</span>
        </div>
      </footer>
    </div>
  );
}

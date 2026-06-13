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

// The built DMG is hosted with the site (drop it at public/downloads/Vera.dmg),
// so the button downloads Vera directly — no redirect to GitHub.
const DMG_PATH = "/downloads/Vera.dmg";

function DownloadButton({ variant = "solid" }: { variant?: "solid" | "ghost" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium transition-all duration-200 cursor-pointer no-underline";
  const styles =
    variant === "solid"
      ? "bg-text-primary text-card-surface hover:bg-text-muted text-[14px] px-5 py-2.5 active:scale-[0.98]"
      : "border border-border-hairline text-text-primary hover:bg-active-hover text-[13px] px-4 py-2";
  return (
    <a href={DMG_PATH} download className={`${base} ${styles}`} aria-label="Download Vera for Mac">
      <AppleIcon size={variant === "solid" ? 16 : 14} />
      Download for Mac
    </a>
  );
}

// A faithful recreation of Vera's Ask-bar + chat, so the page shows the real
// product rather than a generic mockup.
function VeraWindow() {
  return (
    <div className="relative w-full max-w-[760px] mx-auto">
      {/* soft warm glow for depth */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-10 -top-10 bottom-0 -z-10 blur-2xl opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(214,209,198,0.55) 0%, rgba(247,246,243,0) 70%)",
        }}
      />
      <div className="card-style overflow-hidden shadow-[0_24px_60px_-20px_rgba(28,28,26,0.18)]">
        {/* macOS window title bar */}
        <div className="h-11 flex items-center px-4 border-b border-border-hairline relative">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#E6E4DD]" />
            <span className="w-3 h-3 rounded-full bg-[#E6E4DD]" />
            <span className="w-3 h-3 rounded-full bg-[#E6E4DD]" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 font-serif text-[14px] text-text-muted">
            Vera
          </span>
        </div>

        {/* content */}
        <div className="bg-bg-warm px-5 sm:px-8 py-8 flex flex-col gap-5">
          {/* Ask bar */}
          <div className="w-full h-[64px] bg-card-surface border border-border-hairline rounded-[16px] flex items-center px-5 gap-4">
            <span className="text-text-muted shrink-0">
              <Sparkle size={20} />
            </span>
            <span className="flex-1 font-serif text-[19px] text-text-muted italic">
              Ask anything about your day
            </span>
            <span className="w-9 h-9 rounded-xl border border-border-hairline flex items-center justify-center text-text-faint shrink-0">
              <ArrowUpRight size={17} />
            </span>
          </div>

          {/* chat card */}
          <div className="card-style px-5 sm:px-6 py-5 flex flex-col">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center shrink-0 mt-0.5">
                <span className="font-sans text-[10px] font-semibold text-text-primary">TM</span>
              </div>
              <div className="flex-1 font-sans text-[14px] text-text-primary leading-relaxed pt-1">
                What did I work on this morning?
              </div>
            </div>

            <div className="h-px bg-border-hairline w-full my-4" />

            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-card-surface">
                  <Sparkle size={13} />
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-2 pt-0.5">
                <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">
                  Vera
                </span>
                <p className="font-serif text-[16px] text-text-muted italic leading-relaxed">
                  You spent most of the morning in Figma on the “Vera” file, then
                  reviewed a pull request in Safari around 11:20.
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {["Figma · Vera", "Safari · GitHub"].map((s) => (
                    <span
                      key={s}
                      className="font-sans text-[11px] px-2 py-1 rounded bg-active-hover text-text-muted border border-border-hairline"
                    >
                      {s}
                    </span>
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

const features = [
  {
    title: "Remembers",
    body: "Notes the apps you use and reads what's on screen.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    title: "Answers",
    body: "Ask about your day; agents reply from real context.",
    icon: <Sparkle size={18} />,
  },
  {
    title: "Private",
    body: "Memory and AI run on your Mac. No account.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      </svg>
    ),
  },
];

export function App() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="w-full">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-10 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
            <span className="text-text-primary"><VMark size={19} /></span>
            <span className="font-serif text-[21px] tracking-tight">Vera</span>
          </div>
          <DownloadButton variant="ghost" />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-[1080px] mx-auto px-6 sm:px-10 pt-16 sm:pt-24 flex flex-col items-center text-center">
          <span className="font-sans text-[12px] font-semibold tracking-[0.18em] uppercase text-text-faint">
            Local AI for macOS
          </span>
          <h1 className="font-serif text-[clamp(46px,8.5vw,82px)] leading-[1.02] tracking-tight mt-5">
            Your day, remembered.
          </h1>
          <p className="font-sans text-[17px] sm:text-[18px] text-text-muted leading-relaxed max-w-[500px] mt-6">
            Vera notes what you did and reads what's on your screen — then answers,
            right on your Mac.
          </p>
          <div className="mt-8 flex flex-col items-center gap-2.5">
            <DownloadButton variant="solid" />
            <span className="font-sans text-[12px] text-text-faint">
              Free · macOS 12+ · No account
            </span>
          </div>
        </section>

        {/* Product preview */}
        <section className="max-w-[1080px] mx-auto px-6 sm:px-10 mt-16 sm:mt-20">
          <VeraWindow />
        </section>

        {/* Quiet feature row */}
        <section className="max-w-[860px] mx-auto px-6 sm:px-10 mt-20 sm:mt-28 mb-24">
          <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border-hairline">
            {features.map((f) => (
              <div key={f.title} className="flex flex-col gap-2 py-4 sm:py-0 sm:px-7 first:sm:pl-0 last:sm:pr-0">
                <span className="text-text-primary">{f.icon}</span>
                <h3 className="font-serif text-[18px] text-text-primary mt-1">{f.title}</h3>
                <p className="font-sans text-[13.5px] text-text-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border-hairline">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-10 py-7 flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-muted select-none">
            <VMark size={15} />
            <span className="font-sans text-[13px]">Vera</span>
          </div>
          <span className="font-sans text-[12px] text-text-faint">Local AI for macOS</span>
        </div>
      </footer>
    </div>
  );
}

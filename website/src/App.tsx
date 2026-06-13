import { useState } from "react";

// GitHub repo that publishes the Vera releases. The download button always
// resolves the newest release's .dmg, so it never points at a stale version.
const REPO = "erithy25/vera";

const VMark = ({ size = 22 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 4l8 16 8-16" />
    <path d="M8 4l4 8 4-8" />
  </svg>
);

const AppleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.957 4.45z" />
  </svg>
);

function DownloadButton({
  variant = "solid",
  full = false,
}: {
  variant?: "solid" | "ghost";
  full?: boolean;
}) {
  const [state, setState] = useState<"idle" | "fetching">("idle");

  const handleDownload = async () => {
    if (state === "fetching") return;
    setState("fetching");
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (res.ok) {
        const data = await res.json();
        const assets: { name: string; browser_download_url: string }[] = data.assets || [];
        const dmgs = assets.filter((a) => a.name.toLowerCase().endsWith(".dmg"));
        // Prefer Apple Silicon / universal builds, then fall back to any .dmg
        const preferred =
          dmgs.find((a) => /aarch64|arm64|universal/i.test(a.name)) || dmgs[0];
        if (preferred) {
          window.location.href = preferred.browser_download_url;
          setState("idle");
          return;
        }
      }
    } catch {
      // fall through to the releases page
    }
    // No release/asset yet → send them to the releases page
    window.location.href = `https://github.com/${REPO}/releases/latest`;
    setState("idle");
  };

  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium transition-all duration-200 cursor-pointer disabled:opacity-60";
  const styles =
    variant === "solid"
      ? "bg-text-primary text-card-surface hover:bg-text-muted text-[14px] px-5 py-2.5 active:scale-[0.98]"
      : "border border-border-hairline text-text-primary hover:bg-active-hover text-[13px] px-4 py-2";

  return (
    <button
      onClick={handleDownload}
      disabled={state === "fetching"}
      className={`${base} ${styles} ${full ? "w-full" : ""}`}
      aria-label="Download Vera for Mac"
    >
      <AppleIcon size={variant === "solid" ? 16 : 14} />
      {state === "fetching" ? "Preparing…" : "Download for Mac"}
    </button>
  );
}

const features = [
  {
    title: "Remembers your day",
    body: "Quietly notes the apps you use and reads what's on screen — so nothing is lost.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    title: "Ask anything",
    body: "Ask about your day and your agents answer from your real, on-device context.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      </svg>
    ),
  },
  {
    title: "Stays on your Mac",
    body: "Your memory and the AI run locally. No cloud, no account — cloud is optional with your own key.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      </svg>
    ),
  },
];

export function App() {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Top bar */}
      <header className="w-full">
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
            <span className="text-text-primary">
              <VMark size={20} />
            </span>
            <span className="font-serif text-[22px] tracking-tight">Vera</span>
          </div>
          <DownloadButton variant="ghost" />
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-[820px] mx-auto px-6 sm:px-8 pt-20 sm:pt-28 pb-16 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border-hairline bg-card-surface text-[12px] font-medium text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            100% local · macOS
          </span>

          <h1 className="font-serif text-[clamp(44px,8vw,76px)] leading-[1.04] tracking-tight mt-7">
            Your day,
            <br />
            remembered.
          </h1>

          <p className="font-sans text-[17px] sm:text-[18px] text-text-muted leading-relaxed max-w-[520px] mt-6">
            Vera quietly remembers what you did and what was on your screen — then
            answers anything about it. Private, on your Mac.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3">
            <DownloadButton variant="solid" />
            <span className="font-sans text-[12px] text-text-faint">
              Free · macOS 12+ · No account
            </span>
          </div>
        </section>

        {/* Features — max 3, lots of whitespace */}
        <section className="max-w-[1000px] mx-auto px-6 sm:px-8 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="card-style p-7 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">
                  {f.icon}
                </div>
                <h3 className="font-serif text-[19px] text-text-primary mt-1">{f.title}</h3>
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-hairline">
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-text-muted select-none">
            <VMark size={15} />
            <span className="font-sans text-[13px]">Vera — Local AI for macOS</span>
          </div>
          <a
            href={`https://github.com/${REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans text-[13px] text-text-faint hover:text-text-primary transition-colors"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

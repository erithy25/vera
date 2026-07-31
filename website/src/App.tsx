import { useState, useEffect } from "react";

/* ===========================================================================
   Vera — marketing site
   ---------------------------------------------------------------------------
   Built entirely from the supplied design system: the tokens in index.css and
   the components named in DESIGN.md. The section sequence follows the
   reference site (frosted nav pill → full-bleed painted hero with a
   glassmorphic overlay card → editorial statement → the four-verticals block →
   a diagram section → the product section → an atmospheric colour moment →
   closing invitation → footer), with Vera's own content in each slot.

   Three rules from the spec that shape almost every line below:
     · the display serif is weight 400 at every size, and carries every
       heading of 27px and up
     · one blue, used as a border and never as a fill
     · a 1px #dee2de hairline is the signature edge — not a shadow
   =========================================================================== */

const REPO = "erithy25/vera";
const DMG_PATH = "/downloads/Vera.dmg";

/* --- Small marks ---------------------------------------------------------- */

/** The circled arrow that rides at the right edge of an action. */
const ArrowCircle = () => (
  <span className="arrow-circle" aria-hidden="true">
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5L7.5 2.5" />
      <path d="M3.6 2.5H7.5V6.4" />
    </svg>
  </span>
);

const CrossMark = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
  </svg>
);

const CheckMark = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 6.4l2.8 2.8L10 3.4" />
  </svg>
);

/** Sun over a landscape — the one glyph in the navigation. */
const SunMark = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="10" r="3.4" />
    <path d="M12 3v1.6M12 15.4V17M4.6 10H3M21 10h-1.6M6.8 4.8l1.1 1.1M16.1 14.1l1.1 1.1M17.2 4.8l-1.1 1.1M7.9 14.1l-1.1 1.1" />
    <path d="M2 20.5h20" />
    <path d="M6 20.5c1.6-2.6 3.2-3.9 4.8-3.9s3.2 1.3 4.8 3.9" />
  </svg>
);

const AppleMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.957 4.45z" />
  </svg>
);

/**
 * A pixel-art key.
 *
 * The design system keeps one element that deliberately breaks the painted
 * language — in the original it is a low-resolution flower. Here it is the
 * thing the whole product is about, drawn at the resolution a key survives in
 * after a video has been compressed.
 */
const PixelKey = ({ scale = 6 }: { scale?: number }) => {
  const rows = [
    "..1111..........",
    ".1....1.........",
    "1......1........",
    "1......1........",
    "1......1........",
    ".1....1.........",
    "..111111111111..",
    "..1..........1..",
    "..1......1.1.1..",
    "..1......1.1.1..",
  ];
  return (
    <svg
      width={rows[0].length * scale}
      height={rows.length * scale}
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rows.map((row, y) =>
        row.split("").map((c, x) =>
          c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null
        )
      )}
    </svg>
  );
};

/* --- Actions -------------------------------------------------------------- */

function DownloadCta({ tone = "primary" }: { tone?: "primary" | "secondary" | "onDark" | "filled" }) {
  const cls =
    tone === "filled"
      ? "btn-filled"
      : tone === "onDark"
        ? "btn-secondary btn-secondary--onDark"
        : tone === "secondary"
          ? "btn-secondary"
          : "btn-primary";
  return (
    <a href={DMG_PATH} download className={cls} aria-label="Download Vera for Mac">
      <AppleMark />
      Download for Mac
      <ArrowCircle />
    </a>
  );
}

/* --- Reusable editorial pieces -------------------------------------------- */

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="font-af text-caption leading-caption tracking-caption font-medium uppercase text-ash">
    {children}
  </span>
);

const Section = ({
  id,
  surface = "parchment",
  children,
}: {
  id?: string;
  surface?: "parchment" | "paper";
  children: React.ReactNode;
}) => (
  <section
    id={id}
    className={`w-full scroll-mt-80 ${surface === "paper" ? "bg-paper" : "bg-parchment"}`}
  >
    <div className="mx-auto max-w-[1200px] px-24 md:px-40 py-64 md:py-80">{children}</div>
  </section>
);

/* --- Navigation ----------------------------------------------------------- */

function Nav() {
  // Over the painted hero the pill is a true frosted panel; once the page
  // scrolls onto parchment, a 6 % white wash over white would disappear, so it
  // takes on the linen fill and the mist hairline instead.
  const [onLight, setOnLight] = useState(false);
  useEffect(() => {
    const onScroll = () => setOnLight(window.scrollY > window.innerHeight * 0.72);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkTone = onLight ? "text-charcoal hover:text-twilight" : "text-mist hover:text-paper";

  return (
    <div className="fixed top-16 md:top-24 left-0 right-0 z-50 flex justify-center px-16 pointer-events-none">
      <nav
        className={`nav-pill ${onLight ? "nav-pill--onLight" : ""} pointer-events-auto flex items-center gap-16 md:gap-24 pl-20 pr-8 py-8 transition-colors duration-300`}
        aria-label="Main"
      >
        <a
          href="#top"
          className={`flex items-center gap-8 no-underline ${onLight ? "text-twilight" : "text-paper"}`}
        >
          <SunMark />
          <span className="display text-subheading leading-none" style={{ color: "inherit" }}>
            Vera
          </span>
        </a>

        <div className="hidden sm:flex items-center gap-16 md:gap-24">
          {[
            ["How it works", "#how"],
            ["What it finds", "#finds"],
            ["Questions", "#faq"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={`font-af text-body-sm font-medium tracking-body-sm no-underline transition-colors ${linkTone}`}
            >
              {label}
            </a>
          ))}
        </div>

        <DownloadCta tone={onLight ? "primary" : "onDark"} />
      </nav>
    </div>
  );
}

/* --- Hero ----------------------------------------------------------------- */

function Hero() {
  return (
    <header id="top" className="relative w-full min-h-[92vh] flex items-end overflow-hidden">
      <picture>
        <source srcSet="/img/hero-night.webp" type="image/webp" />
        <img
          src="/img/hero-night.jpg"
          alt="A painted night scene: an empty desk chair, a monitor glowing in a dark room, a moonlit city beyond the window."
          className="absolute inset-0 w-full h-full object-cover"
          fetchPriority="high"
        />
      </picture>
      {/* Reading scrim. The painting is dark already; this only steadies the
          contrast under the overlay card. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(10,12,18,0.72) 0%, rgba(10,12,18,0.28) 38%, rgba(10,12,18,0.10) 70%)" }}
      />

      <div className="relative w-full mx-auto max-w-[1200px] px-24 md:px-40 pb-48 md:pb-64">
        <div className="card-frosted p-32 md:p-48 max-w-[720px]">
          <span className="font-af text-caption leading-caption tracking-caption font-medium uppercase text-mist">
            A local tool for macOS
          </span>

          <h1 className="display text-heading md:text-display leading-display tracking-display mt-16 text-paper">
            Don't ship the key.
          </h1>

          <p className="font-af text-subheading leading-subheading tracking-subheading text-mist mt-20 max-w-[560px]">
            Vera reads your finished screen recording and tells you which API keys, tokens
            and passwords are visible in it — with the timestamp of each one. Before you
            publish.
          </p>

          <div className="flex flex-wrap items-center gap-16 mt-32">
            <DownloadCta tone="onDark" />
            <a href="#how" className="link-ghost text-mist hover:text-paper">
              How it works
              <ArrowCircle />
            </a>
          </div>

          <p className="font-af text-caption leading-caption tracking-caption text-mist mt-24">
            Free · macOS 12+ · No account · Nothing is uploaded
          </p>
        </div>
      </div>
    </header>
  );
}

/* --- Figure 1: why exact matching fails ----------------------------------- */

function DamagedKey() {
  // The characters Vision actually gets wrong, marked so the eye lands on them.
  const parts: Array<[string, boolean]> = [
    ["5", true], ["k", false], ["-", false], ["p", false], ["r", false],
    ["0", true], ["j", false], ["-", false], ["T", false], ["3", false],
    ["x", false], ["K", false], ["9", false], ["m", false], ["P", false], ["q", false],
  ];
  return (
    <span className="font-mono text-body-sm">
      {parts.map(([c, damaged], i) => (
        <span
          key={i}
          className={damaged ? "text-signal-blue" : "text-charcoal"}
          style={damaged ? { borderBottom: "1px solid var(--color-signal-blue)" } : undefined}
        >
          {c}
        </span>
      ))}
      <span className="text-fog">…</span>
    </span>
  );
}

function FigureOne() {
  return (
    <figure className="card-diagram m-0">
      <div className="bg-paper rounded-xl border border-mist p-24 md:p-32">
        <div className="flex flex-col gap-24">
          <div className="flex flex-col gap-8">
            <Eyebrow>On screen</Eyebrow>
            <span className="font-mono text-body-sm text-charcoal">sk-proj-T3xK9mPq…</span>
          </div>

          <div className="flex items-center gap-12" aria-hidden="true">
            <svg width="12" height="26" viewBox="0 0 12 26" fill="none" stroke="var(--color-fog)" strokeWidth="1">
              <path d="M6 0v20" />
              <path d="M2 16l4 4 4-4" />
            </svg>
            <span className="font-af text-caption leading-caption tracking-caption text-ash">
              read back out of the video
            </span>
          </div>

          <div className="flex flex-col gap-8">
            <Eyebrow>What the reader returns</Eyebrow>
            <DamagedKey />
          </div>

          <hr className="rule" />

          <div className="flex flex-col gap-16">
            <div className="flex items-start gap-12">
              <span className="text-ash mt-4 shrink-0" aria-hidden="true"><CrossMark /></span>
              <div className="flex flex-col gap-4">
                <span className="font-af text-body-sm font-medium tracking-body-sm text-graphite">
                  An exact pattern
                </span>
                <span className="font-af text-caption leading-caption tracking-caption text-ash">
                  Two characters are wrong. Nothing matches. Nothing is reported.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-12">
              <span className="text-signal-blue mt-4 shrink-0" aria-hidden="true"><CheckMark /></span>
              <div className="flex flex-col gap-8">
                <span className="font-af text-body-sm font-medium tracking-body-sm text-graphite">
                  Vera, split in two
                </span>
                <div className="flex flex-wrap items-center gap-8">
                  <span className="font-mono text-caption px-8 py-4 rounded-md border border-signal-blue text-signal-blue">
                    5k-pr0j-
                  </span>
                  <span className="font-af text-caption leading-caption tracking-caption text-ash">
                    matched loosely
                  </span>
                  <span className="font-mono text-caption px-8 py-4 rounded-md border border-mist text-charcoal">
                    T3xK9mPq…
                  </span>
                  <span className="font-af text-caption leading-caption tracking-caption text-ash">
                    length, character set, randomness — never matched exactly
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="font-af text-caption leading-caption tracking-caption text-ash px-12 pt-12">
        Figure 1 — A misread character changes neither the length nor the composition of
        the body. That is why the key is still found.
      </figcaption>
    </figure>
  );
}

/* --- Product preview ------------------------------------------------------ */

/**
 * The app's result list, rebuilt in the site's own tokens.
 *
 * Severity is carried by weight and by the label, not by a traffic-light
 * palette — the system has one blue and no other accent, and inventing a red
 * here would be the one place the whole page stopped being this design.
 */
function ScanPreview() {
  const findings = [
    { level: "Critical", label: "OpenAI Project Key", preview: "sk-proj-••••••••••••Hd", at: "4:12", note: "visible for 6 seconds", strong: true },
    { level: "Critical", label: "Connection string with password", preview: "postgres://•••••••@…", at: "7:48", note: "visible for 2 seconds", strong: true },
    { level: "Info", label: "Stripe Publishable Key", preview: "pk_live_••••••••••••2q", at: "9:05", note: "safe to publish", strong: false },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-8 px-20 py-12 border-b border-mist relative">
        <span className="w-12 h-12 rounded-full bg-mist" />
        <span className="w-12 h-12 rounded-full bg-mist" />
        <span className="w-12 h-12 rounded-full bg-mist" />
        <span className="display absolute left-1/2 -translate-x-1/2 text-caption text-ash">Vera</span>
      </div>

      <div className="bg-linen p-20 md:p-32 flex flex-col gap-20">
        <div className="flex items-center gap-16 rounded-lg border border-dashed border-mist bg-paper px-20 py-16">
          <span className="text-fog shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V5" /><path d="M8 9l4-4 4 4" />
              <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
            </svg>
          </span>
          <span className="display text-subheading text-graphite flex-1 truncate">launch-demo.mov</span>
          <span className="font-af text-caption leading-caption tracking-caption text-ash shrink-0 hidden sm:block">
            12:04 · 724 frames read
          </span>
        </div>

        <div className="card p-20 md:p-24 flex flex-col gap-16">
          <div className="flex items-start gap-12">
            <span className="text-twilight shrink-0 mt-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.6-7.5 9.8-4.4-1.2-7.5-5.2-7.5-9.8V6z" />
                <path d="M12 8.5v4" /><path d="M12 15.5h.01" />
              </svg>
            </span>
            <div className="flex flex-col gap-4">
              <span className="display text-subheading text-graphite">
                2 things to fix before you publish
              </span>
              <span className="font-af text-caption leading-caption tracking-caption text-ash">
                Each one with the moment it appears, worst first.
              </span>
            </div>
          </div>

          <hr className="rule" />

          <ul className="flex flex-col gap-16 list-none p-0 m-0">
            {findings.map((f) => (
              <li key={f.label} className="flex items-center gap-12">
                <span
                  className={`w-8 h-8 rounded-full shrink-0 ${f.strong ? "bg-twilight" : "bg-fog"}`}
                  aria-hidden="true"
                />
                <div className="flex flex-col min-w-0 flex-1 gap-4">
                  <div className="flex items-center gap-8 flex-wrap">
                    <span className="font-af text-body-sm font-medium tracking-body-sm text-graphite">
                      {f.label}
                    </span>
                    <span
                      className={`font-af text-caption leading-caption tracking-caption px-8 py-4 rounded-md border ${
                        f.strong ? "border-twilight text-twilight" : "border-mist text-ash"
                      }`}
                    >
                      {f.level}
                    </span>
                  </div>
                  <span className="font-mono text-caption text-ash truncate">{f.preview}</span>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="display text-subheading text-graphite leading-none">{f.at}</span>
                  <span className="font-af text-caption leading-caption tracking-caption text-ash mt-4">
                    {f.note}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* --- Content -------------------------------------------------------------- */

const VERTICALS = [
  { name: "Git repositories", note: "gitleaks, trufflehog" },
  { name: "CI logs", note: "masked at build time" },
  { name: "Config files", note: "pre-commit hooks" },
  { name: "Pull requests", note: "push protection" },
];

const FINDS = [
  { title: "Provider keys", body: "OpenAI, Anthropic, AWS, GitHub, Google, Stripe, Slack, SendGrid, GitLab, npm, Hugging Face, Linear, Figma, Twilio, Supabase." },
  { title: "Private keys", body: "PEM blocks — RSA, OpenSSH, EC, DSA, PGP and PKCS#8. The header alone is enough." },
  { title: "Connection strings", body: "postgres://, mysql://, mongodb://, redis:// and the rest, whenever a password sits in the URL." },
  { title: "Assigned secrets", body: "PASSWORD=…, api_key: …, Authorization: Bearer … — when the value looks random rather than word-like." },
];

const IGNORED = [
  "sk-your-api-key-here",
  "AKIAIOSFODNN7EXAMPLE",
  "process.env.OPENAI_API_KEY",
  "a074f80ab12cd34ef567…",
  "dbf38fa8-c92d-5164-…",
  "index-Dz8mcTBK.js",
  "v7.0.4",
  "127.0.0.1:5173",
];

const FAQS: Array<[string, string]> = [
  [
    "Does my recording get uploaded?",
    "No. The file is read on your Mac and never leaves it. Vera makes no network requests while scanning — the only connection it ever opens is the update check, which sends nothing but a version number.",
  ],
  [
    "Does it store what it finds?",
    "No. There is no scan history and no cache. A finding holds the credential's type, its timestamp and a masked preview — the value itself is thrown away before the result reaches the window. Close the app and the results are gone.",
  ],
  [
    "Won't it flag every example key in my tutorial?",
    "That was the first thing built. Placeholders, the example values from providers' own docs, environment references, git SHAs, UUIDs, build hashes and version numbers are all recognised and ignored.",
  ],
  [
    "Can it blur or remove the secret for me?",
    "No, and that is deliberate. Vera finds; you fix. Editing the video would mean re-encoding it and losing quality, and you already have a tool that cuts video. Finding the frame is the hard part.",
  ],
  [
    "What does it cost?",
    "Vera is free. There is no account, no sign-up and no usage limit.",
  ],
  [
    "If it says clean, am I safe?",
    "It means Vera found none of the credential formats it knows about in the frames it sampled. It will not catch a password typed into a form, or a key that flashes up between two samples. It is a good last check, not a guarantee.",
  ],
];

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-mist">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-24 py-24 text-left bg-transparent border-0 cursor-pointer"
      >
        <span className="display text-heading-sm leading-subheading tracking-subheading md:tracking-heading-sm">
          {q}
        </span>
        <span
          className={`text-ash shrink-0 mt-8 transition-transform duration-200 ${open ? "rotate-45" : ""}`}
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      {open && (
        <p className="font-af text-body leading-body tracking-body text-ash max-w-[720px] pb-24 m-0">
          {a}
        </p>
      )}
    </div>
  );
}

/* --- Page ----------------------------------------------------------------- */

export function App() {
  // The version actually being served, read from the same manifest the release
  // script writes next to the DMG — so the number here can never drift from
  // the real download.
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
    <div className="min-h-dvh flex flex-col bg-parchment">
      <Nav />
      <Hero />

      <main className="flex-1">
        {/* --- The claim, stated plainly ------------------------------------ */}
        <Section id="how">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-32 md:gap-48">
            <div className="md:col-span-7">
              <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg m-0">
                A scanner that reads video, not files.
              </h2>
            </div>
            <div className="md:col-span-5 flex flex-col gap-24">
              <p className="font-af text-body leading-body tracking-body text-ash m-0">
                Vera is a small desktop app for people who record their screen — demos,
                tutorials, bug reports, conference talks. It looks at the finished file the
                way a viewer would, and finds the credentials you never noticed were on
                screen.
              </p>
              <a href="#finds" className="link-ghost">
                See what it finds
                <ArrowCircle />
              </a>
            </div>
          </div>
        </Section>

        {/* --- Editorial statement ------------------------------------------ */}
        <Section surface="paper">
          <div className="max-w-[860px]">
            <p className="display text-heading-sm leading-heading-sm tracking-heading-sm m-0">
              We think the last thing standing between you and publishing should never be a
              key you did not see. Not a credential rotated in a hurry, not a video pulled
              back down, not an apology in the replies.
            </p>
            <p className="display text-heading-sm leading-heading-sm tracking-heading-sm text-ash mt-32 m-0">
              Where checking a recording before it goes out is as ordinary as reading a
              draft back to yourself.
            </p>
          </div>
        </Section>

        {/* --- The four verticals, and the gap ------------------------------ */}
        <Section>
          <div className="max-w-[860px]">
            <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg m-0">
              Secret scanning already works well — nearly everywhere.
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-16 mt-48">
            {VERTICALS.map((v) => (
              <div key={v.name} className="card p-16 flex flex-col gap-8">
                <span className="font-af text-body-sm font-medium tracking-body-sm text-graphite">
                  {v.name}
                </span>
                <span className="font-af text-caption leading-caption tracking-caption text-ash">
                  {v.note}
                </span>
              </div>
            ))}
          </div>

          <p className="display text-heading-sm leading-heading-sm tracking-heading-sm text-graphite mt-48 max-w-[720px] m-0">
            All of them assume perfect text. A video has none.
          </p>
        </Section>

        {/* --- Figure 1 ------------------------------------------------------ */}
        <Section surface="paper">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-40 md:gap-48 items-start">
            <div className="md:col-span-6 flex flex-col gap-24">
              <Eyebrow>The problem</Eyebrow>
              <h2 className="display text-heading leading-heading tracking-heading m-0">
                The text was never read correctly.
              </h2>
              <p className="font-af text-body leading-body tracking-body text-ash m-0">
                Text pulled back out of a video is always a little wrong. Depending on the
                font and the resolution, <span className="font-mono text-body-sm">o</span>{" "}
                comes back as <span className="font-mono text-body-sm">0</span>,{" "}
                <span className="font-mono text-body-sm">S</span> as{" "}
                <span className="font-mono text-body-sm">5</span>, and a hyphen as an en
                dash. Every exact pattern fails on that, silently.
              </p>
              <p className="font-af text-body leading-body tracking-body text-ash m-0">
                So Vera splits each pattern in two. The prefix is matched loosely, allowing
                for the shapes that monospace fonts genuinely confuse. The body is never
                matched exactly at all — only its length, its character set and how random
                it is.
              </p>
            </div>

            <div className="md:col-span-6">
              <FigureOne />
            </div>
          </div>
        </Section>

        {/* --- Atmospheric divider ------------------------------------------ */}
        <div className="w-full bg-parchment">
          <div className="mx-auto max-w-[1200px] px-24 md:px-40">
            <div className="surface-atmospheric relative">
              <picture>
                <source srcSet="/img/meadow-dusk.webp" type="image/webp" />
                <img
                  src="/img/meadow-dusk.jpg"
                  alt="A painted meadow at dusk, golden poppies against a deep blue sky."
                  className="w-full h-[280px] md:h-[420px] object-cover block"
                  loading="lazy"
                />
              </picture>
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "linear-gradient(to right, rgba(10,12,18,0.62) 0%, rgba(10,12,18,0.12) 62%)" }}
              />
              <div className="absolute inset-0 flex items-center">
                <p className="display text-heading-sm md:text-heading leading-heading tracking-heading text-paper max-w-[560px] px-32 md:px-64 m-0">
                  You get one shot at publishing something for the first time.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- The product --------------------------------------------------- */}
        <Section id="finds">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-40 md:gap-48 items-start">
            <div className="md:col-span-5 flex flex-col gap-24">
              <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg m-0">
                Vera tells you exactly where to look.
              </h2>
              <p className="font-af text-body leading-body tracking-body text-ash m-0">
                Drop the file in. A ten-minute recording takes about a minute. You get a
                list, worst first, each entry with the moment it appears, how long it stays
                on screen, and the frame itself.
              </p>
              <div className="flex flex-wrap items-center gap-16">
                <DownloadCta />
              </div>
              <p className="font-af text-caption leading-caption tracking-caption text-ash m-0">
                Free · macOS 12+ · No account
                {publishedVersion ? ` · v${publishedVersion}` : ""}
              </p>
            </div>

            <div className="md:col-span-7">
              <ScanPreview />
            </div>
          </div>

          <div className="mt-64">
            <span className="font-af text-body leading-body tracking-body text-charcoal">
              Vera can find things like
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mt-24">
              {FINDS.map((f) => (
                <div key={f.title} className="card p-16 flex flex-col gap-8">
                  <span className="display text-subheading text-graphite">{f.title}</span>
                  <span className="font-af text-caption leading-caption tracking-caption text-ash">
                    {f.body}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="display text-heading-sm leading-heading-sm tracking-heading-sm text-graphite mt-64 max-w-[720px] m-0">
            Everyone checks their code. Almost nobody checks the video.
          </p>
        </Section>

        {/* --- What it ignores ---------------------------------------------- */}
        <Section surface="paper">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-40 md:gap-48 items-start">
            <div className="md:col-span-6 flex flex-col gap-24">
              <div className="text-fog">
                <PixelKey />
              </div>
              <h2 className="display text-heading leading-heading tracking-heading m-0">
                And what it stays quiet about.
              </h2>
              <p className="font-af text-body leading-body tracking-body text-ash m-0">
                You record tutorials. Your screen is covered in things that look exactly
                like secrets and are not. A tool that cries wolf on your own example keys
                is one you stop opening after the second run.
              </p>
            </div>

            <div className="md:col-span-6">
              <div className="card-diagram">
                <div className="bg-paper rounded-xl border border-mist p-24 flex flex-wrap gap-8">
                  {IGNORED.map((s) => (
                    <span
                      key={s}
                      className="font-mono text-caption text-ash border border-mist rounded-md px-8 py-4"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* --- The one saturated moment -------------------------------------- */}
        <div className="w-full bg-parchment">
          <div className="mx-auto max-w-[1200px] px-24 md:px-40">
            <div className="surface-atmospheric bg-cerulean p-40 md:p-80">
              <div className="max-w-[760px] flex flex-col gap-24">
                <span className="font-af text-caption leading-caption tracking-caption font-medium uppercase text-paper">
                  Local only
                </span>
                <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg text-paper m-0">
                  Your recording never leaves your Mac.
                </h2>
                <p className="font-af text-body leading-body tracking-body text-paper m-0">
                  No upload, no account, no server, no telemetry. Nothing is stored either —
                  not the recording, not the frames, not the text read out of them, not even
                  the findings. A tool that hunts for your credentials is the last one that
                  should keep a copy of them.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- FAQ ------------------------------------------------------------ */}
        <Section id="faq">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-32 md:gap-48">
            <div className="md:col-span-4">
              <h2 className="display text-heading leading-heading tracking-heading m-0">
                Good to know.
              </h2>
            </div>
            <div className="md:col-span-8">
              <div className="border-t border-mist">
                {FAQS.map(([q, a]) => (
                  <FaqRow key={q} q={q} a={a} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* --- Closing invitation --------------------------------------------- */}
        <Section surface="paper">
          <div className="max-w-[860px] flex flex-col gap-32">
            <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg m-0">
              One minute now, or a rotated key and a re-uploaded video later.
            </h2>
            <div className="flex flex-wrap items-center gap-16">
              <DownloadCta />
              <a
                href={`https://github.com/${REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-ghost"
              >
                Read the source
                <ArrowCircle />
              </a>
            </div>
          </div>
        </Section>
      </main>

      {/* --- Footer ---------------------------------------------------------- */}
      <footer className="w-full bg-paper border-t border-mist">
        <div className="mx-auto max-w-[1200px] px-24 md:px-40 py-64">
          <p className="display text-heading-sm leading-heading-sm tracking-heading-sm max-w-[720px] m-0">
            Vera is a last check, not a promise. Keep the keys off the screen while you
            record — and let it catch the day you forget.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-32 mt-64">
            <div className="flex flex-col gap-12">
              <div className="flex items-center gap-8 text-twilight">
                <SunMark size={16} />
                <span className="display text-subheading">Vera</span>
              </div>
              <span className="font-af text-caption leading-caption tracking-caption text-ash">
                Finds the API keys left visible in your screen recordings. Made for macOS.
              </span>
            </div>

            <div className="flex flex-col gap-12">
              <Eyebrow>Product</Eyebrow>
              {[
                ["How it works", "#how"],
                ["What it finds", "#finds"],
                ["Questions", "#faq"],
              ].map(([label, href]) => (
                <a key={href} href={href} className="font-af text-caption leading-caption tracking-caption text-ash hover:text-twilight no-underline transition-colors">
                  {label}
                </a>
              ))}
            </div>

            <div className="flex flex-col gap-12">
              <Eyebrow>More</Eyebrow>
              <a href={DMG_PATH} download className="font-af text-caption leading-caption tracking-caption text-ash hover:text-twilight no-underline transition-colors">
                Download
              </a>
              <a
                href={`https://github.com/${REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-af text-caption leading-caption tracking-caption text-ash hover:text-twilight no-underline transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>

          <hr className="rule mt-48" />
          <span className="block font-af text-caption leading-caption tracking-caption text-ash pt-24">
            © {new Date().getFullYear()} Vera · Recording scanner for macOS
            {publishedVersion ? ` · v${publishedVersion}` : ""}
          </span>
        </div>
      </footer>
    </div>
  );
}

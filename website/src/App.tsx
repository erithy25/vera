import { Fragment, useState, useEffect } from "react";
import { ReaderLab } from "./ReaderLab";

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

   The page is read in two registers. Light blocks alternate Paper and Linen and
   hold the argument; five full-bleed bands — dawn, dusk, meadow, cerulean,
   nightfall — hold the pictures and the raised voice. Parchment is no longer a
   section surface: against Paper it is a step of 0.15 L*, which nobody can see,
   and six of them in a row were the reason the page below the hero read as one
   unbroken white column.
   =========================================================================== */

const REPO = "erithy25/vera";
const DMG_PATH = "/downloads/Vera.dmg";

/* --- Motion --------------------------------------------------------------- */

/**
 * Reveals anything carrying `data-reveal` as it comes into view.
 *
 * One observer for the whole page rather than a ref per element: the page is
 * static, so there is nothing to re-observe, and it keeps the markup down to a
 * single attribute. Elements are unobserved once shown — a reveal that replayed
 * on the way back up would turn a quiet page into a nervous one.
 *
 * If IntersectionObserver is missing, everything is marked visible at once. The
 * CSS hides `[data-reveal]` only inside `prefers-reduced-motion: no-preference`,
 * so with motion reduced this hook has nothing to do either.
 */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      },
      // Fire a little before the element is fully in view, so the movement has
      // finished by the time it is somewhere you are actually looking.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/** Stagger helper: `delay(i)` spaces a group out without magic numbers inline. */
const delay = (i: number, step = 70) =>
  ({ "--reveal-delay": `${i * step}ms` }) as React.CSSProperties;

/**
 * Splits a headline so each word can set itself in turn.
 *
 * The separating space is a text node *between* the spans, not inside them. A
 * non-breaking space inside each word looks identical on a wide screen and then
 * refuses to wrap on a narrow one, pushing the headline straight out of the
 * card — which is exactly what it did before this was written down.
 */
function SetInWords({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="word" style={{ "--d": `${from + i * 70}ms` } as React.CSSProperties}>
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

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

/* --- Pixel marks ----------------------------------------------------------- *
 *
 * The design system keeps one element that deliberately breaks the painted
 * language — in the original it is a low-resolution flower. Here it is a small
 * family of landscape marks drawn at the resolution things survive at after a
 * video has been compressed, which is the whole subject of the product.
 *
 * They are hand-plotted grids rather than pictures: a few hundred bytes each,
 * no request, no third party, and the colour follows `currentColor` so they
 * take the palette instead of carrying one of their own. Drawn silhouette
 * first, because at the size these ship the interior disappears and only the
 * outline is left.
 *
 * `tree` and `treeSmall` are the same subject at two resolutions. That is not
 * duplication — a pixel sprite is drawn for a size, and the tall drawing
 * scaled down to a chapter mark would be mud.
 */
const PIXEL_MARKS = {
  sun: [
    ".......1.......",
    "..1....1....1..",
    "...1.......1...",
    "...............",
    "......111......",
    ".....11111.....",
    ".11..11111..11.",
    ".....11111.....",
    "......111......",
    "...............",
    "...1.......1...",
    "..1....1....1..",
    ".......1.......",
  ],
  ridge: [
    "...1.......",
    "..111......",
    ".11111..1..",
    "1111111111.",
    "11111111111",
    "11111111111",
  ],
  fern: [
    "......1......",
    ".....111.....",
    "....1.1.1....",
    ".....111.....",
    "...1..1..1...",
    "....1.1.1....",
    "..1...1...1..",
    "...1..1..1...",
    ".1....1....1.",
    "..1...1...1..",
    "1.....1.....1",
    ".1....1....1.",
    "..1...1...1..",
    "...1..1..1...",
    "......1......",
    "......1......",
  ],
  bird: [
    "11.........11",
    "111.......111",
    ".111.....111.",
    "..111...111..",
    "...1111111...",
    "....11111....",
    ".....111.....",
  ],
  moon: [
    ".....111.....",
    "...111.......",
    "..111........",
    ".111.........",
    ".111.........",
    "111..........",
    "111..........",
    "111..........",
    ".111.........",
    ".111.........",
    "..111........",
    "...111.......",
    ".....111.....",
  ],
  treeSmall: [
    "....11111....",
    "..111111111..",
    ".11111111111.",
    "1111.1111111.",
    "1111111111111",
    ".111111.11111",
    ".11111111111.",
    "..111111111..",
    "...1111111...",
    ".....111.....",
    ".....111.....",
    ".....111.....",
    ".....111.....",
    ".....111.....",
    "....11111....",
    "..11..111..11",
  ],
  tree: [
    ".......11.111........",
    "....1.1111111.11.....",
    "...11111.11111111....",
    "..1111111111111.11.1.",
    ".1.11111111111111111.",
    "1111111.111111111111.",
    "1.111111111111.11111.",
    "111111111.1111111111.",
    ".111111111111111.1111",
    "11111.11111111111111.",
    ".111111111111.111111.",
    "1.11111111111111.11..",
    "..1111111.111111111..",
    ".1.11111111111.11....",
    "...1111111111111.....",
    ".....1111.11111......",
    "......111111111......",
    "........11111........",
    ".........111.........",
    ".........111.........",
    ".........111.........",
    ".........111.........",
    ".........111.........",
    ".........111.........",
    ".........111.........",
    "........11111........",
    ".....1111111111......",
    "..111..1111111..111..",
  ],
  key: [
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
  ],
} as const;

type PixelName = keyof typeof PIXEL_MARKS;

/**
 * One grid, rendered as blocks. `scale` is always a whole number — a fractional
 * one puts the block edges between device pixels and the whole point of the
 * thing goes soft.
 */
const PixelMark = ({
  name,
  scale = 2,
  className = "",
}: {
  name: PixelName;
  scale?: number;
  className?: string;
}) => {
  const rows = PIXEL_MARKS[name];
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
      focusable="false"
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
    // No aria-label: the visible text is already the accessible name, and
    // "Download Vera for Mac" would not contain the visible "Download for Mac",
    // which is exactly what WCAG 2.5.3 (Label in Name) forbids — voice-control
    // users say what they read.
    <a href={DMG_PATH} download className={cls}>
      <AppleMark />
      Download for Mac
      <ArrowCircle />
    </a>
  );
}

/* --- Reusable editorial pieces -------------------------------------------- */

/**
 * `tone` is not decoration, it is the contrast budget. Ash is right on Paper and
 * measures 2.8:1 on Dusk; Mist is right on Dusk and measures 4.1:1 on Cerulean,
 * which is the one surface saturated enough that only pure white clears AA at
 * 13px.
 */
const Eyebrow = ({
  children,
  tone = "light",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark" | "onColor";
}) => (
  <span
    className={`font-af text-caption leading-caption tracking-caption font-medium uppercase ${
      tone === "onColor" ? "text-paper" : tone === "dark" ? "text-mist" : "text-ash"
    }`}
  >
    {children}
  </span>
);

/**
 * A numbered chapter mark.
 *
 * The page is six screens long and every block used to open the same way, so
 * there was nothing to tell you where you were in it. The numeral is set in the
 * serif against the eyebrow's 13px sans, which is where the hierarchy comes
 * from — not from making it paler, which would have cost the contrast.
 */
const ChapterMark = ({
  n,
  mark,
  scale = 2,
  children,
}: {
  n: string;
  mark: PixelName;
  scale?: number;
  children: React.ReactNode;
}) => (
  <span className="chapter-mark">
    <span className="chapter-mark-glyph text-fog">
      <PixelMark name={mark} scale={scale} />
    </span>
    <span className="chapter-mark-text">
      <span className="display text-subheading text-ash leading-none">{n}</span>
      <Eyebrow>{children}</Eyebrow>
    </span>
  </span>
);

/**
 * A light block: the argument, on one of the two readable surfaces.
 *
 * Paper and Linen alternate down the page. Parchment is deliberately not an
 * option — it differs from Paper by 0.15 L*, so alternating the two produced a
 * page with no rhythm at all.
 */
const Section = ({
  id,
  surface = "paper",
  seam = false,
  children,
}: {
  id?: string;
  surface?: "paper" | "linen";
  seam?: boolean;
  children: React.ReactNode;
}) => (
  <section
    id={id}
    className={`w-full scroll-mt-80 ${surface === "linen" ? "surface-linen" : "surface-paper"} ${
      seam ? "seam" : ""
    }`}
  >
    <div className="mx-auto max-w-[1200px] px-24 md:px-40 py-64 md:py-80">{children}</div>
  </section>
);

/**
 * A full-bleed band: the page's own width, its own surface, and — where there
 * is one — a painting behind the text.
 *
 * `data-dark` marks the bands the navigation pill has to invert over. Note that
 * `data-reveal` is never put on the band itself: a 14px rise on an element that
 * owns a surface opens a visible seam against the block above it for the whole
 * 800ms of the transition. The reveal goes on the text inside.
 */
function Band({
  id,
  tone,
  art,
  alt,
  className = "",
  innerClassName = "",
  children,
}: {
  id?: string;
  tone: "dawn" | "dusk" | "night" | "cerulean";
  art?: { webp: string; jpg: string };
  alt?: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  const dark = tone !== "dawn";
  return (
    <section
      id={id}
      {...(dark ? { "data-dark": "" } : {})}
      className={`band band--${tone} w-full scroll-mt-80 ${className}`}
    >
      {art ? (
        <>
          <picture>
            <source srcSet={art.webp} type="image/webp" />
            <img src={art.jpg} alt={alt ?? ""} className="band-art" loading="lazy" />
          </picture>
          <div aria-hidden="true" className={`band-scrim scrim--${tone}`} />
        </>
      ) : null}
      <div className={`band-inner mx-auto max-w-[1200px] px-24 md:px-40 py-64 md:py-80 ${innerClassName}`}>
        {children}
      </div>
    </section>
  );
}

/* --- Navigation ----------------------------------------------------------- */

function Nav() {
  // The pill has to invert over the hero and over four more dark bands further
  // down. A single scroll threshold could only ever get the first of them right,
  // so the state is read from whatever is actually underneath the pill.
  const [onLight, setOnLight] = useState(false);
  useEffect(() => {
    const PROBE_Y = 48; // inside the pill's own band, a little below the top edge
    let frame = 0;
    const measure = () => {
      frame = 0;
      let dark = false;
      document.querySelectorAll<HTMLElement>("[data-dark]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= PROBE_Y && r.bottom >= PROBE_Y) dark = true;
      });
      setOnLight(!dark);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const linkTone = onLight ? "text-charcoal hover:text-twilight" : "text-mist hover:text-paper";

  return (
    <div className="fixed top-16 md:top-24 left-0 right-0 z-50 flex justify-center px-16 pointer-events-none">
      <nav
        className={`nav-pill fade-in ${onLight ? "nav-pill--onLight" : ""} pointer-events-auto flex items-center gap-16 md:gap-24 pl-20 pr-8 py-8 transition-colors duration-300`}
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
  // The painting drifts at a third of the scroll rate. Written to a CSS custom
  // property from inside a rAF so the listener never lays out on the scroll
  // thread, and capped so it can never uncover the bottom edge.
  const [parallax, setParallax] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setParallax(Math.min(window.scrollY * 0.32, window.innerHeight * 0.3));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header id="top" data-dark className="hero-full relative w-full flex items-end overflow-hidden">
      <div className="hero-parallax absolute inset-0" style={{ "--parallax": `${parallax}px` } as React.CSSProperties}>
        <picture>
          <source srcSet="/img/hero-valley.webp" type="image/webp" />
          <img
            src="/img/hero-valley.jpg"
            alt="A painted twilight landscape: dark hills falling away into a wide valley, a river catching the last light, a distant range under an indigo sky."
            className="hero-art absolute inset-0 w-full h-full object-cover"
            fetchPriority="high"
          />
        </picture>
      </div>
      {/* Reading scrim. The painting is dark already; this only steadies the
          contrast under the overlay card. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(10,12,18,0.72) 0%, rgba(10,12,18,0.28) 38%, rgba(10,12,18,0.10) 70%)" }}
      />

      <div className="relative w-full mx-auto max-w-[1200px] px-24 md:px-40 pb-48 md:pb-64">
        <div className="card-frosted p-32 md:p-48 max-w-[720px] fade-in" style={{ "--d": "60ms" } as React.CSSProperties}>
          <span className="font-af text-caption leading-caption tracking-caption font-medium uppercase text-mist fade-in" style={{ "--d": "180ms" } as React.CSSProperties}>
            A local tool for macOS
          </span>

          <h1 className="display display--hero text-heading md:text-display leading-display tracking-display mt-16 text-paper">
            <SetInWords text="Don't ship the key." from={280} />
          </h1>

          <p className="font-af text-subheading leading-subheading tracking-subheading text-mist mt-20 max-w-[560px] fade-in" style={{ "--d": "500ms" } as React.CSSProperties}>
            Vera reads your finished screen recording and tells you which API keys, tokens
            and passwords are visible in it — with the timestamp of each one. Before you
            publish.
          </p>

          <div className="flex flex-wrap items-center gap-16 mt-32 fade-in" style={{ "--d": "620ms" } as React.CSSProperties}>
            <DownloadCta tone="onDark" />
            <a href="#how" className="link-ghost text-mist hover:text-paper">
              How it works
              <ArrowCircle />
            </a>
          </div>

          <p className="font-af text-caption leading-caption tracking-caption text-mist mt-24 fade-in" style={{ "--d": "740ms" } as React.CSSProperties}>
            Free · macOS 12+ · No account · Nothing is uploaded
          </p>
        </div>
      </div>
    </header>
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
            {findings.map((f, i) => (
              <li key={f.label} className="flex items-center gap-12" data-reveal style={delay(i, 130)}>
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
  { title: "Assigned secrets", body: "PASSWORD=…, api_key: …, and Authorization: Bearer … — whenever the value looks random rather than word-like." },
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

function FaqRow({ q, a, n }: { q: string; a: string; n: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-mist">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start gap-16 md:gap-24 py-24 text-left bg-transparent border-0 cursor-pointer"
      >
        <span className="font-af text-caption leading-caption tracking-caption text-ash mt-12 shrink-0 w-24 hidden sm:block" aria-hidden="true">
          {String(n).padStart(2, "0")}
        </span>
        <span className="display text-heading-sm leading-heading-sm tracking-heading-sm flex-1">
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
      <div className={`disclosure ${open ? "is-open" : ""}`}>
        <div>
          <p className="font-af text-body leading-body tracking-body text-ash max-w-[720px] pb-24 sm:pl-48 m-0">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

/* --- Page ----------------------------------------------------------------- */

export function App() {
  useReveal();

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
        {/* --- 01 · The claim, stated plainly -------------------------------- */}
        <Section id="how">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-32 md:gap-48 items-end">
            <div className="md:col-span-7 flex flex-col gap-24" data-reveal>
              <ChapterMark n="01" mark="sun">What it is</ChapterMark>
              <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg m-0">
                A scanner that reads video, not files.
              </h2>
            </div>
            <div className="md:col-span-5 flex flex-col gap-24" data-reveal style={delay(1, 120)}>
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

        {/* --- Dawn: the editorial statement, on the light painting ---------- */}
        {/* The tonal opposite of the hero and the only place on the page where
            dark type sits on a picture. */}
        <Band
          tone="dawn"
          art={{ webp: "/img/dawn-upland.webp", jpg: "/img/dawn-upland.jpg" }}
          alt="A painted upland at first light: pale gold sky, mist lying in the folds of green-grey hills, a thin road curving away."
          innerClassName="md:py-[128px]"
        >
          <div className="max-w-[640px]" data-reveal>
            <p className="display display-prose text-heading-sm md:text-heading leading-heading-sm md:leading-heading tracking-heading-sm md:tracking-heading text-graphite m-0">
              We think the last thing standing between you and publishing should never be a
              key you did not see. Not a credential rotated in a hurry, not a video pulled
              back down, not an apology in the replies.
            </p>
            <p
              className="display display-prose text-heading-sm leading-heading-sm tracking-heading-sm text-charcoal mt-32 m-0"
              data-reveal
              style={delay(1, 160)}
            >
              Where checking a recording before it goes out is as ordinary as reading a
              draft back to yourself.
            </p>
          </div>
        </Band>

        {/* --- 02 · The four verticals --------------------------------------- */}
        <Section surface="linen">
          <div className="max-w-[860px] flex flex-col gap-32" data-reveal>
            <ChapterMark n="02" mark="ridge" scale={3}>The gap</ChapterMark>
            <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg m-0">
              Secret scanning already works well — nearly everywhere.
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-16 mt-48">
            {VERTICALS.map((v, i) => (
              <div key={v.name} className="card p-16 flex flex-col gap-8" data-reveal style={delay(i)}>
                <span className="font-af text-body-sm font-medium tracking-body-sm text-graphite">
                  {v.name}
                </span>
                <span className="font-af text-caption leading-caption tracking-caption text-ash">
                  {v.note}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* --- Dusk: the thesis, alone on a dark ground ---------------------- */}
        {/* Lifted out of the block above, where it was a closing line nobody
            reached. It is the sentence the entire product rests on, so it gets a
            screen and no picture to compete with. */}
        <Band tone="dusk" innerClassName="md:py-[112px]">
          <p
            className="display text-heading md:text-display leading-display tracking-display text-paper max-w-[900px] m-0"
            data-reveal
          >
            All of them assume perfect text. A video has none.
          </p>
        </Band>

        {/* --- 03 · Figure 1 ------------------------------------------------- */}
        <Section>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-40 md:gap-48 items-start">
            <div className="md:col-span-5 flex flex-col gap-24" data-reveal>
              <ChapterMark n="03" mark="fern">The problem</ChapterMark>
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

            <div className="md:col-start-7 md:col-span-6" data-reveal style={delay(1, 140)}>
              <ReaderLab />
            </div>
          </div>
        </Section>

        {/* --- The meadow: the page's one framed picture --------------------- */}
        {/* Kept inset, with the 24px radius and the halo, while everything else
            went full-bleed. `.surface-atmospheric` is a component of the system,
            and one deliberate frame among four bleeds reads as a choice. */}
        <div className="w-full surface-paper">
          <div className="mx-auto max-w-[1200px] px-24 md:px-40 pb-64 md:pb-80">
            {/* Deliberately not `data-dark`: the navigation pill passes over the
                brightest part of this painting, where white nav links measure
                3.7:1. The light pill reads cleanly on it instead. */}
            <div className="surface-atmospheric relative">
              <picture>
                <source srcSet="/img/meadow-dusk.webp" type="image/webp" />
                <img
                  src="/img/meadow-dusk.jpg"
                  alt="A painted meadow at dusk, golden poppies against a deep blue sky."
                  className="w-full h-[400px] md:h-[520px] object-cover block"
                  style={{ objectPosition: "50% 30%" }}
                  loading="lazy"
                />
              </picture>
              {/* The wash runs down, not across, because the picture does: the
                  burning horizon sits in the top third and the grass at the foot
                  is nearly black. A left-to-right wash left the end of the line
                  over bare poppies. Bottom-weighted, with the line down in the
                  grass and the sky left open above it, the same sentence sits on
                  the darkest part of the painting. */}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--color-dusk) 6%, transparent) 0%, color-mix(in srgb, var(--color-dusk) 22%, transparent) 46%, color-mix(in srgb, var(--color-dusk) 62%, transparent) 100%)",
                }}
              />
              <div className="absolute inset-0 flex items-end">
                <p
                  // 27px on a phone, not 40px: at 40px on a 342px measure this
                  // sentence runs five lines and fills the painting edge to
                  // edge, leaving nothing of the picture to see.
                  className="display text-heading-sm md:text-heading-lg leading-heading tracking-heading text-paper max-w-[620px] px-32 md:px-64 pb-32 md:pb-48 m-0"
                  data-reveal
                >
                  You get one shot at publishing something for the first time.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- 04 · The product ---------------------------------------------- */}
        <Section id="finds" surface="linen" seam>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-40 md:gap-48 items-start">
            <div className="md:col-span-5 flex flex-col gap-24" data-reveal>
              <ChapterMark n="04" mark="bird" scale={3}>The app</ChapterMark>
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

            <div className="md:col-span-7" data-reveal style={delay(1, 140)}>
              <ScanPreview />
            </div>
          </div>

          <div className="mt-64">
            <div data-reveal>
              <Eyebrow>Vera can find things like</Eyebrow>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mt-24">
              {FINDS.map((f, i) => (
                <div key={f.title} className="card p-16 flex flex-col gap-8" data-reveal style={delay(i, 90)}>
                  <span className="display text-subheading text-graphite">{f.title}</span>
                  {/* Not the 13px caption these were set in: they are real
                      sentences, one of them listing fifteen provider names. */}
                  <span className="font-af text-body-sm leading-body tracking-body-sm text-ash">
                    {f.body}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p
            className="display display-prose text-heading-sm md:text-heading leading-heading-sm md:leading-heading tracking-heading-sm md:tracking-heading text-graphite mt-64 md:mt-80 max-w-[820px] m-0"
            data-reveal
          >
            Everyone checks their code. Almost nobody checks the video.
          </p>
        </Section>

        {/* --- 05 · What it ignores ------------------------------------------ */}
        <Section seam>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-40 md:gap-48 items-start">
            <div className="md:col-span-5 flex flex-col gap-24" data-reveal>
              <ChapterMark n="05" mark="treeSmall">What it ignores</ChapterMark>
              <div className="plate text-fog">
                <PixelMark name="key" scale={5} />
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

            <div className="md:col-start-7 md:col-span-6" data-reveal style={delay(1, 140)}>
              <div className="card-diagram">
                <div className="bg-paper rounded-xl border border-mist p-24 flex flex-wrap gap-8">
                  {IGNORED.map((s, i) => (
                    <span
                      key={s}
                      data-reveal
                      style={delay(i, 55)}
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

        {/* --- The one saturated moment, at full width ----------------------- */}
        {/* The paragraph is set in the display serif at 27px rather than 16px
            Inter. White on Cerulean measures 4.28:1 — under AA for body copy and
            over it for large text — so the size is doing accessibility work as
            well as typographic work. */}
        <Band tone="cerulean" innerClassName="md:py-[112px]">
          <div className="max-w-[860px] flex flex-col gap-24">
            {/* A deck rather than an eyebrow. At 13px no colour in the palette
                clears AA on Cerulean; at 27px the 3:1 large-text bar applies and
                Mist clears it, so the size is doing the accessibility work. */}
            <p
              className="display text-heading-sm leading-heading-sm tracking-heading-sm text-mist m-0"
              data-reveal
            >
              Local only.
            </p>
            <h2
              className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg text-paper m-0"
              data-reveal
              style={delay(1, 100)}
            >
              Your recording never leaves your Mac.
            </h2>
            <p
              className="display display-prose text-heading-sm leading-heading-sm tracking-heading-sm text-paper max-w-[860px] m-0"
              data-reveal
              style={delay(2, 100)}
            >
              No upload, no account, no server, no telemetry. Nothing is stored either —
              not the recording, not the frames, not the text read out of them, not even
              the findings. A tool that hunts for your credentials is the last one that
              should keep a copy of them.
            </p>
          </div>
        </Band>

        {/* --- 06 · FAQ ------------------------------------------------------ */}
        <Section id="faq" surface="linen">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-32 md:gap-48">
            <div className="md:col-span-4 rail" data-reveal>
              <div className="flex flex-col gap-24">
                <ChapterMark n="06" mark="moon">Questions</ChapterMark>
                <h2 className="display text-heading leading-heading tracking-heading m-0">
                  Good to know.
                </h2>
              </div>
            </div>
            <div className="md:col-span-8" data-reveal style={delay(1, 120)}>
              <div className="border-t border-mist">
                {FAQS.map(([q, a], i) => (
                  <FaqRow key={q} q={q} a={a} n={i + 1} />
                ))}
              </div>
            </div>
          </div>
        </Section>
        {/* --- Nightfall: the closing invitation ----------------------------- */}
        {/* The page opens on twilight and ends on night. The painting is anchored
            to the top of the band at its own aspect ratio and Dusk fills the rest,
            so the footer's small print below sits on flat colour, not a picture.
            The invitation and the footer are two elements on one continuous
            ground rather than one element, because a <footer> nested inside a
            <section> stops being the page's contentinfo landmark. */}
        <Band
          tone="night"
          art={{ webp: "/img/nightfall.webp", jpg: "/img/nightfall.jpg" }}
          alt="A painted nightfall: a long low ridge under a deep indigo sky, the last violet light on the horizon, a still lake holding a few scattered lights."
          innerClassName="md:pt-[120px] pb-0 md:pb-0"
        >
          <div className="max-w-[860px] flex flex-col gap-32" data-reveal>
            <h2 className="display text-heading md:text-heading-lg leading-heading-lg tracking-heading-lg text-paper m-0">
              One minute now, or a rotated key and a re-uploaded video later.
            </h2>
            <div className="flex flex-wrap items-center gap-16">
              <DownloadCta tone="onDark" />
              <a
                href={`https://github.com/${REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-ghost text-mist hover:text-paper"
              >
                Read the source
                <ArrowCircle />
              </a>
            </div>
          </div>
        </Band>
      </main>

      <footer data-dark className="band band--night w-full">
        <div className="band-inner mx-auto max-w-[1200px] px-24 md:px-40 pb-64 md:pb-80">
          <hr className="rule-dark mt-64 md:mt-80" />

          <div className="flex items-end justify-between gap-40">
            <p
              className="display display-prose text-heading-sm leading-heading-sm tracking-heading-sm text-paper max-w-[720px] m-0"
              data-reveal
            >
              Vera is a last check, not a promise. Keep the keys off the screen while you
              record — and let it catch the day you forget.
            </p>
            {/* The one pixel mark that gets to be large. Charcoal rather than
                Fog: on Dusk, Fog reads at 8:1 and would shout across the whole
                footer, and this is meant to be the thing you notice second. */}
            <div
              className="text-charcoal shrink-0 hidden md:block"
              data-reveal
              style={delay(1, 200)}
            >
              <PixelMark name="tree" scale={5} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-32 mt-64">
            <div className="flex flex-col gap-12">
              <div className="flex items-center gap-8 text-paper">
                <SunMark size={16} />
                <span className="display text-subheading">Vera</span>
              </div>
              <span className="font-af text-caption leading-caption tracking-caption text-mist">
                Finds the API keys left visible in your screen recordings. Made for macOS.
              </span>
            </div>

            <div className="flex flex-col gap-12">
              <Eyebrow tone="dark">Product</Eyebrow>
              {[
                ["How it works", "#how"],
                ["What it finds", "#finds"],
                ["Questions", "#faq"],
              ].map(([label, href]) => (
                <a key={href} href={href} className="font-af text-caption leading-caption tracking-caption text-mist hover:text-paper no-underline transition-colors">
                  {label}
                </a>
              ))}
            </div>

            <div className="flex flex-col gap-12">
              <Eyebrow tone="dark">More</Eyebrow>
              <a href={DMG_PATH} download className="font-af text-caption leading-caption tracking-caption text-mist hover:text-paper no-underline transition-colors">
                Download
              </a>
              <a
                href={`https://github.com/${REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-af text-caption leading-caption tracking-caption text-mist hover:text-paper no-underline transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>

          <hr className="rule-dark mt-48" />
          <span className="block font-af text-caption leading-caption tracking-caption text-mist pt-24">
            © {new Date().getFullYear()} Vera · Recording scanner for macOS
            {publishedVersion ? ` · v${publishedVersion}` : ""}
          </span>
        </div>
      </footer>
    </div>
  );
}

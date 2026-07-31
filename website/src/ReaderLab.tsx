import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  glyphPixels,
  readBack,
  veraVerdict,
  exactVerdict,
  type Verdict,
} from "./reader";

/* ===========================================================================
   Figure 1 — the reader, made operable
   ---------------------------------------------------------------------------
   The section's claim is that text pulled back out of a video is always a
   little wrong, and that an exact pattern dies on that while Vera does not.
   Stated, it is something you either believe or you do not. Here you can turn
   the frame away from the camera until the reader starts making mistakes, and
   watch both answers change.

   Two things make this worth building rather than animating:

     · Every answer is computed. `reader.ts` is a port of the engine's own
       prefix, length, character-set and randomness gates, and it is pinned
       against the Rust by `scripts/check-reader.mjs`, which runs the real
       engine over every string this element can produce. If the engine's mind
       changes, the check fails.

     · It shows the failure too. Turn far enough and the reader loses whole
       characters, the body falls under its minimum length, and Vera reports
       nothing — which is exactly what the FAQ says a few screens further down.
       A demonstration that could only succeed would be an advertisement.

   Reaching every state without a mouse is the contract, not a courtesy: the two
   sliders alone span the full range of glyph sizes, from 15 pixels down to
   under 2. Dragging tips the frame as well, but only ever lands somewhere the
   sliders can already reach.
   =========================================================================== */

/** The key on the screen. A real shape: `sk-proj-` and a 24-character body. */
const SOURCE = "sk-proj-T3xK9mPqrn7wZ2bVdL4hCj8s";

/** Glyph height in a full-screen recording of a terminal at 1080p. */
const BASELINE_PX = 15;

const MAX_YAW = 70;
const MAX_PITCH = 28;
const MIN_ZOOM = 0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const REASON_TEXT: Record<Exclude<Verdict, { found: true }>["reason"], string> = {
  "nothing legible": "nothing came back at all",
  prefix: "the prefix is past recovering",
  length: "the body lost too many characters",
  charset: "the body stopped looking like a key",
  randomness: "the body stopped looking random",
};

export function ReaderLab() {
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);

  const px = glyphPixels(BASELINE_PX, yaw, pitch, zoom);
  const reading = useMemo(() => readBack(SOURCE, px), [px]);
  const vera = useMemo(() => veraVerdict(reading.text), [reading.text]);
  const exact = useMemo(() => exactVerdict(reading.text), [reading.text]);

  /* --- Dragging ------------------------------------------------------------
     Pointer events rather than mouse + touch: one code path, and setPointer-
     Capture keeps the gesture alive when the cursor leaves the frame, which is
     most of the time given the frame is only 340px wide. */
  const surface = useRef<HTMLDivElement | null>(null);
  const origin = useRef({ x: 0, y: 0, yaw: 0, pitch: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Let the sliders and the reset button work normally.
      if ((e.target as HTMLElement).closest("input, button")) return;
      surface.current?.setPointerCapture(e.pointerId);
      origin.current = { x: e.clientX, y: e.clientY, yaw, pitch };
      setDragging(true);
    },
    [yaw, pitch]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      // 2.2px of travel per degree — slow enough that the interesting middle of
      // the range is not something you shoot straight past.
      setYaw(clamp(origin.current.yaw + dx / 2.2, -MAX_YAW, MAX_YAW));
      setPitch(clamp(origin.current.pitch - dy / 2.8, -MAX_PITCH, MAX_PITCH));
    },
    [dragging]
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    surface.current?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  }, []);

  /* --- Announcing ----------------------------------------------------------
     A live region that fired on every pointer frame would be unusable, so it is
     only written when the verdict itself changes. */
  const [announcement, setAnnouncement] = useState("");
  const lastVerdict = useRef("");
  useEffect(() => {
    const key = vera.found ? `found:${vera.label}` : `no:${vera.reason}`;
    if (key === lastVerdict.current) return;
    lastVerdict.current = key;
    setAnnouncement(
      vera.found
        ? `About ${Math.round(px)} pixels per character. An exact pattern ${
            exact ? "matches" : "finds nothing"
          }. Vera reports ${vera.label}.`
        : `About ${Math.round(px)} pixels per character. Neither an exact pattern nor Vera finds anything — ${
            REASON_TEXT[vera.reason]
          }.`
    );
  }, [vera, exact, px]);

  const blind = reading.text.length === 0;
  const damagedCount = reading.damaged.filter(Boolean).length;

  return (
    <figure className="card-diagram m-0">
      <div className="bg-paper rounded-xl border border-mist p-20 md:p-24">
        <div className="flex flex-col gap-20">
          {/* --- The frame ---------------------------------------------- */}
          <div
            ref={surface}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`reader-scene ${dragging ? "is-dragging" : ""}`}
          >
            <div
              className="reader-frame"
              style={{
                transform: `rotateX(${pitch}deg) rotateY(${yaw}deg) scale(${zoom})`,
              }}
            >
              {/* The glyphs here are the size the model says they are, so what
                  you read off the picture and what the readout claims cannot
                  drift apart. Hidden from assistive technology on purpose: at
                  five pixels it is an illustration, and the authoritative copy
                  of the same string is in the readout below at 15px. */}
              <div className="reader-frame-bar" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="reader-frame-body" aria-hidden="true">
                <span className="reader-prompt">$</span> export OPENAI_API_KEY=
                <wbr />
                {SOURCE}
              </div>
            </div>
            <span className="reader-hint font-af text-caption leading-caption tracking-caption text-ash">
              {dragging ? "" : "Drag to turn the frame"}
            </span>
          </div>

          {/* --- Controls ------------------------------------------------ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-16">
            <label className="flex flex-col gap-8">
              <span className="font-af text-caption leading-caption tracking-caption text-ash flex justify-between">
                <span>Angle to the camera</span>
                <span className="font-mono">{Math.abs(Math.round(yaw))}°</span>
              </span>
              <input
                type="range"
                className="reader-range"
                min={-MAX_YAW}
                max={MAX_YAW}
                step={1}
                value={Math.round(yaw)}
                onChange={(e) => setYaw(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-8">
              <span className="font-af text-caption leading-caption tracking-caption text-ash flex justify-between">
                <span>How small it was on screen</span>
                <span className="font-mono">{Math.round(zoom * 100)}%</span>
              </span>
              <input
                type="range"
                className="reader-range"
                min={MIN_ZOOM * 100}
                max={100}
                step={1}
                value={Math.round(zoom * 100)}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
              />
            </label>
          </div>

          <hr className="rule" />

          {/* --- What came back ------------------------------------------ */}
          <div className="flex flex-col gap-8">
            <span className="font-af text-caption leading-caption tracking-caption font-medium uppercase text-ash flex flex-wrap gap-x-12 justify-between">
              <span>What the reader returns</span>
              <span className="font-mono normal-case tracking-normal">
                ≈{px.toFixed(1)} px per character
              </span>
            </span>
            <p className="font-mono text-body-sm text-charcoal m-0 break-all leading-body">
              {blind ? (
                <span className="text-ash">— nothing legible at this size —</span>
              ) : (
                [...reading.text].map((c, i) => (
                  <span key={i} className={reading.damaged[i] ? "reader-damaged" : undefined}>
                    {c}
                  </span>
                ))
              )}
            </p>
            <span className="font-af text-caption leading-caption tracking-caption text-ash">
              {blind
                ? `All ${SOURCE.length} characters lost.`
                : damagedCount === 0 && reading.dropped === 0
                  ? "Read back exactly."
                  : `${damagedCount} character${damagedCount === 1 ? "" : "s"} misread` +
                    (reading.dropped > 0 ? `, ${reading.dropped} lost entirely` : "") +
                    "."}
            </span>
          </div>

          <hr className="rule" />

          {/* --- The two answers ----------------------------------------- */}
          <div className="flex flex-col gap-16">
            <Answer
              ok={exact}
              title="An exact pattern"
              detail={
                exact
                  ? "Matches — the text came back perfect."
                  : blind
                    ? "Nothing to match against."
                    : "One wrong character is enough. Nothing matches, nothing is reported."
              }
            />
            <Answer
              ok={vera.found}
              title="Vera, split in two"
              detail={
                vera.found
                  ? `${vera.label} — prefix matched loosely, body judged by length, character set and randomness. Confidence ${(vera.confidence * 100).toFixed(0)}%.`
                  : `Not found — ${REASON_TEXT[vera.reason]}. Vera is a last check, not a guarantee.`
              }
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setYaw(0);
              setPitch(0);
              setZoom(1);
            }}
            className="link-ghost self-start font-af text-caption"
          >
            Start over
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>

      <figcaption className="font-af text-caption leading-caption tracking-caption text-ash px-12 pt-12">
        Figure 1 — Turn the frame away from the camera and each glyph gets fewer pixels,
        which is what a small window, a scaled screen share or a talk filmed from the back
        of the room all do. A misread character changes neither the length nor the
        composition of the body. That is why the key is still found — until the reader
        starts losing characters outright, and then it is not.
      </figcaption>
    </figure>
  );
}

/** One verdict line. The mark is never the only thing carrying the answer. */
function Answer({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-12">
      <span className={`mt-4 shrink-0 ${ok ? "text-signal-blue" : "text-ash"}`} aria-hidden="true">
        {ok ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6.4l2.8 2.8L10 3.4" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        )}
      </span>
      <div className="flex flex-col gap-4">
        <span className="font-af text-body-sm font-medium tracking-body-sm text-graphite">
          {title}
          <span className="sr-only">: {ok ? "found" : "not found"}</span>
        </span>
        <span className="font-af text-caption leading-caption tracking-caption text-ash">
          {detail}
        </span>
      </div>
    </div>
  );
}

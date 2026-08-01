import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Check,
  Copy,
  FolderOpen,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  cancelScan,
  formatTimestamp,
  looksLikeVideo,
  onScanProgress,
  scanVideo,
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  VIDEO_EXTENSIONS,
  type Incident,
  type ScanProgress,
  type ScanResult,
} from "../lib/scan";
import {
  CANARY_PATTERN_ID,
  describeDisplay,
  dryRunCanary,
  evaluateRecordingPlan,
  openScreenRecorder,
  recordingEnvironment,
  revealFolder,
  shortenHome,
  type RecordingEnvironment,
  type RecordingPlanReport,
} from "../lib/dryrun";
import { settingsRepo } from "../lib/db";

/* ===========================================================================
   Dry run
   ---------------------------------------------------------------------------
   Who this is for: a founder about to record the launch demo of their own
   product, on the machine they built it on — which is the machine with every key
   they have ever exported still sitting in its shell.

   The gap it fills is two gaps. The small one is that not everybody knows which
   keystroke opens the recorder or what the toolbar that appears means, so those
   are shown rather than described, and the shell commands worth running first
   are here to copy rather than to remember. The larger one is that no amount of
   instructions could tell somebody whether the recording they are about to make
   is one Vera can actually read, because that depends on their display, their
   recorder and their font size.

   So it is not instructions. Vera hands over a key that is shaped exactly like
   a real one and opens nothing, you put it on screen and record ten seconds,
   and the same engine that will judge the real take judges the rehearsal. Either
   it finds the key — in which case your setup demonstrably produces recordings
   this product can read — or it does not, and then the interesting half begins:
   Vera says why, and gives the number that would fix it.

   Two properties this leans on, both of which already hold:
     · Vera never captures the screen. Nothing here changes that. The user
       records; Vera reads a file they hand it, exactly like the Scan screen.
     · The canary and the pixel bands live in `vera-core`, measured and tested.
       They are called across the boundary, never reimplemented here.

   The failure state is the point of the whole screen. A rehearsal that could
   only succeed would be a loading screen with extra steps.
   =========================================================================== */

type Phase = "idle" | "scanning" | "done" | "error";

const CANARY_FALLBACK = "sk-proj-VERAdryrun7Qx4Vb2Zm9Ld3Kt6HsW8";

/** A fact read off this Mac. Unknown facts say so rather than showing a guess. */
const Fact: React.FC<{
  label: string;
  value: string;
  unknown?: string;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
}> = ({ label, value, unknown, action }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
      {label}
    </span>
    {value ? (
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-sans text-[13px] text-text-primary truncate">{value}</span>
        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-1 shrink-0 font-sans text-[12px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            {action.icon}
            {action.label}
          </button>
        )}
      </div>
    ) : (
      <span className="font-sans text-[13px] text-text-faint italic">
        {unknown ?? "Vera could not read this."}
      </span>
    )}
  </div>
);

/**
 * A command you copy and run.
 *
 * The copy button is the whole point: a founder reading this is thirty minutes
 * from a launch and is not going to retype `printf '\033[3J'` correctly.
 */
const CommandLine: React.FC<{ command: string; label?: string }> = ({ command, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-hairline bg-bg-warm px-3 py-2">
      <code className="font-mono text-[12px] text-text-primary flex-1 break-all select-all leading-relaxed">
        {command}
      </code>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* It is selectable; a failed copy does not deserve a dialog. */
          }
        }}
        aria-label={`Copy ${label ?? "command"}`}
        className="shrink-0 flex items-center gap-1.5 font-sans text-[12px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
      >
        {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.5} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

/**
 * The Shift-Command-5 toolbar, drawn.
 *
 * "The fourth icon" is a sentence somebody has to decode while a launch is
 * waiting. This is the same information as a picture, with the two that record
 * video ringed — which is the actual question ("where do I click") answered in
 * the form the question was asked.
 *
 * Drawn rather than screenshotted: a screenshot of macOS would be stale by the
 * next release, would not follow the app's own palette, and would be the one
 * asset in the product that came from somewhere else.
 */
const CaptureToolbar: React.FC = () => {
  const stills = [
    // Whole screen, one window, a dragged region — the three that take a photo.
    <>
      <rect x="5" y="6" width="14" height="11" rx="1.5" />
      <path d="M5 14.5h14" />
    </>,
    <>
      <rect x="4" y="5" width="12" height="9" rx="1.5" />
      <rect x="8" y="9" width="12" height="9" rx="1.5" />
    </>,
    <>
      <path d="M4 8V5h3M20 8V5h-3M4 15v3h3M20 15v3h-3" />
    </>,
  ];
  return (
    <div className="flex justify-center py-1">
      <div className="inline-flex items-center gap-1 rounded-xl bg-text-primary/90 px-2.5 py-2 shadow-sm">
        {stills.map((d, i) => (
          <svg key={i} width="26" height="24" viewBox="0 0 24 24" fill="none"
               stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" strokeLinecap="round"
               strokeLinejoin="round" aria-hidden="true">
            {d}
          </svg>
        ))}
        <span className="w-px h-4 bg-white/20 mx-1" aria-hidden="true" />
        {/* The two that record video. */}
        {[false, true].map((cropped, i) => (
          <span key={i} className="relative inline-flex">
            <span className="absolute -inset-0.5 rounded-lg border border-emerald-400" aria-hidden="true" />
            <svg width="26" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff"
                 strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {cropped ? (
                <>
                  <path d="M4 8V5h3M20 8V5h-3M4 15v3h3M20 15v3h-3" />
                  <circle cx="12" cy="11.5" r="2.6" fill="#ffffff" stroke="none" />
                </>
              ) : (
                <>
                  <rect x="4" y="6" width="16" height="11" rx="1.5" />
                  <circle cx="12" cy="11.5" r="2.6" fill="#ffffff" stroke="none" />
                </>
              )}
            </svg>
          </span>
        ))}
        <span className="w-px h-4 bg-white/20 mx-1" aria-hidden="true" />
        <span className="font-sans text-[11px] text-white/50 px-1">Options</span>
        <span className="font-sans text-[11px] text-white bg-white/15 rounded-md px-2 py-1">
          Record
        </span>
      </div>
    </div>
  );
};

export const DryRun: React.FC = () => {
  const [env, setEnv] = useState<RecordingEnvironment | null>(null);
  const [canary, setCanary] = useState(CANARY_FALLBACK);
  const [copied, setCopied] = useState(false);
  const [recorderOpened, setRecorderOpened] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  // The calculator, shown when the rehearsal failed. Seeded from the display so
  // two of its three inputs are already right.
  const [fontPoints, setFontPoints] = useState(13);
  const [plan, setPlan] = useState<RecordingPlanReport | null>(null);

  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  useEffect(() => {
    recordingEnvironment().then(setEnv).catch(() => setEnv(null));
    dryRunCanary().then(setCanary).catch(() => setCanary(CANARY_FALLBACK));
  }, []);

  const runScan = useCallback(async (path: string) => {
    setPhase("scanning");
    setProgress(null);
    setResult(null);
    setError("");
    try {
      // The same sampling rate the real scan uses, so the rehearsal is not an
      // easier test than the thing it is rehearsing for.
      const scanFps = await settingsRepo.getScanFps().catch(() => 1);
      setResult(await scanVideo(path, scanFps));
      setPhase("done");
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onScanProgress(setProgress)
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") setDragging(true);
        else if (event.payload.type === "leave") setDragging(false);
        else if (event.payload.type === "drop") {
          setDragging(false);
          if (phaseRef.current === "scanning") return;
          const dropped = event.payload.paths.find(looksLikeVideo);
          if (dropped) runScan(dropped);
        }
      })
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => unlisten?.();
  }, [runScan]);

  // When the rehearsal fails, work out what size would have worked. The maths
  // is in Rust; this only supplies the three numbers.
  useEffect(() => {
    if (phase !== "done" || !result) return;
    const foundCanary = result.incidents.some((i) => i.pattern_id === CANARY_PATTERN_ID);
    if (foundCanary) {
      setPlan(null);
      return;
    }
    const height = env?.display_height || 0;
    evaluateRecordingPlan(fontPoints, env?.display_scale || 1, height, height)
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [phase, result, fontPoints, env]);

  const copyCanary = async () => {
    try {
      await navigator.clipboard.writeText(canary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* The key is on screen and selectable; a failed copy is not worth a dialog. */
    }
  };

  const chooseFile = async () => {
    try {
      const picked = await openFileDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Screen recording", extensions: VIDEO_EXTENSIONS }],
      });
      if (typeof picked === "string") runScan(picked);
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setProgress(null);
    setError("");
    setPlan(null);
  };

  const foundCanary =
    result?.incidents.some((i) => i.pattern_id === CANARY_PATTERN_ID) ?? false;
  // Anything that is not the canary was genuinely on this person's screen.
  const bystanders: Incident[] =
    result?.incidents.filter((i) => i.pattern_id !== CANARY_PATTERN_ID) ?? [];

  // The calculator's own verdict on the size, which is a different question
  // from whether the rehearsal passed.
  const sizeIsFine = plan?.verdict.legibility === "comfortable";

  const pct =
    progress && progress.frames_total > 0
      ? Math.min(100, Math.round((progress.frames_done / progress.frames_total) * 100))
      : 0;

  return (
    <div className="w-full max-w-[860px] flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-serif text-[32px] text-text-primary leading-tight">Dry run</h1>
        <p className="font-sans text-[14px] text-text-muted">
          Everything between deciding to record your launch demo and having a file you
          can publish. Clear the screen, take the recording, check it — with the
          commands to copy, on the machine you are actually going to record.
        </p>
      </header>

      {/* --- What Vera read off this Mac ---------------------------------- */}
      {phase === "idle" && (
        <div className="card-style p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[14px] font-medium text-text-primary">
              Recording on this Mac
            </span>
            <span className="font-sans text-[12px] text-text-muted">
              Read off your machine just now. Vera did not look at your screen — only at
              your settings, the same ones you could open yourself.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <Fact
              label="Recordings are saved to"
              value={env?.save_location_known ? shortenHome(env.save_location) : ""}
              unknown="Vera could not read this setting."
              action={
                env?.save_location_known
                  ? {
                      label: "Show me",
                      icon: <FolderOpen size={13} strokeWidth={1.5} />,
                      onClick: () => revealFolder(env.save_location).catch(() => {}),
                    }
                  : undefined
              }
            />
            <Fact
              label="Your display"
              value={env ? describeDisplay(env) : ""}
              unknown="Vera could not read your display size."
            />
          </div>

          {env && env.recorders.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                What you can record with
              </span>
              <div className="flex flex-col gap-2">
                {env.recorders
                  .filter((r) => r.installed)
                  .map((r) => (
                    <div key={r.name} className="flex gap-3">
                      <span className="font-sans text-[13px] font-medium text-text-primary shrink-0 w-[132px]">
                        {r.name}
                      </span>
                      <span className="font-sans text-[12px] text-text-muted leading-relaxed">
                        {r.note}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- 1. Prepare ---------------------------------------------------- */}
      {phase === "idle" && env && env.prep.length > 0 && (
        <div className="card-style p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="font-serif text-[20px] text-text-primary">
              1 · Clear the stage
            </span>
            <p className="font-sans text-[13px] text-text-muted leading-relaxed">
              You are about to record the machine you built the product on — which is the
              machine with every key you have ever exported still sitting in its shell. Run
              these in the terminal you are going to record. Each one takes a second.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {env.prep.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <span className="shrink-0 w-6 h-6 rounded-full border border-border-hairline flex items-center justify-center font-sans text-[11px] font-semibold text-text-muted">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-2 min-w-0 flex-1 pt-0.5">
                  <span className="font-sans text-[14px] font-medium text-text-primary">
                    {step.title}
                  </span>
                  <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                    {step.why}
                  </p>
                  {step.command && <CommandLine command={step.command} label={step.title} />}
                  {step.click && (
                    <span className="font-sans text-[12px] text-text-primary">
                      {step.click}
                    </span>
                  )}
                  {step.undo && (
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-[11px] text-text-faint shrink-0">
                        Afterwards
                      </span>
                      <code className="font-mono text-[11px] text-text-faint break-all select-all">
                        {step.undo}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- 2. Record ----------------------------------------------------- */}
      {phase === "idle" && (
        <div className="card-style p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="font-serif text-[20px] text-text-primary">2 · Record it</span>
            <p className="font-sans text-[13px] text-text-muted leading-relaxed">
              Two ways. Both produce the same file.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                Press Shift-Command-5
              </span>
              <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                A small toolbar appears at the bottom of the screen. The two right-hand
                icons are the video ones — the fourth records the whole screen, the fifth
                lets you drag a box. Pick one, press Record, and stop it from the
                {"\u00A0"}■{"\u00A0"}in the menu bar.
              </p>
              <CaptureToolbar />
              <button
                onClick={() => {
                  openScreenRecorder().catch(() => {});
                  setRecorderOpened(true);
                }}
                className="self-start flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-hairline font-sans text-[13px] text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
              >
                <Video size={14} strokeWidth={1.5} />
                {recorderOpened ? "Open it again" : "Open it for me"}
              </button>
            </div>

            <hr className="border-t border-border-hairline" />

            <div className="flex flex-col gap-2.5">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                Or from the terminal
              </span>
              <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                Starts immediately and stops on Control-C. The first time, macOS asks your
                terminal for Screen Recording permission — which is why this is the second
                option and not the first.
              </p>
              <CommandLine command={env?.record_command ?? "screencapture -v ~/Desktop/launch-demo.mov"} label="record command" />
            </div>
          </div>

          {env?.save_location_known && (
            <div className="flex items-center gap-2 pt-1">
              <span className="font-sans text-[12px] text-text-muted">
                Either way it lands in {shortenHome(env.save_location)}.
              </span>
              <button
                onClick={() => revealFolder(env.save_location).catch(() => {})}
                className="flex items-center gap-1 font-sans text-[12px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <FolderOpen size={13} strokeWidth={1.5} />
                Show me
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- 3. Check it --------------------------------------------------- */}
      {phase === "idle" && (
        <div className="card-style p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="font-serif text-[20px] text-text-primary">3 · Check it</span>
            <p className="font-sans text-[13px] text-text-muted leading-relaxed">
              Drop the recording in and Vera reads it. That works for the real take — and
              for a ten-second rehearsal, which is the part worth doing first.
            </p>
          </div>

          <button
            onClick={chooseFile}
            className={`rounded-xl border border-dashed border-border-hairline py-10 px-6 flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer hover:bg-active-hover/40 ${
              dragging ? "border-text-muted bg-active-hover/60" : ""
            }`}
          >
            <Clapperboard size={26} strokeWidth={1.25} className="text-text-muted" />
            <span className="font-sans text-[13px] text-text-primary">
              {dragging ? "Drop it here" : "Drop your recording here, or click to choose it"}
            </span>
            <span className="font-sans text-[12px] text-text-faint">
              {VIDEO_EXTENSIONS.join(" · ")} · nothing is uploaded
            </span>
          </button>

          <div className="rounded-xl border border-border-hairline bg-bg-warm p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                Do the rehearsal first — it takes ten seconds
              </span>
              <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                Put this key on screen, record ten seconds, drop that in. It is shaped
                exactly like a real OpenAI project key and opens nothing — Vera generated
                it, nobody issued it. If Vera finds it, your recorder and your font size
                demonstrably produce something it can read. If it does not, you have found
                that out on a rehearsal instead of on the launch video.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <code className="font-mono text-[13px] text-text-primary flex-1 break-all select-all">
                {canary}
              </code>
              <button
                onClick={copyCanary}
                className="shrink-0 flex items-center gap-1.5 font-sans text-[12px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                {copied ? <Check size={14} strokeWidth={1.8} /> : <Copy size={14} strokeWidth={1.5} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Reading it ---------------------------------------------------- */}
      {phase === "scanning" && (
        <div className="card-style p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Loader2 size={18} strokeWidth={1.5} className="text-text-muted animate-spin" />
            <div className="flex flex-col">
              <span className="font-sans text-[14px] font-medium text-text-primary">
                Reading your dry run
              </span>
              <span className="font-sans text-[12px] text-text-muted">
                {progress
                  ? `Frame ${progress.frames_done} of ${progress.frames_total}`
                  : "Opening the file…"}
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-active-hover overflow-hidden">
            <div
              className="h-full bg-text-primary/70 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            onClick={() => cancelScan().catch(() => {})}
            className="self-start flex items-center gap-1.5 font-sans text-[13px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={14} strokeWidth={1.5} />
            Stop
          </button>
        </div>
      )}

      {/* --- The verdict --------------------------------------------------- */}
      {phase === "done" && result && (
        <div className="flex flex-col gap-4">
          <div className="card-style p-8 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              {foundCanary ? (
                <ShieldCheck size={26} strokeWidth={1.4} className="text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert size={26} strokeWidth={1.4} className="text-amber-600 shrink-0" />
              )}
              <div className="flex flex-col gap-1.5">
                <span className="font-serif text-[24px] text-text-primary leading-tight">
                  {foundCanary
                    ? "Your setup produces recordings Vera can read."
                    : "Vera could not find the key that was on your screen."}
                </span>
                <p className="font-sans text-[13px] text-text-muted leading-relaxed max-w-[560px]">
                  {foundCanary
                    ? "It found the key you planted, in your recorder, at your font size, on this Mac. A scan of the real take will mean something."
                    : "Which means a scan of the real take would not mean much either — it would come back clean whether or not anything was there. Below is what to change."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-2 pt-1 border-t border-border-hairline">
              <div className="flex flex-col gap-0.5 pt-4">
                <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                  Frames read
                </span>
                <span className="font-sans text-[13px] text-text-primary">
                  {result.frames_ocred} of {result.frames_scanned}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 pt-4">
                <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                  Length
                </span>
                <span className="font-sans text-[13px] text-text-primary">
                  {formatTimestamp(result.duration_ms)}
                </span>
              </div>
            </div>

            <button
              onClick={reset}
              className="self-start px-3 py-1.5 rounded-lg border border-border-hairline font-sans text-[13px] text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
            >
              Run it again
            </button>
          </div>

          {/* The part that only exists because the rehearsal failed. */}
          {!foundCanary && plan && (
            <div className="card-style p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[14px] font-medium text-text-primary">
                  {sizeIsFine ? "Your text size is not the problem" : "What size would have worked"}
                </span>
                {/* When the maths says the size is fine, saying "text this size
                    reads back cleanly" directly under "could not find the key"
                    is a contradiction. The useful answer is then to rule the
                    size out and point at what is left. */}
                <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                  {sizeIsFine
                    ? "At this size a reader has no trouble, so something else went wrong. The usual causes, in order: the key was not on screen for the whole ten seconds, you recorded a different window than the one it was in, or the recording was exported smaller than it was captured."
                    : plan.verdict.summary}
                </p>
              </div>

              <div className="flex items-end gap-4 flex-wrap">
                <label className="flex flex-col gap-1.5">
                  <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                    Your font size
                  </span>
                  <input
                    type="number"
                    min={6}
                    max={72}
                    value={fontPoints}
                    onChange={(e) => setFontPoints(Number(e.target.value) || 0)}
                    className="w-[92px] px-3 py-1.5 rounded-lg border border-border-hairline bg-card-surface font-sans text-[13px] text-text-primary"
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                    Ends up as
                  </span>
                  <span className="font-sans text-[13px] text-text-primary py-1.5">
                    {plan.verdict.glyph_px.toFixed(1)} px per character
                  </span>
                </div>
              </div>

              <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                {sizeIsFine
                  ? "If you did export it smaller than you recorded it, that is the first thing to undo."
                  : plan.verdict.export_is_the_problem
                    ? "Your text is large enough on screen — it is the export that shrinks it below what any reader recovers. Publish at the size you recorded."
                    : plan.smallest_safe_export_height
                      ? `At this font size, keep the published height at or above ${plan.smallest_safe_export_height}px.`
                      : "No export size fixes this. Raise the font size in the window you are recording, and run the dry run again."}
              </p>
            </div>
          )}

          {/* Anything that was not the canary was really on their screen. */}
          {bystanders.length > 0 && (
            <div className="card-style p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[14px] font-medium text-text-primary">
                  {bystanders.length === 1
                    ? "One other thing was on your screen"
                    : `${bystanders.length} other things were on your screen`}
                </span>
                <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                  These are not the key Vera gave you. They were already there, in ten
                  seconds of rehearsal — which is what the real take would have caught.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {bystanders.map((i) => {
                  const style = SEVERITY_STYLE[i.severity];
                  return (
                    <div
                      key={`${i.pattern_id}-${i.first_seen_ms}`}
                      className="flex items-center gap-3 rounded-xl border border-border-hairline px-4 py-3"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                      <span className="font-sans text-[13px] font-medium text-text-primary">
                        {i.label}
                      </span>
                      <span
                        className={`font-sans text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border ${style.chip}`}
                      >
                        {SEVERITY_LABEL[i.severity]}
                      </span>
                      <span className="font-mono text-[12px] text-text-muted truncate flex-1">
                        {i.preview}
                      </span>
                      <span className="font-serif text-[15px] text-text-primary shrink-0">
                        {formatTimestamp(i.first_seen_ms)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className="card-style p-8 flex flex-col gap-4">
          <span className="font-serif text-[20px] text-text-primary">
            That file could not be read.
          </span>
          <p className="font-sans text-[13px] text-text-muted">{error}</p>
          <button
            onClick={reset}
            className="self-start px-3 py-1.5 rounded-lg border border-border-hairline font-sans text-[13px] text-text-primary hover:bg-active-hover transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
};

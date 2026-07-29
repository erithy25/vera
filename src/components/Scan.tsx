import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  UploadCloud,
  ShieldCheck,
  ShieldAlert,
  X,
  Clock,
  Eye,
  ChevronDown,
  Loader2,
  FileVideo,
} from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  scanVideo,
  cancelScan,
  onScanProgress,
  framePreview,
  formatTimestamp,
  formatVisibleFor,
  actionableCount,
  worstSeverity,
  looksLikeVideo,
  VIDEO_EXTENSIONS,
  SEVERITY_ADVICE,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SEVERITY_STYLE,
  type Incident,
  type ScanProgress,
  type ScanResult,
} from "../lib/scan";
import { settingsRepo } from "../lib/db";

type Phase = "idle" | "scanning" | "done" | "error";

/** One finding, expandable to a still from the moment it was on screen. */
const IncidentRow: React.FC<{ incident: Incident; videoPath: string; fps: number }> = ({
  incident,
  videoPath,
  fps,
}) => {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const style = SEVERITY_STYLE[incident.severity];

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || preview || loading) return;
    setLoading(true);
    setPreviewError(null);
    try {
      setPreview(await framePreview(videoPath, incident.first_frame_index, fps));
    } catch (err) {
      setPreviewError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-style overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-active-hover/40 transition-colors cursor-pointer"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />

        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-sans text-[14px] font-medium text-text-primary">
              {incident.label}
            </span>
            <span
              className={`font-sans text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border ${style.chip}`}
            >
              {SEVERITY_LABEL[incident.severity]}
            </span>
          </div>
          <span className="font-mono text-[12px] text-text-muted truncate">
            {incident.preview}
          </span>
        </div>

        <div className="flex items-center gap-5 shrink-0">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-serif text-[18px] text-text-primary leading-none">
              {formatTimestamp(incident.first_seen_ms)}
            </span>
            <span className="font-sans text-[11px] text-text-faint">
              {formatVisibleFor(incident)}
            </span>
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className={`text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border-hairline px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Detail label="Provider" value={incident.provider} />
            <Detail
              label="On screen"
              value={`${formatTimestamp(incident.first_seen_ms)} – ${formatTimestamp(incident.last_seen_ms)}`}
            />
            <Detail label="Frames" value={String(incident.frame_count)} />
            <Detail label="Confidence" value={`${Math.round(incident.confidence * 100)}%`} />
          </div>

          <p className="font-sans text-[13px] text-text-muted leading-relaxed">
            {SEVERITY_ADVICE[incident.severity]}
          </p>

          <div className="rounded-xl border border-border-hairline overflow-hidden bg-bg-warm">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
                <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
                <span className="font-sans text-[13px]">Pulling that frame…</span>
              </div>
            )}
            {previewError && (
              <p className="font-sans text-[12px] text-text-muted px-4 py-6">
                Could not extract this frame: {previewError}
              </p>
            )}
            {preview && (
              <img
                src={preview}
                alt={`Frame at ${formatTimestamp(incident.first_seen_ms)}`}
                className="w-full block"
              />
            )}
          </div>
          <p className="font-sans text-[11px] text-text-faint">
            This still is rendered from your file on demand and is never written to disk.
          </p>
        </div>
      )}
    </div>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
      {label}
    </span>
    <span className="font-sans text-[13px] text-text-primary">{value}</span>
  </div>
);

export const Scan: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [videoPath, setVideoPath] = useState<string>("");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string>("");
  const [fps, setFps] = useState<number>(1);

  // `phase` inside the drag-drop listener would be captured on first render.
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  useEffect(() => {
    settingsRepo.getScanFps().then(setFps).catch(() => setFps(1));
  }, []);

  const startScan = useCallback(
    async (path: string) => {
      setVideoPath(path);
      setPhase("scanning");
      setProgress(null);
      setResult(null);
      setError("");
      try {
        const scanFps = await settingsRepo.getScanFps().catch(() => 1);
        setFps(scanFps);
        const res = await scanVideo(path, scanFps);
        setResult(res);
        setPhase("done");
        window.dispatchEvent(new CustomEvent("vera-scan-complete", { detail: res }));
      } catch (err) {
        setError(String(err));
        setPhase("error");
      }
    },
    []
  );

  // Live progress from the Rust side.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onScanProgress(setProgress)
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => console.error("Could not subscribe to scan progress:", err));
    return () => unlisten?.();
  }, []);

  // Dropping a file onto the window.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragging(true);
        } else if (event.payload.type === "leave") {
          setDragging(false);
        } else if (event.payload.type === "drop") {
          setDragging(false);
          if (phaseRef.current === "scanning") return;
          const dropped = event.payload.paths.find(looksLikeVideo);
          if (dropped) {
            startScan(dropped);
          } else if (event.payload.paths.length > 0) {
            setError(
              `Vera reads ${VIDEO_EXTENSIONS.join(", ")} recordings. That file is something else.`
            );
            setPhase("error");
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => console.error("Could not subscribe to file drops:", err));
    return () => unlisten?.();
  }, [startScan]);

  const chooseFile = async () => {
    try {
      const picked = await openFileDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Screen recording", extensions: VIDEO_EXTENSIONS }],
      });
      if (typeof picked === "string") startScan(picked);
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
    setVideoPath("");
  };

  const pct =
    progress && progress.frames_total > 0
      ? Math.min(100, Math.round((progress.frames_done / progress.frames_total) * 100))
      : 0;

  return (
    <div className="w-full max-w-[860px] flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-serif text-[32px] text-text-primary leading-tight">
          Scan a recording
        </h1>
        <p className="font-sans text-[14px] text-text-muted">
          Drop in a screen recording. Vera reads every frame on this Mac and tells you
          which API keys, tokens and credentials are visible — before you publish it.
        </p>
      </header>

      {phase === "idle" && (
        <button
          onClick={chooseFile}
          className={`card-style flex flex-col items-center justify-center gap-4 py-20 px-8 border-dashed transition-all duration-200 cursor-pointer ${
            dragging ? "border-text-muted bg-active-hover/60 scale-[1.005]" : ""
          }`}
        >
          <UploadCloud size={34} strokeWidth={1.25} className="text-text-muted" />
          <div className="flex flex-col items-center gap-1">
            <span className="font-serif text-[20px] text-text-primary">
              {dragging ? "Drop it here" : "Drop a recording here"}
            </span>
            <span className="font-sans text-[13px] text-text-muted">
              or click to choose a file · {VIDEO_EXTENSIONS.join(" · ")}
            </span>
          </div>
          <span className="font-sans text-[12px] text-text-faint max-w-[420px] text-center leading-relaxed">
            Nothing is uploaded and nothing is stored. The file never leaves this Mac,
            and Vera keeps no copy of it, of its frames, or of what it found.
          </span>
        </button>
      )}

      {phase === "scanning" && (
        <div className="card-style p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Loader2 size={18} strokeWidth={1.5} className="text-text-muted animate-spin" />
            <div className="flex flex-col">
              <span className="font-sans text-[14px] font-medium text-text-primary">
                Reading {videoPath.split("/").pop()}
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
              className="h-full bg-text-primary rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="font-sans text-[13px] text-text-muted">
              {progress && progress.incidents_so_far > 0
                ? `${progress.incidents_so_far} finding${progress.incidents_so_far === 1 ? "" : "s"} so far`
                : "Nothing found yet"}
            </span>
            <button
              onClick={() => cancelScan()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-hairline text-text-muted hover:bg-active-hover hover:text-text-primary transition-all active:scale-95 cursor-pointer"
            >
              <X size={13} strokeWidth={1.5} />
              <span className="font-sans text-[12px] font-medium">Stop</span>
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="card-style p-8 flex flex-col items-start gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert size={20} strokeWidth={1.5} className="text-amber-600" />
            <span className="font-serif text-[20px] text-text-primary">
              That did not work
            </span>
          </div>
          <p className="font-sans text-[13px] text-text-muted leading-relaxed">{error}</p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-text-primary text-bg-warm font-sans text-[13px] font-medium hover:opacity-90 transition-opacity active:scale-95 cursor-pointer"
          >
            Try another file
          </button>
        </div>
      )}

      {phase === "done" && result && <Verdict result={result} videoPath={videoPath} fps={fps} onReset={reset} />}
    </div>
  );
};

const Verdict: React.FC<{
  result: ScanResult;
  videoPath: string;
  fps: number;
  onReset: () => void;
}> = ({ result, videoPath, fps, onReset }) => {
  const actionable = actionableCount(result.incidents);
  const worst = worstSeverity(result.incidents);
  const clean = actionable === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="card-style p-8 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            {clean ? (
              <ShieldCheck size={26} strokeWidth={1.25} className="text-emerald-600 mt-0.5" />
            ) : (
              <ShieldAlert
                size={26}
                strokeWidth={1.25}
                className={worst ? SEVERITY_STYLE[worst].text : "text-red-700"}
              />
            )}
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-[26px] text-text-primary leading-tight">
                {clean
                  ? "Nothing to fix"
                  : `${actionable} thing${actionable === 1 ? "" : "s"} to fix before you publish`}
              </h2>
              <p className="font-sans text-[13px] text-text-muted">
                {clean
                  ? result.incidents.length > 0
                    ? "No credentials that need action. One publishable value was seen and is listed below."
                    : "Vera read this recording and found no visible credentials."
                  : "Each one is listed with the moment it appears, worst first."}
              </p>
            </div>
          </div>

          <button
            onClick={onReset}
            className="shrink-0 px-4 py-2 rounded-xl border border-border-hairline font-sans text-[13px] font-medium text-text-muted hover:bg-active-hover hover:text-text-primary transition-all active:scale-95 cursor-pointer"
          >
            Scan another
          </button>
        </div>

        {result.cancelled && (
          <p className="font-sans text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            You stopped this scan early, so the rest of the recording was never read.
            These results cover only the part that was.
          </p>
        )}

        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-1 border-t border-border-hairline">
          <Stat icon={<FileVideo size={13} strokeWidth={1.5} />} label="File" value={result.file_name} />
          <Stat
            icon={<Clock size={13} strokeWidth={1.5} />}
            label="Length"
            value={formatTimestamp(result.duration_ms)}
          />
          <Stat
            icon={<Eye size={13} strokeWidth={1.5} />}
            label="Frames read"
            value={`${result.frames_ocred} of ${result.frames_scanned}`}
          />
        </div>
        <p className="font-sans text-[11px] text-text-faint -mt-2">
          Frames that were pixel-identical to the one before them are not read twice;
          their text carries over, so a secret still gets the full time range it was
          on screen.
        </p>
      </div>

      {result.incidents.length > 0 && (
        <div className="flex flex-col gap-3">
          {SEVERITY_ORDER.filter((s) => result.incidents.some((i) => i.severity === s)).map(
            (severity) => (
              <React.Fragment key={severity}>
                <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase px-1 pt-2">
                  {SEVERITY_LABEL[severity]}
                </span>
                {result.incidents
                  .filter((i) => i.severity === severity)
                  .map((incident, idx) => (
                    <IncidentRow
                      key={`${incident.pattern_id}-${incident.first_seen_ms}-${idx}`}
                      incident={incident}
                      videoPath={videoPath}
                      fps={fps}
                    />
                  ))}
              </React.Fragment>
            )
          )}
        </div>
      )}

      {clean && result.incidents.length === 0 && (
        <p className="font-sans text-[12px] text-text-faint px-1 leading-relaxed">
          A clean result is not a guarantee. Vera looks for the credential formats it
          knows — {result.engine_version && `engine ${result.engine_version}`} — and
          samples the recording rather than decoding every single frame. It will not
          catch a password typed into a form, or a key that appears for a fraction of
          a second between two samples.
        </p>
      )}
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex flex-col gap-1 pt-3">
    <span className="flex items-center gap-1.5 font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
      {icon}
      {label}
    </span>
    <span className="font-sans text-[13px] text-text-primary truncate max-w-[280px]">
      {value}
    </span>
  </div>
);

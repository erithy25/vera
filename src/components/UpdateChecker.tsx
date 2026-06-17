import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type State = "available" | "downloading" | "error";

// Checks the configured update endpoint on launch. If a newer version is
// available it shows a small, dismissible banner; the user chooses when to
// install. Download + install + relaunch are handled by the Tauri updater.
// If the updater isn't configured (or is offline), this silently does nothing.
export function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [state, setState] = useState<State>("available");
  const [dismissed, setDismissed] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await check();
        if (!cancelled && found) {
          setUpdate(found);
          setState("available");
        }
      } catch (err) {
        // No updater config yet, offline, or nothing newer — ignore quietly.
        console.log("[Vera] Update check skipped:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async () => {
    if (!update) return;
    setState("downloading");
    setError("");
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setPercent(Math.min(100, Math.round((downloaded / total) * 100)));
        }
      });
      await relaunch();
    } catch (err: any) {
      setError(typeof err === "string" ? err : err?.message || String(err));
      setState("error");
    }
  };

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[80] w-[320px] card-style p-4 flex flex-col gap-3 shadow-lg animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-[15px] text-text-primary">Update available</span>
          <span className="font-sans text-[12px] text-text-faint">
            Vera {update.version} is ready to install.
          </span>
        </div>
        {state !== "downloading" && (
          <button
            onClick={() => setDismissed(true)}
            className="text-text-faint hover:text-text-primary text-[13px] px-1 cursor-pointer"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>

      {state === "downloading" ? (
        <div className="flex flex-col gap-1.5">
          <div className="w-full h-1.5 bg-active-hover rounded-full overflow-hidden border border-border-hairline">
            <div
              className="h-full bg-text-primary transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="font-sans text-[11px] text-text-faint">
            Downloading… {percent}% — Vera will restart automatically.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={install}
            className="px-3 py-1.5 rounded-xl bg-text-primary text-card-surface font-sans text-[12px] font-medium hover:bg-text-muted transition-colors cursor-pointer"
          >
            Update now
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1.5 rounded-xl border border-border-hairline text-text-muted font-sans text-[12px] font-medium hover:bg-active-hover hover:text-text-primary transition-colors cursor-pointer"
          >
            Later
          </button>
        </div>
      )}

      {state === "error" && (
        <span className="font-sans text-[11px] text-red-600 leading-snug">
          Update failed: {error}
        </span>
      )}
    </div>
  );
}

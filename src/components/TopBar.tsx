import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2 } from "lucide-react";
import { blocksRepo, entriesRepo, settingsRepo } from "../lib/db";
import { dayStartOf, nextDayStart, formatDuration } from "../lib/format";
import { entryDateOf } from "../lib/narrative-core";
// (status queries are aggregates — O(1) regardless of the day's size)

// Today's daily-close state, shown next to the capture badge: how many blocks
// still need review, or — once closed — the confirmed total. Clicking it opens
// the daily-close flow (via App → DayView).
interface CloseStatus {
  openCount: number;
  confirmedMinutes: number; // from confirmed/exported time entries
}

export const TopBar: React.FC = () => {
  const [isPaused, setIsPaused] = useState<boolean>(true); // Defaults to secure true (paused) on launch
  const [closeStatus, setCloseStatus] = useState<CloseStatus | null>(null);

  useEffect(() => {
    async function loadPauseState() {
      try {
        const paused = await settingsRepo.getCapturePaused();
        setIsPaused(paused);
        // Sync with Rust explicitly on startup
        await invoke("set_capture_paused", { paused });
      } catch (err) {
        console.error("Failed to load pause state from settings database:", err);
      }
    }
    loadPauseState();

    // Mirror tray-driven pause/resume into this badge
    const onPauseUpdated = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") setIsPaused(detail);
    };
    window.addEventListener("capture-paused-updated", onPauseUpdated);
    return () => window.removeEventListener("capture-paused-updated", onPauseUpdated);
  }, []);

  useEffect(() => {
    const loadCloseStatus = async () => {
      try {
        const todayStart = dayStartOf(Date.now());
        const [openCount, confirmedMinutes] = await Promise.all([
          blocksRepo.countOpenForDay(todayStart, nextDayStart(todayStart)),
          entriesRepo.confirmedMinutesForDate(entryDateOf(todayStart)),
        ]);
        setCloseStatus({ openCount, confirmedMinutes });
      } catch (err) {
        console.error("Failed to load daily-close status:", err);
      }
    };
    loadCloseStatus();
    // The block engine and the daily close announce every change they make.
    window.addEventListener("blocks-updated", loadCloseStatus);
    window.addEventListener("entries-updated", loadCloseStatus);
    return () => {
      window.removeEventListener("blocks-updated", loadCloseStatus);
      window.removeEventListener("entries-updated", loadCloseStatus);
    };
  }, []);

  const togglePause = async () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    try {
      await settingsRepo.setCapturePaused(nextState);
      await invoke("set_capture_paused", { paused: nextState });
      window.dispatchEvent(new CustomEvent("capture-paused-updated", { detail: nextState }));
    } catch (err) {
      console.error("Failed to persist pause state:", err);
    }
  };

  const dayClosed =
    closeStatus !== null && closeStatus.confirmedMinutes > 0 && closeStatus.openCount === 0;

  return (
    <div className="flex justify-end items-center gap-2 py-6 px-10 w-full">
      {closeStatus !== null && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("vera-open-daily-close"))}
          title={
            dayClosed
              ? "Today is closed — reopen the daily close"
              : "Review today's blocks and close the day"
          }
          className={`flex items-center gap-2 px-3 py-1.5 bg-card-surface border rounded-full soft-shadow select-none transition-all duration-200 active:scale-95 cursor-pointer ${
            dayClosed
              ? "border-emerald-500/25 text-emerald-600 hover:bg-emerald-500/5"
              : "border-border-hairline text-text-muted hover:bg-active-hover hover:text-text-primary"
          }`}
        >
          <CheckCircle2 size={13} strokeWidth={1.75} />
          <span className="text-[12px] font-sans font-medium tracking-wider uppercase">
            {dayClosed
              ? `Day closed · ${formatDuration(closeStatus.confirmedMinutes * 60000)}`
              : closeStatus.openCount > 0
                ? `Close the day · ${closeStatus.openCount} open`
                : "Close the day"}
          </span>
        </button>
      )}
      <button
        onClick={togglePause}
        title={isPaused ? "Resume capture" : "Pause capture"}
        className={`flex items-center gap-2 px-3 py-1.5 bg-card-surface border rounded-full soft-shadow select-none transition-all duration-200 active:scale-95 cursor-pointer ${
          isPaused
            ? "border-amber-500/30 hover:bg-amber-500/5 text-amber-600"
            : "border-border-hairline hover:bg-active-hover text-text-muted hover:text-text-primary"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            isPaused ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
          }`}
        />
        <span className="text-[12px] font-sans font-medium tracking-wider uppercase">
          {isPaused ? "Paused" : "Capturing"}
        </span>
      </button>
    </div>
  );
};

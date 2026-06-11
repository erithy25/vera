import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { settingsRepo } from "../lib/db";

export const TopBar: React.FC = () => {
  const [isPaused, setIsPaused] = useState<boolean>(true); // Defaults to secure true (paused) on launch

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

  return (
    <div className="flex justify-end items-center py-6 px-10 w-full">
      <button
        onClick={togglePause}
        title={isPaused ? "Resume screen capture" : "Pause screen capture"}
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
          {isPaused ? "Paused" : "Local"}
        </span>
      </button>
    </div>
  );
};

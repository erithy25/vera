import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { settingsRepo } from "../lib/db";
import { ollamaClient } from "../lib/ollama";

export const TopBar: React.FC = () => {
  const [isPaused, setIsPaused] = useState<boolean>(true); // Defaults to secure true (paused) on launch
  const [engine, setEngine] = useState<"local" | "cloud">("local");
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [engineReachable, setEngineReachable] = useState<boolean>(false);

  // Badge state: which engine is active and whether it is reachable.
  // Local = Ollama ping; Cloud = last known test/answer status (no paid polling).
  const refreshEngineState = async () => {
    try {
      const [currentEngine, currentProvider] = await Promise.all([
        settingsRepo.getAiEngine(),
        settingsRepo.getCloudProvider(),
      ]);
      setEngine(currentEngine);
      setProvider(currentProvider);

      if (currentEngine === "cloud") {
        const lastStatus = await settingsRepo.getCloudLastStatus();
        setEngineReachable(lastStatus === "ok");
      } else {
        setEngineReachable(await ollamaClient.isRunning());
      }
    } catch (err) {
      console.error("Failed to refresh engine badge state:", err);
      setEngineReachable(false);
    }
  };

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

    refreshEngineState();
    const interval = setInterval(refreshEngineState, 10000);
    const onEngineUpdated = () => refreshEngineState();
    window.addEventListener("ai-engine-updated", onEngineUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("ai-engine-updated", onEngineUpdated);
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
            isPaused
              ? "bg-amber-500 animate-pulse"
              : engineReachable
                ? "bg-emerald-500"
                : "bg-text-faint"
          }`}
        />
        <span className="text-[12px] font-sans font-medium tracking-wider uppercase">
          {isPaused
            ? "Paused"
            : engine === "cloud"
              ? `Cloud · ${provider === "openai" ? "OpenAI" : "Anthropic"}`
              : "Local"}
        </span>
      </button>
    </div>
  );
};

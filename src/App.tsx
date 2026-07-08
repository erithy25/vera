import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { DayView } from "./components/DayView";
import { ClientsProjects } from "./components/ClientsProjects";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";
import { UpdateChecker } from "./components/UpdateChecker";
import { initializeDefaultSettings, settingsRepo } from "./lib/db";
import { startBlockEngine } from "./lib/blocks";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [currentView, setCurrentView] = useState<string>("Today");
  // Bumped when the TopBar anchor asks for the daily close — DayView reacts
  // to the counter, so the request survives DayView not being mounted yet.
  const [dailyCloseSignal, setDailyCloseSignal] = useState<number>(0);
  const [dbReady, setDbReady] = useState<boolean>(false);
  // True only when DB init actually succeeded — the block engine must never
  // write against a broken/unmigrated database (dbReady alone also covers the
  // degraded still-render-the-UI fallback).
  const [dbHealthy, setDbHealthy] = useState<boolean>(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  // Set when the capture sidecar reports missing screen-recording permission
  // (e.g. after macOS's monthly re-confirmation) — shown as a banner so
  // capture never stops silently.
  const [permissionMissing, setPermissionMissing] = useState<boolean>(false);

  const openScreenRecordingSettings = async () => {
    try {
      await invoke("request_screen_recording_permission");
      await invoke("open_privacy_settings", { pane: "screen_recording" });
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
    }
  };

  useEffect(() => {
    async function initDb() {
      try {
        await initializeDefaultSettings();
        try {
          setOnboardingComplete(await settingsRepo.getOnboardingComplete());
        } catch (err) {
          console.error("Failed to read onboarding flag:", err);
        }
        setDbReady(true);
        setDbHealthy(true);
        // If screen recording is on, unlock the encrypted media store (Touch ID)
        // so backend capture can resume. Failure leaves recording locked, not broken.
        try {
          if (await settingsRepo.getFramesCaptureEnabled()) {
            await invoke("vault_unlock");
          }
        } catch (err) {
          console.error("Recording store stayed locked (Touch ID declined):", err);
        }
      } catch (err) {
        console.error("Vera database initialization failed:", err);
        // Fall back to ready state so the UI still displays even if DB fails
        setDbReady(true);
      }
    }
    initDb();
  }, []);

  // The block engine turns raw capture into work blocks: an immediate
  // backfill run (watermark → today), then a refresh of today every 15
  // minutes. Only starts when DB init really succeeded.
  useEffect(() => {
    if (!dbHealthy) return;
    const stop = startBlockEngine();
    return stop;
  }, [dbHealthy]);

  // "Re-run onboarding" from Settings resets the flag and shows the flow again
  useEffect(() => {
    const onReset = () => setOnboardingComplete(false);
    window.addEventListener("onboarding-reset", onReset);
    return () => window.removeEventListener("onboarding-reset", onReset);
  }, []);

  // The TopBar anchor (any view) opens the daily close: switch to Today and
  // hand DayView the request via the counter prop.
  useEffect(() => {
    const onOpenDailyClose = () => {
      setCurrentView("Today");
      setDailyCloseSignal((n) => n + 1);
    };
    window.addEventListener("vera-open-daily-close", onOpenDailyClose);
    return () => window.removeEventListener("vera-open-daily-close", onOpenDailyClose);
  }, []);

  // The backend writes activity/frames to SQLite directly (so capture
  // survives the window being hidden/closed). The frontend surfaces
  // permission issues as a banner and mirrors tray-driven pause/resume into
  // the in-app state. (Data-refresh events return with the block-engine UI.)
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    async function setupListeners() {
      try {
        unlisteners.push(
          await listen<any>("screen-capture", (event) => {
            if (event.payload?.status === "PermissionRequired") {
              setPermissionMissing(true);
            }
          })
        );
        unlisteners.push(
          await listen<boolean>("capture-paused-changed", (event) => {
            window.dispatchEvent(
              new CustomEvent("capture-paused-updated", { detail: event.payload })
            );
          })
        );
      } catch (err) {
        console.error("Failed to set up capture listeners:", err);
      }
    }

    setupListeners();

    return () => {
      unlisteners.forEach((un) => un());
    };
  }, []);

  // First-run onboarding takes over the whole window until completed
  if (dbReady && onboardingComplete === false) {
    return <Onboarding onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <div className="flex w-full min-h-screen bg-bg-warm font-sans text-text-primary">
      {/* Fixed 260px Left Sidebar */}
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      {/* Flexible Centered Main Workspace Area */}
      <div className="flex-1 flex flex-col items-center overflow-x-hidden min-w-0">
        {/* Screen-recording permission lost (e.g. monthly macOS re-confirmation) */}
        {permissionMissing && (
          <div className="w-full flex items-center justify-between gap-4 bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5">
            <span className="font-sans text-[13px] text-amber-800">
              Screen recording permission is missing — capture has stopped. macOS
              asks you to re-confirm it about once a month.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={openScreenRecordingSettings}
                className="px-3 py-1.5 rounded-lg bg-text-primary text-card-surface font-sans text-[12px] font-medium cursor-pointer"
              >
                Open System Settings
              </button>
              <button
                onClick={() => setPermissionMissing(false)}
                className="px-2 py-1.5 rounded-lg font-sans text-[12px] text-amber-800 hover:bg-amber-500/10 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Right-aligned Top Status Bar */}
        <TopBar />

        {/* Content flow area */}
        <main className="w-full flex-1 flex flex-col items-center px-4">
          {dbReady ? (
            currentView === "Settings" ? (
              <Settings />
            ) : currentView === "Clients & Projects" ? (
              <ClientsProjects />
            ) : (
              <DayView openDailyCloseSignal={dailyCloseSignal} />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
              <span className="font-serif text-[24px] text-text-muted italic animate-pulse">
                Initializing Vera...
              </span>
            </div>
          )}
        </main>
      </div>

      {/* Auto-update prompt (shows only when a newer version is published) */}
      <UpdateChecker />
    </div>
  );
}

export default App;

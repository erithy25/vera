import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/Dashboard";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";
import { UpdateChecker } from "./components/UpdateChecker";
import { initializeDefaultSettings, settingsRepo } from "./lib/db";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const [currentView, setCurrentView] = useState<string>("Today");
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

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

  // "Re-run onboarding" from Settings resets the flag and shows the flow again
  useEffect(() => {
    const onReset = () => setOnboardingComplete(false);
    window.addEventListener("onboarding-reset", onReset);
    return () => window.removeEventListener("onboarding-reset", onReset);
  }, []);

  // The backend writes captures/activity to SQLite directly (so capture
  // survives the window being hidden/closed). The frontend just refreshes the
  // UI, surfaces permission issues, and mirrors tray-driven pause/resume into
  // the in-app state.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    async function setupListeners() {
      try {
        unlisteners.push(
          await listen("activity-stored", () => {
            window.dispatchEvent(new CustomEvent("activity-updated"));
          })
        );
        unlisteners.push(
          await listen("frame-stored", () => {
            window.dispatchEvent(new CustomEvent("frames-updated"));
          })
        );
        unlisteners.push(
          await listen<any>("screen-capture", (event) => {
            if (event.payload?.status === "PermissionRequired") {
              window.dispatchEvent(new CustomEvent("capture-permission-missing"));
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
        console.error("Failed to set up capture/activity listeners:", err);
      }
    }

    setupListeners();

    // 30s auto-refresh interval (UI only)
    const refreshInterval = setInterval(() => {
      window.dispatchEvent(new CustomEvent("activity-updated"));
    }, 30000);

    return () => {
      unlisteners.forEach((un) => un());
      clearInterval(refreshInterval);
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
        {/* Right-aligned Top Status Bar */}
        <TopBar />

        {/* Content flow area */}
        <main className="w-full flex-1 flex flex-col items-center px-4">
          {dbReady ? (
            currentView === "Settings" ? (
              <Settings />
            ) : (
              <Dashboard />
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

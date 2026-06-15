import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/Dashboard";
import { Knowledge } from "./components/Knowledge";
import { Settings } from "./components/Settings";
import { Agents } from "./components/Agents";
import { Goals } from "./components/Goals";
import { Timeline } from "./components/Timeline";
import { Onboarding } from "./components/Onboarding";
import { UpdateChecker } from "./components/UpdateChecker";
import { seedDatabaseIfEmpty, initializeDefaultSettings, framesRepo, settingsRepo } from "./lib/db";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ollamaClient } from "./lib/ollama";

async function backfillEmbeddings() {
  try {
    const isOnline = await ollamaClient.isRunning();
    if (!isOnline) {
      console.log("[Vera AI] Ollama is offline. Skipping embedding backfill.");
      return;
    }

    const models = await ollamaClient.listModels();
    const embeddingModel = await settingsRepo.getEmbeddingModel();
    if (!models.includes(embeddingModel) && !models.includes(`${embeddingModel}:latest`)) {
      console.log(`[Vera AI] Embedding model '${embeddingModel}' not available. Skipping backfill.`);
      return;
    }

    // Backfill embeddings for the visual memory (frames) so they are searchable.
    const framesToEmbed = await framesRepo.needingEmbeddings(100);
    if (framesToEmbed.length > 0) {
      console.log(`[Vera AI] Backfilling embeddings for ${framesToEmbed.length} frames...`);
      for (const f of framesToEmbed) {
        try {
          const text = (f.ocr_text || "").trim();
          if (text) {
            const vector = await ollamaClient.generateEmbedding(text, embeddingModel);
            await framesRepo.updateEmbedding(f.id, vector);
          }
        } catch (err) {
          console.error(`[Vera AI] Failed to embed frame ${f.id}:`, err);
          break;
        }
      }
    }

    console.log("[Vera AI] Embedding backfill batch completed.");
  } catch (err) {
    console.error("[Vera AI] Error during backfill:", err);
  }
}

// Backend persists captures (without embeddings); the frontend encodes new ones
// when the window is open. Guarded so backfills never overlap.
let embeddingBackfillRunning = false;
async function runEmbeddingBackfill() {
  if (embeddingBackfillRunning) return;
  embeddingBackfillRunning = true;
  try {
    await backfillEmbeddings();
  } finally {
    embeddingBackfillRunning = false;
  }
}

function App() {
  const [currentView, setCurrentView] = useState<string>("Dashboard");
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    async function initDb() {
      try {
        await seedDatabaseIfEmpty();
        await initializeDefaultSettings();
        try {
          setOnboardingComplete(await settingsRepo.getOnboardingComplete());
        } catch (err) {
          console.error("Failed to read onboarding flag:", err);
        }
        setDbReady(true);
        // Run embedding backfill in background
        backfillEmbeddings();
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
        console.error("Vera Database initialization failed:", err);
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

  // Clicking an agent on the Dashboard card switches to the Agents view
  useEffect(() => {
    const openAgents = () => setCurrentView("Agents");
    window.addEventListener("vera-open-agent", openAgents);
    return () => window.removeEventListener("vera-open-agent", openAgents);
  }, []);

  // "Jump to Timeline" from a cited frame thumbnail switches to the Timeline view
  useEffect(() => {
    const openTimeline = () => setCurrentView("Timeline");
    window.addEventListener("vera-open-timeline", openTimeline);
    return () => window.removeEventListener("vera-open-timeline", openTimeline);
  }, []);

  // The backend now writes captures/activity to SQLite directly (so capture
  // survives the window being hidden/closed). The frontend just refreshes the
  // UI, backfills embeddings for new captures, surfaces permission issues, and
  // mirrors tray-driven pause/resume into the in-app state.
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
          await listen("capture-stored", () => {
            window.dispatchEvent(new CustomEvent("captures-updated"));
            runEmbeddingBackfill();
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
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        dbReady={dbReady}
      />

      {/* Flexible Centered Main Workspace Area */}
      <div className="flex-1 flex flex-col items-center overflow-x-hidden min-w-0">
        {/* Right-aligned Top Status Bar */}
        <TopBar />

        {/* Content flow area */}
        <main className="w-full flex-1 flex flex-col items-center px-4">
          {dbReady ? (
            currentView === "Dashboard" ? (
              <Dashboard />
            ) : currentView === "Timeline" ? (
              <Timeline />
            ) : currentView === "Agents" ? (
              <Agents />
            ) : currentView === "Knowledge" ? (
              <Knowledge />
            ) : currentView === "Goals" ? (
              <Goals />
            ) : currentView === "Settings" ? (
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

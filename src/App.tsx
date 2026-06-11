import React, { useState, useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./components/Dashboard";
import { Knowledge } from "./components/Knowledge";
import { Settings } from "./components/Settings";
import { Agents } from "./components/Agents";
import { Goals } from "./components/Goals";
import { Onboarding } from "./components/Onboarding";
import { LockScreen } from "./components/LockScreen";
import { seedDatabaseIfEmpty, initializeDefaultSettings, pruneOldCaptures, activityRepo, capturesRepo, getDb, settingsRepo } from "./lib/db";
import { listen } from "@tauri-apps/api/event";
import { ollamaClient } from "./lib/ollama";
import { tokenSimilarity } from "./lib/textSimilarity";

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

    const db = await getDb();
    const unencoded = await db.select<any[]>(
      "SELECT id, ocr_text FROM captures WHERE (embedding IS NULL OR embedding = '') AND ocr_text != '' ORDER BY captured_at DESC LIMIT 100"
    );

    if (unencoded.length === 0) {
      return;
    }

    console.log(`[Vera AI] Backfilling embeddings for ${unencoded.length} captures...`);
    for (const row of unencoded) {
      try {
        const text = row.ocr_text.trim();
        if (text) {
          const vector = await ollamaClient.generateEmbedding(text, embeddingModel);
          await capturesRepo.updateEmbedding(row.id, vector);
        }
      } catch (err) {
        console.error(`[Vera AI] Failed to generate embedding for capture ${row.id}:`, err);
        break;
      }
    }
    console.log("[Vera AI] Embedding backfill batch completed.");
  } catch (err) {
    console.error("[Vera AI] Error during backfill:", err);
  }
}

async function handleNewCaptureEmbedding(captureId: number, ocrText: string) {
  try {
    const isOnline = await ollamaClient.isRunning();
    if (!isOnline) return;

    const embeddingModel = await settingsRepo.getEmbeddingModel();
    const models = await ollamaClient.listModels();
    if (!models.includes(embeddingModel) && !models.includes(`${embeddingModel}:latest`)) return;

    const text = ocrText.trim();
    if (text) {
      const vector = await ollamaClient.generateEmbedding(text, embeddingModel);
      await capturesRepo.updateEmbedding(captureId, vector);
      console.log(`[Vera AI] Generated and saved embedding for capture ${captureId}`);
    }
  } catch (err) {
    console.error(`[Vera AI] Failed to generate embedding for capture ${captureId}:`, err);
  }
}

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="w-full max-w-[1100px] flex flex-col items-center gap-4 px-8 pb-16 mt-12 select-none">
      <h1 className="font-serif text-[48px] font-normal text-text-primary tracking-tight text-center">
        {title}
      </h1>
      <span className="font-sans text-[14px] text-text-muted italic">
        Coming soon
      </span>
    </div>
  );
};

function App() {
  const [currentView, setCurrentView] = useState<string>("Dashboard");
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [locked, setLocked] = useState<boolean>(false);
  const appLockEnabledRef = useRef<boolean>(false);

  useEffect(() => {
    async function initDb() {
      try {
        await seedDatabaseIfEmpty();
        await initializeDefaultSettings();
        await pruneOldCaptures();
        try {
          setOnboardingComplete(await settingsRepo.getOnboardingComplete());
        } catch (err) {
          console.error("Failed to read onboarding flag:", err);
        }
        try {
          // App lock: when enabled, every cold launch starts locked
          const lockEnabled = await settingsRepo.getAppLockEnabled();
          appLockEnabledRef.current = lockEnabled;
          setLocked(lockEnabled);
        } catch (err) {
          console.error("Failed to read app lock flag:", err);
        }
        setDbReady(true);
        // Run embedding backfill in background
        backfillEmbeddings();
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

  // App lock: track the toggle and re-lock on hide/minimize and on Mac
  // lock/sleep (via the native screen-locked event). A plain focus change
  // keeps the window visible, so visibilitychange does not fire for it.
  useEffect(() => {
    const onAppLockUpdated = async () => {
      try {
        appLockEnabledRef.current = await settingsRepo.getAppLockEnabled();
      } catch (err) {
        console.error("Failed to reload app lock flag:", err);
      }
    };
    window.addEventListener("app-lock-updated", onAppLockUpdated);

    const onVisibilityChange = () => {
      if (document.hidden && appLockEnabledRef.current) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let unlistenScreenLock: (() => void) | null = null;
    listen("screen-locked", () => {
      if (appLockEnabledRef.current) {
        setLocked(true);
      }
    })
      .then((unlisten) => {
        unlistenScreenLock = unlisten;
      })
      .catch((err) => console.error("Failed to listen for screen-locked:", err));

    return () => {
      window.removeEventListener("app-lock-updated", onAppLockUpdated);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (unlistenScreenLock) unlistenScreenLock();
    };
  }, []);

  // Clicking an agent on the Dashboard card switches to the Agents view
  useEffect(() => {
    const openAgents = () => setCurrentView("Agents");
    window.addEventListener("vera-open-agent", openAgents);
    return () => window.removeEventListener("vera-open-agent", openAgents);
  }, []);

  // Set up activity segment event listener and auto-refresh intervals
  useEffect(() => {
    let unlistenActivity: (() => void) | null = null;
    let unlistenCapture: (() => void) | null = null;

    async function setupListeners() {
      try {
        unlistenActivity = await listen<any>("activity-segment", async (event) => {
          try {
            await activityRepo.insertEvent(event.payload);
            window.dispatchEvent(new CustomEvent("activity-updated"));
          } catch (err) {
            console.error("Failed to insert tracked segment:", err);
          }
        });
      } catch (err) {
        console.error("Failed to setup activity segment listener:", err);
      }

      try {
        unlistenCapture = await listen<any>("screen-capture", async (event) => {
          try {
            const { app_name, window_title, ocr_text, char_count, status } = event.payload;
            // Quality gates (mirror the backend): substantive content only,
            // and no near-duplicate of the latest capture for this app
            if (status === "Success" && char_count >= 64) {
              const latest = await capturesRepo.latestForApp(app_name);
              if (latest && tokenSimilarity(latest.ocr_text, ocr_text) > 0.85) {
                return;
              }
              const insertId = await capturesRepo.insert({
                app_name,
                window_title,
                ocr_text,
                char_count,
              });
              window.dispatchEvent(new CustomEvent("captures-updated"));
              // Asynchronously generate and save embedding vector
              handleNewCaptureEmbedding(insertId, ocr_text);
            } else if (status === "PermissionRequired") {
              window.dispatchEvent(new CustomEvent("capture-permission-missing"));
            }
          } catch (err) {
            console.error("Failed to insert screen capture segment:", err);
          }
        });
      } catch (err) {
        console.error("Failed to setup screen capture listener:", err);
      }
    }

    setupListeners();

    // 30s auto-refresh interval
    const refreshInterval = setInterval(() => {
      window.dispatchEvent(new CustomEvent("activity-updated"));
    }, 30000);

    return () => {
      if (unlistenActivity) {
        unlistenActivity();
      }
      if (unlistenCapture) {
        unlistenCapture();
      }
      clearInterval(refreshInterval);
    };
  }, []);

  // First-run onboarding takes over the whole window until completed
  if (dbReady && onboardingComplete === false) {
    return (
      <>
        <Onboarding onComplete={() => setOnboardingComplete(true)} />
        {locked && <LockScreen onUnlock={() => setLocked(false)} />}
      </>
    );
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
            ) : currentView === "Agents" ? (
              <Agents />
            ) : currentView === "Knowledge" ? (
              <Knowledge />
            ) : currentView === "Goals" ? (
              <Goals />
            ) : currentView === "Settings" ? (
              <Settings />
            ) : (
              <PlaceholderPage title={currentView} />
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

      {/* Optional app lock overlay — opaque, covers everything */}
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </div>
  );
}

export default App;

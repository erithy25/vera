import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Scan } from "./components/Scan";
import { Detectors } from "./components/Detectors";
import { Settings } from "./components/Settings";
import { UpdateChecker } from "./components/UpdateChecker";
import { initializeSettings } from "./lib/db";

/**
 * Vera's shell.
 *
 * There is no onboarding step any more, and no readiness gate that blocks the
 * window. The product needs no account, no model to download and no permission
 * to grant: you hand it a file and it reads it. The settings store is opened in
 * the background, and if it is unavailable the scanner still works — it only
 * holds preferences.
 */
function App() {
  const [currentView, setCurrentView] = useState<string>("Scan");

  useEffect(() => {
    initializeSettings();
  }, []);

  return (
    <div className="flex w-full min-h-screen bg-bg-warm font-sans text-text-primary">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      <div className="flex-1 flex flex-col items-center overflow-x-hidden min-w-0">
        <TopBar />

        <main className="w-full flex-1 flex flex-col items-center px-4">
          {currentView === "Detectors" ? (
            <Detectors />
          ) : currentView === "Settings" ? (
            <Settings />
          ) : (
            <Scan />
          )}
        </main>
      </div>

      {/* Auto-update prompt (shows only when a newer version is published) */}
      <UpdateChecker />
    </div>
  );
}

export default App;

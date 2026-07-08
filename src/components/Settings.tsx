import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { Plus, X, Shield, ShieldAlert, RotateCcw } from "lucide-react";
import { activityRepo, settingsRepo } from "../lib/db";
import { ollamaClient } from "../lib/ollama";
import { consumeSettingsSection } from "../lib/settingsNav";
import { domainOf } from "../lib/segmentation";
import { LicenseCard } from "./LicenseCard";
import { IntegrationsCard } from "./IntegrationsCard";

const errorToMessage = (err: any): string =>
  typeof err === "string" ? err : err?.message || String(err);

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const Settings: React.FC = () => {
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [framesEnabled, setFramesEnabled] = useState<boolean>(false);
  const [vaultUnlocked, setVaultUnlocked] = useState<boolean>(false);
  const [framesStorageBytes, setFramesStorageBytes] = useState<number>(0);
  const [framesMaxStorageMb, setFramesMaxStorageMb] = useState<number>(2048);
  const [framesRetentionDays, setFramesRetentionDays] = useState<number>(30);
  const [deleteFrom, setDeleteFrom] = useState<string>("");
  const [deleteTo, setDeleteTo] = useState<string>("");
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);
  const [excludedApps, setExcludedApps] = useState<string[]>([]);
  const [excludedDomains, setExcludedDomains] = useState<string[]>([]);

  // Profile + macOS permission status
  const [userName, setUserNameState] = useState<string>("");
  const [permAccessibility, setPermAccessibility] = useState<boolean>(false);
  const [permScreenRecording, setPermScreenRecording] = useState<boolean>(false);

  // Start-at-login (autostart). The OS Login Items is the source of truth.
  const [autostartOn, setAutostartOn] = useState<boolean>(false);
  const [autostartBusy, setAutostartBusy] = useState<boolean>(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  const [appInput, setAppInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  // Billing-entry generation preferences
  const [entryLanguage, setEntryLanguage] = useState<"en" | "de">("en");
  const [entryTone, setEntryTone] = useState<"concise" | "detailed">("concise");
  const [entryTemplate, setEntryTemplate] = useState<"agency" | "consulting" | "law">("agency");
  const [roundingIncrement, setRoundingIncrement] = useState<number>(0);
  const [roundingMode, setRoundingMode] = useState<"nearest" | "up" | "down">("nearest");

  // Local AI state (Ollama — the only engine; nothing leaves the device)
  const [ollamaOnline, setOllamaOnline] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [chatModel, setChatModel] = useState<string>("llama3.2:3b");
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<{ status: string; percent: number } | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  const checkOllamaStatus = async () => {
    try {
      const online = await ollamaClient.isRunning();
      setOllamaOnline(online);
      if (online) {
        const models = await ollamaClient.listModels();
        setAvailableModels(models);
        setOllamaError(null);
      } else {
        setAvailableModels([]);
      }
    } catch (e: any) {
      setOllamaOnline(false);
      setAvailableModels([]);
      setOllamaError(e.message || "Failed to connect to Ollama");
    }
  };

  const loadSettings = async () => {
    try {
      const [paused, framesOn, apps, domains, dbChat, name, lang, tone, template, inc, mode] =
        await Promise.all([
          settingsRepo.getCapturePaused(),
          settingsRepo.getFramesCaptureEnabled(),
          settingsRepo.getExcludedApps(),
          settingsRepo.getExcludedDomains(),
          settingsRepo.getChatModel(),
          settingsRepo.getUserName(),
          settingsRepo.getEntryLanguage(),
          settingsRepo.getEntryTone(),
          settingsRepo.getEntryTemplate(),
          settingsRepo.getRoundingIncrement(),
          settingsRepo.getRoundingMode(),
        ]);

      setIsPaused(paused);
      setFramesEnabled(framesOn);
      setExcludedApps(apps);

      setFramesMaxStorageMb(await settingsRepo.getFramesMaxStorageMb());
      setFramesRetentionDays(await settingsRepo.getFramesRetentionDays());
      try {
        setFramesStorageBytes(await invoke<number>("get_frames_storage_bytes"));
        setVaultUnlocked(await invoke<boolean>("is_vault_unlocked"));
      } catch (err) {
        console.error("Failed to read frame storage/vault state:", err);
      }
      setExcludedDomains(domains);
      setChatModel(dbChat);
      setUserNameState(name);

      setEntryLanguage(lang);
      setEntryTone(tone);
      setEntryTemplate(template);
      setRoundingIncrement(inc);
      setRoundingMode(mode);

      // Initialize Rust state
      await invoke("update_privacy_settings", {
        paused,
        excludedApps: apps,
        excludedDomains: domains,
      });

      await checkOllamaStatus();
    } catch (err) {
      console.error("Failed to load settings from DB:", err);
    }
  };

  const refreshPermissions = async () => {
    try {
      const [ax, sr] = await Promise.all([
        invoke<boolean>("has_accessibility_permission"),
        invoke<boolean>("has_screen_recording_permission"),
      ]);
      setPermAccessibility(ax);
      setPermScreenRecording(sr);
    } catch (err) {
      console.error("Failed to check macOS permissions:", err);
    }
  };

  useEffect(() => {
    loadSettings();
    refreshPermissions();
    // Reflect the real OS Login Items state
    isAutostartEnabled()
      .then(setAutostartOn)
      .catch((err) => console.error("Failed to read autostart state:", err));
    // Re-check when the user returns from System Settings
    const onFocus = () => refreshPermissions();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleToggleAutostart = async () => {
    if (autostartBusy) return;
    setAutostartBusy(true);
    setAutostartError(null);
    const next = !autostartOn;
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      // Confirm against the real OS state rather than assuming
      setAutostartOn(await isAutostartEnabled());
      try {
        await settingsRepo.setAutostartEnabled(next);
      } catch (e) {
        console.error("Failed to persist autostart pref:", e);
      }
    } catch (err) {
      setAutostartError(errorToMessage(err));
    } finally {
      setAutostartBusy(false);
    }
  };

  // Scroll to a section requested from the profile menu (on mount and on event)
  useEffect(() => {
    const scrollToPending = () => {
      const section = consumeSettingsSection();
      if (!section) return;
      setTimeout(() => {
        document
          .getElementById(`settings-${section}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    };
    scrollToPending();
    window.addEventListener("vera-settings-section", scrollToPending);
    return () => window.removeEventListener("vera-settings-section", scrollToPending);
  }, []);

  const handleSaveUserName = async (val: string) => {
    try {
      await settingsRepo.setUserName(val.trim());
      window.dispatchEvent(new CustomEvent("profile-updated"));
    } catch (err) {
      console.error("Failed to save user name:", err);
    }
  };

  const handleRerunOnboarding = async () => {
    try {
      await settingsRepo.setOnboardingComplete(false);
      window.dispatchEvent(new CustomEvent("onboarding-reset"));
    } catch (err) {
      console.error("Failed to reset onboarding:", err);
    }
  };

  const handleOpenPrivacyPane = async (pane: "accessibility" | "screen_recording") => {
    try {
      if (pane === "accessibility") {
        await invoke("request_accessibility_permission");
      } else {
        await invoke("request_screen_recording_permission");
      }
      await invoke("open_privacy_settings", { pane });
    } catch (err) {
      console.error("Failed to open privacy settings:", err);
    }
  };

  const handleSaveChatModel = async (val: string) => {
    const cleaned = val.trim();
    if (cleaned) {
      await settingsRepo.setChatModel(cleaned);
    }
  };

  const handlePullModel = async (modelName: string) => {
    const cleaned = modelName.trim();
    if (!cleaned) return;
    setPullingModel(cleaned);
    setPullProgress({ status: "Starting download...", percent: 0 });
    setOllamaError(null);
    try {
      await ollamaClient.pullModel(cleaned, (prog) => {
        setPullProgress({
          status: prog.status,
          percent: prog.percent || 0,
        });
      });
      // Refresh available models
      const models = await ollamaClient.listModels();
      setAvailableModels(models);
      setPullingModel(null);
      setPullProgress(null);
    } catch (err: any) {
      console.error(err);
      setOllamaError(`Failed to pull ${cleaned}: ${err.message || err}`);
      setPullingModel(null);
      setPullProgress(null);
    }
  };

  const handleVaultUnlock = async () => {
    try {
      await invoke("vault_unlock"); // Touch ID (or transparent fallback key)
      setVaultUnlocked(true);
      return true;
    } catch (err) {
      console.error("Vault unlock failed:", err);
      window.alert("Could not enable recording (key vault): " + errorToMessage(err));
      return false;
    }
  };

  const handleToggleFrames = async () => {
    const nextState = !framesEnabled;
    // Turning recording on requires unlocking the encrypted store with Touch ID.
    if (nextState && !vaultUnlocked) {
      const ok = await handleVaultUnlock();
      if (!ok) return; // stay off if the user cancels Touch ID
    }
    setFramesEnabled(nextState);
    try {
      await settingsRepo.setFramesCaptureEnabled(nextState);
      await invoke("set_frames_capture_enabled", { enabled: nextState });
    } catch (err) {
      console.error("Failed to toggle frame capture:", err);
      setFramesEnabled(!nextState); // revert on failure
    }
  };

  const handleFramesStorageChange = async (mb: number) => {
    setFramesMaxStorageMb(mb);
    try {
      await settingsRepo.setFramesMaxStorageMb(mb);
    } catch (err) {
      console.error("Failed to set frame storage budget:", err);
    }
  };

  const handleFramesRetentionChange = async (days: number) => {
    setFramesRetentionDays(days);
    try {
      await settingsRepo.setFramesRetentionDays(days);
    } catch (err) {
      console.error("Failed to set frame retention:", err);
    }
  };

  const refreshFramesStorage = async () => {
    try {
      setFramesStorageBytes(await invoke<number>("get_frames_storage_bytes"));
    } catch (err) {
      console.error("Failed to read frame storage size:", err);
    }
  };

  const runDeleteRange = async (startMs: number, endMs: number) => {
    setDeleteBusy(true);
    try {
      await invoke<number>("delete_frames_range", { startMs, endMs });
      await refreshFramesStorage();
    } catch (err) {
      console.error("Failed to delete recordings:", err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleFramesDeleteLast15 = () => runDeleteRange(Date.now() - 15 * 60 * 1000, Date.now());

  const handleFramesDeleteToday = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return runDeleteRange(midnight, Date.now());
  };

  const handleFramesDeleteRange = () => {
    if (!deleteFrom || !deleteTo) return;
    const start = new Date(deleteFrom).getTime();
    const end = new Date(deleteTo).getTime() + 24 * 60 * 60 * 1000 - 1; // include the whole 'to' day
    if (isNaN(start) || isNaN(end) || start > end) return;
    return runDeleteRange(start, end);
  };

  const handleFramesClearAll = async () => {
    if (!window.confirm("Delete ALL captured screen recordings? This cannot be undone.")) return;
    setDeleteBusy(true);
    try {
      await invoke("clear_all_frames");
      await refreshFramesStorage();
    } catch (err) {
      console.error("Failed to clear recordings:", err);
    } finally {
      setDeleteBusy(false);
    }
  };

  // "Clear all data" (profile menu) lands here: wipes recordings AND the
  // activity history, so the label keeps its promise.
  const handleDeleteEverything = async () => {
    if (!window.confirm("Delete ALL data — screen recordings and the entire activity history? This cannot be undone.")) return;
    setDeleteBusy(true);
    try {
      await invoke("clear_all_frames");
      await activityRepo.deleteAll();
      await refreshFramesStorage();
    } catch (err) {
      console.error("Failed to delete all data:", err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleOpenOllamaSite = async () => {
    try {
      await invoke("open_external", { url: "https://ollama.com" });
    } catch (err) {
      console.error("Failed to open ollama.com:", err);
    }
  };

  const handleTogglePause = async () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    try {
      await settingsRepo.setCapturePaused(nextState);
      await invoke("set_capture_paused", { paused: nextState });
      window.dispatchEvent(new CustomEvent("capture-paused-updated", { detail: nextState }));
    } catch (err) {
      console.error("Failed to update pause state:", err);
    }
  };

  const handleAddApp = async (e: React.FormEvent) => {
    e.preventDefault();
    const app = appInput.trim();
    if (!app || excludedApps.includes(app)) return;

    const nextApps = [...excludedApps, app];
    setExcludedApps(nextApps);
    setAppInput("");
    try {
      await settingsRepo.setExcludedApps(nextApps);
      await invoke("update_privacy_settings", {
        paused: isPaused,
        excludedApps: nextApps,
        excludedDomains,
      });
    } catch (err) {
      console.error("Failed to save app exclusions:", err);
    }
  };

  const handleRemoveApp = async (app: string) => {
    const nextApps = excludedApps.filter((a) => a !== app);
    setExcludedApps(nextApps);
    try {
      await settingsRepo.setExcludedApps(nextApps);
      await invoke("update_privacy_settings", {
        paused: isPaused,
        excludedApps: nextApps,
        excludedDomains,
      });
    } catch (err) {
      console.error("Failed to remove app exclusion:", err);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same normalization the segmentation engine uses to group blocks by
    // domain — exclusions and block domains must never disagree.
    const domain = domainOf(domainInput) ?? "";
    if (!domain || excludedDomains.includes(domain)) return;

    const nextDomains = [...excludedDomains, domain];
    setExcludedDomains(nextDomains);
    setDomainInput("");
    try {
      await settingsRepo.setExcludedDomains(nextDomains);
      await invoke("update_privacy_settings", {
        paused: isPaused,
        excludedApps,
        excludedDomains: nextDomains,
      });
    } catch (err) {
      console.error("Failed to save domain exclusions:", err);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    const nextDomains = excludedDomains.filter((d) => d !== domain);
    setExcludedDomains(nextDomains);
    try {
      await settingsRepo.setExcludedDomains(nextDomains);
      await invoke("update_privacy_settings", {
        paused: isPaused,
        excludedApps,
        excludedDomains: nextDomains,
      });
    } catch (err) {
      console.error("Failed to remove domain exclusion:", err);
    }
  };

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      {/* Header Info */}
      <div className="flex flex-col gap-1.5 border-b border-border-hairline pb-4">
        <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
          Settings
        </h1>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed">
          Manage capture, privacy controls, and the local AI model. Everything runs on this Mac.
        </p>
      </div>

      {/* License (trial / activation / buy trigger) */}
      <LicenseCard />

      {/* Local AI Card (Ollama — the only engine) */}
      <div id="settings-local-ai" className="card-style p-6 flex flex-col gap-5 scroll-mt-6">
        <div className="flex items-center justify-between border-b border-border-hairline pb-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-serif text-[20px] font-normal text-text-primary">Local AI</h2>
            <p className="font-sans text-[13px] text-text-faint">
              The local Ollama model Vera will use to assign work blocks and draft billing narratives. There is no cloud engine — your capture and the AI never leave this Mac.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkOllamaStatus}
              className="px-3 py-1.5 border border-border-hairline rounded-xl text-[11px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer uppercase font-semibold"
            >
              Refresh
            </button>
            <span className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-[12px] font-sans font-medium uppercase ${
              ollamaOnline
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                : "border-amber-500/20 bg-amber-500/5 text-amber-600"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ollamaOnline ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
              Ollama {ollamaOnline ? "Connected" : "Offline"}
            </span>
          </div>
        </div>

        {/* Connection/Setup guide if offline */}
        {!ollamaOnline && (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[14px] font-semibold text-amber-900 leading-tight">Ollama is not running</span>
                <p className="font-sans text-[13px] text-amber-800 leading-relaxed">
                  Vera uses <strong>Ollama</strong> to run its AI entirely on your Mac, so assigning and drafting stays 100% private and offline.
                </p>
              </div>
            </div>

            <div className="h-px bg-amber-500/10 w-full" />

            <div className="flex flex-col gap-2 font-sans text-[13px] text-amber-800">
              <span className="font-semibold">How to get started:</span>
              <ol className="list-decimal pl-5 flex flex-col gap-1.5">
                <li>Download Ollama for Mac from <button onClick={handleOpenOllamaSite} className="underline font-semibold hover:text-amber-950 cursor-pointer">ollama.com</button>.</li>
                <li>Install and launch the Ollama application.</li>
                <li>Vera connects automatically once Ollama is running in your menu bar. Click <strong>Refresh</strong> above to verify.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Model configuration */}
        <div className="flex flex-col gap-2.5 max-w-[480px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-serif text-[15px] font-normal text-text-primary">AI Model</span>
            <span className="font-sans text-[12px] text-text-faint">A small local model is enough; a larger one writes better narratives.</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              onBlur={() => handleSaveChatModel(chatModel)}
              className="flex-1 px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none"
              placeholder="e.g. llama3.2:3b"
            />
            {ollamaOnline && (
              <button
                onClick={() => handlePullModel(chatModel)}
                disabled={pullingModel !== null || availableModels.includes(chatModel) || availableModels.includes(`${chatModel}:latest`)}
                className={`px-3 py-1.5 border rounded-xl font-sans text-[12px] font-medium transition-all ${
                  availableModels.includes(chatModel) || availableModels.includes(`${chatModel}:latest`)
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 cursor-default"
                    : pullingModel
                      ? "border-border-hairline text-text-faint cursor-default animate-pulse"
                      : "border-text-primary text-text-primary hover:bg-active-hover cursor-pointer"
                }`}
              >
                {availableModels.includes(chatModel) || availableModels.includes(`${chatModel}:latest`) ? "Ready" : "Pull Model"}
              </button>
            )}
          </div>
        </div>

        {/* Pull streaming progress bar */}
        {pullingModel && pullProgress && (
          <div className="flex flex-col gap-2 bg-active-hover/50 p-4 border border-border-hairline rounded-2xl mt-2">
            <div className="flex justify-between items-center text-[12px] font-sans">
              <span className="text-text-primary font-medium">Downloading <code className="bg-active-hover px-1 rounded">{pullingModel}</code></span>
              <span className="text-text-muted">{pullProgress.percent}%</span>
            </div>
            <div className="w-full bg-active-hover h-2 rounded-full overflow-hidden border border-border-hairline">
              <div className="bg-text-primary h-full transition-all duration-300" style={{ width: `${pullProgress.percent}%` }} />
            </div>
            <span className="font-sans text-[11px] text-text-faint italic">{pullProgress.status}</span>
          </div>
        )}

        {/* Error notification */}
        {ollamaError && (
          <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl font-sans text-[12px] text-red-600 leading-normal">
            {ollamaError}
          </div>
        )}
      </div>

      {/* Billing entries: narrative style + rounding */}
      <div className="card-style p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-0.5 border-b border-border-hairline pb-4">
          <h2 className="font-serif text-[20px] font-normal text-text-primary">Billing Entries</h2>
          <p className="font-sans text-[13px] text-text-faint">
            How the daily close writes and rounds your entries. Rounding can be overridden per project in Clients & Projects.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[13px] font-medium text-text-primary">Language</span>
            <select
              value={entryLanguage}
              onChange={async (e) => {
                const v = e.target.value as "en" | "de";
                setEntryLanguage(v);
                await settingsRepo.setEntryLanguage(v);
              }}
              className="px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none cursor-pointer"
            >
              <option value="en">English</option>
              <option value="de">German</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[13px] font-medium text-text-primary">Tone</span>
            <select
              value={entryTone}
              onChange={async (e) => {
                const v = e.target.value as "concise" | "detailed";
                setEntryTone(v);
                await settingsRepo.setEntryTone(v);
              }}
              className="px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none cursor-pointer"
            >
              <option value="concise">Concise (1–2 sentences)</option>
              <option value="detailed">Detailed (2–3 sentences)</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[13px] font-medium text-text-primary">Style</span>
            <select
              value={entryTemplate}
              onChange={async (e) => {
                const v = e.target.value as "agency" | "consulting" | "law";
                setEntryTemplate(v);
                await settingsRepo.setEntryTemplate(v);
              }}
              className="px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none cursor-pointer"
            >
              <option value="agency">Agency / Studio</option>
              <option value="consulting">Consulting</option>
              <option value="law">Law firm</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[13px] font-medium text-text-primary">Round time to</span>
            <div className="grid grid-cols-3 gap-2 border border-border-hairline rounded-xl p-1 bg-card-surface/40">
              {[
                { l: "Exact", v: 0 },
                { l: "6 min", v: 6 },
                { l: "15 min", v: 15 },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={async () => {
                    setRoundingIncrement(opt.v);
                    await settingsRepo.setRoundingIncrement(opt.v);
                  }}
                  className={`py-2 rounded-lg font-sans text-[12px] transition-all cursor-pointer ${
                    roundingIncrement === opt.v
                      ? "bg-active-hover text-text-primary font-medium soft-shadow"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-sans text-[13px] font-medium text-text-primary">Rounding direction</span>
            {/* Never disabled: per-project overrides round even when the
                global increment is "Exact". */}
            <div className="grid grid-cols-3 gap-2 border border-border-hairline rounded-xl p-1 bg-card-surface/40">
              {[
                { l: "Nearest", v: "nearest" as const },
                { l: "Up", v: "up" as const },
                { l: "Down", v: "down" as const },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={async () => {
                    setRoundingMode(opt.v);
                    await settingsRepo.setRoundingMode(opt.v);
                  }}
                  className={`py-2 rounded-lg font-sans text-[12px] transition-all cursor-pointer ${
                    roundingMode === opt.v
                      ? "bg-active-hover text-text-primary font-medium soft-shadow"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
            <span className="font-sans text-[11px] text-text-faint">
              Applies wherever rounding is on — globally or per project.
            </span>
          </div>
        </div>
      </div>

      {/* Integrations (push entries into your billing tool) */}
      <IntegrationsCard />

      <div id="settings-privacy" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 scroll-mt-6">
        {/* Left Column Controls */}
        <div className="flex flex-col gap-6">
          {/* Master Capture Status Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  Capture
                </span>
                <span className="font-sans text-[12px] text-text-faint">
                  Pause or resume all background capture
                </span>
              </div>
              <button
                onClick={handleTogglePause}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-[12px] font-sans font-medium uppercase transition-all duration-200 cursor-pointer ${
                  isPaused
                    ? "border-amber-500/30 hover:bg-amber-500/5 text-amber-600"
                    : "border-border-hairline hover:bg-active-hover text-text-muted hover:text-text-primary"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isPaused ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                {isPaused ? "Paused" : "Active"}
              </button>
            </div>
          </div>

          {/* Frame-based Screen Recording Card (default OFF) */}
          <div className="card-style p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  Screen recording (frames)
                </span>
                <span className="font-sans text-[12px] text-text-muted leading-normal">
                  Periodically saves a downscaled snapshot of your screen (about once per second, only when the view changes) so Vera can understand what you worked on — the raw material for your work blocks. Sensitive patterns (cards, IBANs, keys) are always redacted. Stored encrypted on this Mac; off by default.
                </span>
              </div>
              <input
                type="checkbox"
                checked={framesEnabled}
                onChange={handleToggleFrames}
                className="mt-1 cursor-pointer w-4 h-4 accent-text-primary rounded border-border-hairline"
              />
            </div>

            {framesEnabled && (
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-hairline">
                <span className="font-sans text-[12px] text-text-faint flex items-center gap-1.5">
                  <Shield size={12} />
                  {vaultUnlocked
                    ? "Encrypted at rest · unlocked this session"
                    : "Encrypted · locked — unlock to record"}
                </span>
                {!vaultUnlocked && (
                  <button
                    onClick={handleVaultUnlock}
                    className="px-3 py-1.5 border border-border-hairline rounded-full text-[12px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer whitespace-nowrap"
                  >
                    Unlock with Touch ID
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Frame Storage (usage + budget + retention) Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  Recording Storage
                </span>
                <span className="font-sans text-[12px] text-text-faint">
                  HEVC segments + thumbnails on this Mac
                </span>
              </div>
              <button
                onClick={refreshFramesStorage}
                className="px-3 py-1.5 border border-border-hairline rounded-full text-[12px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
              >
                {formatBytes(framesStorageBytes)} used
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-sans text-[12px] text-text-muted">Storage budget</span>
              <div className="grid grid-cols-4 gap-2 border border-border-hairline rounded-xl p-1 bg-card-surface/40">
                {[
                  { l: "512 MB", v: 512 },
                  { l: "2 GB", v: 2048 },
                  { l: "5 GB", v: 5120 },
                  { l: "10 GB", v: 10240 },
                ].map((opt) => {
                  const active = framesMaxStorageMb === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => handleFramesStorageChange(opt.v)}
                      className={`py-2 rounded-lg font-sans text-[12px] transition-all cursor-pointer ${
                        active
                          ? "bg-active-hover text-text-primary font-medium soft-shadow"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {opt.l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-sans text-[12px] text-text-muted">Keep raw recordings for — raw data expires, your work blocks and their evidence remain</span>
              <div className="grid grid-cols-4 gap-2 border border-border-hairline rounded-xl p-1 bg-card-surface/40">
                {[7, 30, 90, 365].map((d) => {
                  const active = framesRetentionDays === d;
                  const label = d === 365 ? "1 Year" : `${d} Days`;
                  return (
                    <button
                      key={d}
                      onClick={() => handleFramesRetentionChange(d)}
                      className={`py-2 rounded-lg font-sans text-[12px] transition-all cursor-pointer ${
                        active
                          ? "bg-active-hover text-text-primary font-medium soft-shadow"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recording Data Management Card */}
          <div id="settings-clear-data" className="card-style p-5 flex flex-col gap-4 scroll-mt-6">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Recording Data
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Delete captured screen history from this Mac
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleFramesDeleteLast15}
                disabled={deleteBusy}
                className="px-3 py-1.5 border border-border-hairline rounded-full text-[12px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer disabled:opacity-50"
              >
                Delete last 15 min
              </button>
              <button
                onClick={handleFramesDeleteToday}
                disabled={deleteBusy}
                className="px-3 py-1.5 border border-border-hairline rounded-full text-[12px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer disabled:opacity-50"
              >
                Delete today
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-sans text-[12px] text-text-muted">Delete a date range</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={deleteFrom}
                  onChange={(e) => setDeleteFrom(e.target.value)}
                  className="px-2 py-1.5 border border-border-hairline rounded-lg text-[12px] font-sans bg-card-surface text-text-primary"
                />
                <span className="text-text-faint text-[12px]">to</span>
                <input
                  type="date"
                  value={deleteTo}
                  onChange={(e) => setDeleteTo(e.target.value)}
                  className="px-2 py-1.5 border border-border-hairline rounded-lg text-[12px] font-sans bg-card-surface text-text-primary"
                />
                <button
                  onClick={handleFramesDeleteRange}
                  disabled={deleteBusy || !deleteFrom || !deleteTo}
                  className="px-3 py-1.5 border border-border-hairline rounded-full text-[12px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer disabled:opacity-50"
                >
                  Delete range
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleFramesClearAll}
                disabled={deleteBusy}
                className="px-3 py-1.5 border border-red-500/30 rounded-full text-[12px] font-sans font-medium text-red-600 hover:bg-red-500/5 transition-all cursor-pointer disabled:opacity-50"
              >
                Delete all recordings
              </button>
              <button
                onClick={handleDeleteEverything}
                disabled={deleteBusy}
                className="px-3 py-1.5 border border-red-500/30 rounded-full text-[12px] font-sans font-medium text-red-600 hover:bg-red-500/5 transition-all cursor-pointer disabled:opacity-50"
              >
                Delete everything (incl. activity history)
              </button>
            </div>
          </div>

          {/* Profile Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Profile
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Your name, shown in the sidebar
              </span>
            </div>

            <input
              type="text"
              value={userName}
              onChange={(e) => setUserNameState(e.target.value)}
              onBlur={() => handleSaveUserName(userName)}
              placeholder="Your name"
              className="px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
            />

            <button
              onClick={handleRerunOnboarding}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 border border-border-hairline rounded-xl font-sans text-[12px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
            >
              <RotateCcw size={13} strokeWidth={1.5} />
              Re-run onboarding
            </button>
          </div>

          {/* Start at login */}
          <div className="card-style p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  Start Vera at login
                </span>
                <span className="font-sans text-[12px] text-text-muted leading-normal">
                  Launch Vera automatically when you log in, so no billable minute goes untracked.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autostartOn}
                onChange={handleToggleAutostart}
                disabled={autostartBusy}
                className="mt-1 cursor-pointer w-4 h-4 accent-text-primary rounded border-border-hairline"
              />
            </div>
            {autostartError && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl font-sans text-[12px] text-amber-700 leading-normal">
                {autostartError}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Exclusions list */}
        <div className="flex flex-col gap-6">
          {/* Excluded Apps Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Excluded Applications
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Never capture screens when these apps are frontmost
              </span>
            </div>

            <form onSubmit={handleAddApp} className="flex gap-2">
              <input
                type="text"
                value={appInput}
                onChange={(e) => setAppInput(e.target.value)}
                placeholder="App Name or Bundle ID..."
                className="flex-1 px-3 py-1.5 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
              />
              <button
                type="submit"
                className="px-3 rounded-xl bg-text-primary text-card-surface hover:bg-text-muted transition-colors cursor-pointer"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
              {excludedApps.map((app) => (
                <div
                  key={app}
                  className="flex items-center gap-1 px-2.5 py-1 bg-active-hover border border-border-hairline rounded-lg text-[13px]"
                >
                  <span className="text-text-primary font-medium">{app}</span>
                  <button
                    onClick={() => handleRemoveApp(app)}
                    className="text-text-faint hover:text-red-600 p-0.5 rounded cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Excluded domains/sites Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Excluded Domains
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Skip captures on specific domains/URLs
              </span>
            </div>

            {/* AppleScript Automation Info Notice */}
            <div className="flex items-start gap-2 p-3 bg-card-surface/40 border border-border-hairline rounded-xl">
              <Shield className="text-text-muted shrink-0 mt-0.5" size={15} />
              <span className="font-sans text-[11px] text-text-muted leading-normal">
                Vera's browser domain checks use macOS Automation. You will be prompted to grant permission on matching domains. Denying access will skip captures on the browser for safety.
              </span>
            </div>

            <form onSubmit={handleAddDomain} className="flex gap-2">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="domain.com (e.g. paypal.com)..."
                className="flex-1 px-3 py-1.5 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
              />
              <button
                type="submit"
                className="px-3 rounded-xl bg-text-primary text-card-surface hover:bg-text-muted transition-colors cursor-pointer"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
              {excludedDomains.length > 0 ? (
                excludedDomains.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center gap-1 px-2.5 py-1 bg-active-hover border border-border-hairline rounded-lg text-[13px]"
                  >
                    <span className="text-text-primary font-medium">{domain}</span>
                    <button
                      onClick={() => handleRemoveDomain(domain)}
                      className="text-text-faint hover:text-red-600 p-0.5 rounded cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <span className="text-[12px] text-text-faint italic px-1">
                  No excluded domains configured
                </span>
              )}
            </div>
          </div>

          {/* macOS Permissions Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  macOS Permissions
                </span>
                <span className="font-sans text-[12px] text-text-faint">
                  What Vera is currently allowed to see
                </span>
              </div>
              <button
                onClick={refreshPermissions}
                className="px-3 py-1.5 border border-border-hairline rounded-xl text-[11px] font-sans text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer uppercase font-semibold"
              >
                Refresh
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {[
                {
                  label: "Accessibility",
                  hint: "Activity tracking (active app & window)",
                  granted: permAccessibility,
                  pane: "accessibility" as const,
                },
                {
                  label: "Screen Recording",
                  hint: "Reads your screen to build work blocks. macOS re-confirms this roughly monthly — that's normal.",
                  granted: permScreenRecording,
                  pane: "screen_recording" as const,
                },
              ].map((perm) => (
                <div key={perm.pane} className="flex items-center gap-3">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-sans text-[13px] font-medium text-text-primary">
                      {perm.label}
                    </span>
                    <span className="font-sans text-[11px] text-text-faint">{perm.hint}</span>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-full font-sans text-[11px] font-medium uppercase shrink-0 ${
                      perm.granted
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-600"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        perm.granted ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                      }`}
                    />
                    {perm.granted ? "Granted" : "Not granted"}
                  </span>
                  {!perm.granted && (
                    <button
                      onClick={() => handleOpenPrivacyPane(perm.pane)}
                      className="px-3 py-1.5 border border-text-primary rounded-xl font-sans text-[12px] font-medium text-text-primary hover:bg-active-hover transition-all cursor-pointer shrink-0"
                    >
                      Open Settings
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Settings;

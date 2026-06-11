import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, X, Shield, ShieldAlert, Trash2, EyeOff, RotateCcw } from "lucide-react";
import { settingsRepo } from "../lib/db";
import { ollamaClient } from "../lib/ollama";

export const Settings: React.FC = () => {
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [excludedApps, setExcludedApps] = useState<string[]>([]);
  const [excludedDomains, setExcludedDomains] = useState<string[]>([]);
  const [redactionEnabled, setRedactionEnabled] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<string>("30");

  const [appInput, setAppInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  // Local AI Brain state
  const [ollamaOnline, setOllamaOnline] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [chatModel, setChatModel] = useState<string>("llama3.2:3b");
  const [embeddingModel, setEmbeddingModel] = useState<string>("nomic-embed-text");
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
      const [paused, apps, domains, redaction, retention, dbChat, dbEmbed] = await Promise.all([
        settingsRepo.getCapturePaused(),
        settingsRepo.getExcludedApps(),
        settingsRepo.getExcludedDomains(),
        settingsRepo.getRedactionEnabled(),
        settingsRepo.getRetentionDays(),
        settingsRepo.getChatModel(),
        settingsRepo.getEmbeddingModel(),
      ]);

      setIsPaused(paused);
      setExcludedApps(apps);
      setExcludedDomains(domains);
      setRedactionEnabled(redaction);
      setRetentionDays(retention);
      setChatModel(dbChat);
      setEmbeddingModel(dbEmbed);

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

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveChatModel = async (val: string) => {
    const cleaned = val.trim();
    if (cleaned) {
      await settingsRepo.setChatModel(cleaned);
    }
  };

  const handleSaveEmbeddingModel = async (val: string) => {
    const cleaned = val.trim();
    if (cleaned) {
      await settingsRepo.setEmbeddingModel(cleaned);
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
    let domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    
    // Simple URL strip to extract clean hostname if user pasted URL
    if (domain.includes("://")) {
      try {
        const urlObj = new URL(domain);
        domain = urlObj.hostname;
      } catch (err) {
        // Fallback simple string strip
        const match = domain.match(/:\/\/([^\/:]+)/);
        if (match) domain = match[1];
      }
    }
    if (domain.startsWith("www.")) {
      domain = domain.substring(4);
    }

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

  const handleToggleRedaction = async () => {
    const nextVal = !redactionEnabled;
    setRedactionEnabled(nextVal);
    try {
      await settingsRepo.setRedactionEnabled(nextVal);
    } catch (err) {
      console.error("Failed to save redaction setting:", err);
    }
  };

  const handleRetentionChange = async (days: string) => {
    setRetentionDays(days);
    try {
      await settingsRepo.setRetentionDays(days);
    } catch (err) {
      console.error("Failed to save retention setting:", err);
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm("Are you sure you want to delete ALL screen memory? This action is permanent and cannot be undone.")) {
      try {
        await settingsRepo.deleteAllCaptures();
        window.dispatchEvent(new CustomEvent("captures-updated"));
        alert("Screen memory cleared successfully.");
      } catch (err) {
        console.error("Failed to clear captures database:", err);
      }
    }
  };

  const handleDeleteToday = async () => {
    if (window.confirm("Are you sure you want to delete today's screen captures?")) {
      try {
        await settingsRepo.deleteTodaysCaptures();
        window.dispatchEvent(new CustomEvent("captures-updated"));
        alert("Today's captures deleted successfully.");
      } catch (err) {
        console.error("Failed to delete today's captures:", err);
      }
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
          Manage your private capture configurations, data retention periods, and excluded applications.
        </p>
      </div>

      {/* Local AI Brain Setup & Status Card */}
      <div className="card-style p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-border-hairline pb-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-serif text-[20px] font-normal text-text-primary">Local AI Brain</h2>
            <p className="font-sans text-[13px] text-text-faint">Configure the local Ollama LLM and embedding engines for offline intelligence.</p>
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

        {/* Connection/Setup Guides if offline */}
        {!ollamaOnline && (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[14px] font-semibold text-amber-900 leading-tight">Ollama is not running</span>
                <p className="font-sans text-[13px] text-amber-800 leading-relaxed">
                  Vera uses <strong>Ollama</strong> as its local brain to keep all activity summaries, semantic memory search, and questions 100% private and offline on your computer.
                </p>
              </div>
            </div>
            
            <div className="h-px bg-amber-500/10 w-full" />
            
            <div className="flex flex-col gap-2 font-sans text-[13px] text-amber-800">
              <span className="font-semibold">How to get started:</span>
              <ol className="list-decimal pl-5 flex flex-col gap-1.5">
                <li>Download Ollama for Mac from <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-amber-950">ollama.com</a>.</li>
                <li>Install and launch the Ollama application.</li>
                <li>Vera will automatically connect once Ollama is running in your menu bar. Click <strong>Refresh</strong> above to verify.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Model Configurations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chat Model Config */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[15px] font-normal text-text-primary">Chat LLM Model</span>
              <span className="font-sans text-[12px] text-text-faint">Small conversational model for answering questions.</span>
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

          {/* Embedding Model Config */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[15px] font-normal text-text-primary">Embedding Model</span>
              <span className="font-sans text-[12px] text-text-faint">Creates vector representations for semantic captures search.</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                onBlur={() => handleSaveEmbeddingModel(embeddingModel)}
                className="flex-1 px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none"
                placeholder="e.g. nomic-embed-text"
              />
              {ollamaOnline && (
                <button
                  onClick={() => handlePullModel(embeddingModel)}
                  disabled={pullingModel !== null || availableModels.includes(embeddingModel) || availableModels.includes(`${embeddingModel}:latest`)}
                  className={`px-3 py-1.5 border rounded-xl font-sans text-[12px] font-medium transition-all ${
                    availableModels.includes(embeddingModel) || availableModels.includes(`${embeddingModel}:latest`)
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 cursor-default"
                      : pullingModel
                        ? "border-border-hairline text-text-faint cursor-default animate-pulse"
                        : "border-text-primary text-text-primary hover:bg-active-hover cursor-pointer"
                  }`}
                >
                  {availableModels.includes(embeddingModel) || availableModels.includes(`${embeddingModel}:latest`) ? "Ready" : "Pull Model"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pull Streaming Progress Bar */}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
        {/* Left Column Controls */}
        <div className="flex flex-col gap-6">
          {/* Master Capture Status Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  Screen Capturing
                </span>
                <span className="font-sans text-[12px] text-text-faint">
                  Pause or resume all background captures
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

          {/* Sensitive-data Redaction Card */}
          <div className="card-style p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  Sensitive Data Redaction
                </span>
                <span className="font-sans text-[12px] text-text-muted leading-normal">
                  Automatically masks credit cards (Luhn-checked), IBANs, and API credentials into <code>[redacted]</code> inside stored captures.
                </span>
              </div>
              <input
                type="checkbox"
                checked={redactionEnabled}
                onChange={handleToggleRedaction}
                className="mt-1 cursor-pointer w-4 h-4 accent-text-primary rounded border-border-hairline"
              />
            </div>
          </div>

          {/* Data Retention Period Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Data Retention
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Configure how long captures are stored on-device
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 border border-border-hairline rounded-xl p-1 bg-card-surface/40">
              {["7", "30", "90", "forever"].map((val) => {
                const label = val === "forever" ? "Forever" : `${val} Days`;
                const active = retentionDays === val;
                return (
                  <button
                    key={val}
                    onClick={() => handleRetentionChange(val)}
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

          {/* Destructive Actions Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Clear Memory
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Wipe some or all local screen history records
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleDeleteToday}
                className="flex-1 py-2.5 rounded-xl border border-border-hairline text-text-muted hover:text-text-primary hover:bg-active-hover font-sans text-[13px] font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                Delete Today
              </button>
              <button
                onClick={handleDeleteAll}
                className="flex-1 py-2.5 rounded-xl border border-red-500/20 text-red-600 hover:text-red-700 hover:bg-red-500/5 font-sans text-[13px] font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} />
                Clear All Memory
              </button>
            </div>
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
                Veras browser domain checks use macOS Automation. You will be prompted to grant permission on matching domains. Denying access will skip captures on the browser for safety.
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
        </div>
      </div>
    </div>
  );
};
export default Settings;

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, X, Shield, ShieldAlert, Trash2, RotateCcw } from "lucide-react";
import { settingsRepo } from "../lib/db";
import { ollamaClient } from "../lib/ollama";
import { consumeSettingsSection } from "../lib/settingsNav";

type AiEngine = "local" | "cloud";
type CloudProvider = "anthropic" | "openai";

const errorToMessage = (err: any): string =>
  typeof err === "string" ? err : err?.message || String(err);

export const Settings: React.FC = () => {
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [excludedApps, setExcludedApps] = useState<string[]>([]);
  const [excludedDomains, setExcludedDomains] = useState<string[]>([]);
  const [redactionEnabled, setRedactionEnabled] = useState<boolean>(true);
  const [retentionDays, setRetentionDays] = useState<string>("30");

  // Profile + macOS permission status
  const [userName, setUserNameState] = useState<string>("");
  const [permAccessibility, setPermAccessibility] = useState<boolean>(false);
  const [permScreenRecording, setPermScreenRecording] = useState<boolean>(false);

  // App lock (auth fully delegated to macOS LocalAuthentication)
  const [appLockEnabled, setAppLockEnabledState] = useState<boolean>(false);
  const [appLockBusy, setAppLockBusy] = useState<boolean>(false);
  const [appLockError, setAppLockError] = useState<string | null>(null);

  // AI Engine state (local by default; cloud is bring-your-own-key)
  const [aiEngine, setAiEngine] = useState<AiEngine>("local");
  const [cloudProvider, setCloudProviderState] = useState<CloudProvider>("anthropic");
  const [cloudModel, setCloudModelState] = useState<string>("claude-sonnet-4-6");
  const [keyInput, setKeyInput] = useState<string>("");
  const [keySaved, setKeySaved] = useState<boolean>(false);
  const [testState, setTestState] = useState<{ status: "idle" | "testing" | "ok" | "error"; message: string }>({
    status: "idle",
    message: "",
  });

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
      const [paused, apps, domains, redaction, retention, dbChat, dbEmbed, engine, provider, name] = await Promise.all([
        settingsRepo.getCapturePaused(),
        settingsRepo.getExcludedApps(),
        settingsRepo.getExcludedDomains(),
        settingsRepo.getRedactionEnabled(),
        settingsRepo.getRetentionDays(),
        settingsRepo.getChatModel(),
        settingsRepo.getEmbeddingModel(),
        settingsRepo.getAiEngine(),
        settingsRepo.getCloudProvider(),
        settingsRepo.getUserName(),
      ]);
      const lockEnabled = await settingsRepo.getAppLockEnabled();
      setAppLockEnabledState(lockEnabled);

      setIsPaused(paused);
      setExcludedApps(apps);
      setExcludedDomains(domains);
      setRedactionEnabled(redaction);
      setRetentionDays(retention);
      setChatModel(dbChat);
      setEmbeddingModel(dbEmbed);
      setAiEngine(engine);
      setCloudProviderState(provider);
      setUserNameState(name);
      setCloudModelState(await settingsRepo.getCloudModel(provider));
      setKeySaved(await invoke<boolean>("has_cloud_api_key", { provider }));

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
    // Re-check when the user returns from System Settings
    const onFocus = () => refreshPermissions();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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

  const handleToggleAppLock = async () => {
    if (appLockBusy) return;
    setAppLockError(null);

    if (appLockEnabled) {
      // Turning OFF restores today's behavior
      setAppLockEnabledState(false);
      try {
        await settingsRepo.setAppLockEnabled(false);
        window.dispatchEvent(new CustomEvent("app-lock-updated"));
      } catch (err) {
        console.error("Failed to disable app lock:", err);
      }
      return;
    }

    // Turning ON: require one successful authentication first
    setAppLockBusy(true);
    try {
      const result = await invoke<{ success: boolean; available: boolean }>(
        "authenticate_app_lock",
        { reason: "Confirm Touch ID to enable App Lock" }
      );
      if (result.success) {
        setAppLockEnabledState(true);
        await settingsRepo.setAppLockEnabled(true);
        window.dispatchEvent(new CustomEvent("app-lock-updated"));
      } else if (!result.available) {
        setAppLockError(
          "Touch ID / password authentication is not available on this Mac, so App Lock cannot be enabled."
        );
      } else {
        setAppLockError("Authentication was cancelled — App Lock stays off.");
      }
    } catch (err) {
      setAppLockError(errorToMessage(err));
    } finally {
      setAppLockBusy(false);
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

  const handleEngineChange = async (engine: AiEngine) => {
    setAiEngine(engine);
    try {
      await settingsRepo.setAiEngine(engine);
      window.dispatchEvent(new CustomEvent("ai-engine-updated"));
    } catch (err) {
      console.error("Failed to save AI engine:", err);
    }
  };

  const handleProviderChange = async (provider: CloudProvider) => {
    setCloudProviderState(provider);
    setKeyInput("");
    setTestState({ status: "idle", message: "" });
    try {
      await settingsRepo.setCloudProvider(provider);
      setCloudModelState(await settingsRepo.getCloudModel(provider));
      setKeySaved(await invoke<boolean>("has_cloud_api_key", { provider }));
      window.dispatchEvent(new CustomEvent("ai-engine-updated"));
    } catch (err) {
      console.error("Failed to switch cloud provider:", err);
    }
  };

  const handleSaveCloudModel = async (val: string) => {
    const cleaned = val.trim();
    if (!cleaned) return;
    try {
      await settingsRepo.setCloudModel(cloudProvider, cleaned);
      window.dispatchEvent(new CustomEvent("ai-engine-updated"));
    } catch (err) {
      console.error("Failed to save cloud model:", err);
    }
  };

  // The key goes straight to Rust and is never echoed back to the UI
  const saveKeyIfEntered = async (): Promise<void> => {
    const entered = keyInput.trim();
    if (!entered) return;
    await invoke("save_cloud_api_key", { provider: cloudProvider, key: entered });
    setKeyInput("");
    setKeySaved(true);
  };

  const handleKeyBlur = async () => {
    try {
      await saveKeyIfEntered();
    } catch (err) {
      setTestState({ status: "error", message: errorToMessage(err) });
    }
  };

  const handleTestConnection = async () => {
    setTestState({ status: "testing", message: "" });
    try {
      await saveKeyIfEntered();
      const message = await invoke<string>("test_cloud_connection", {
        provider: cloudProvider,
        model: cloudModel.trim(),
        key: null,
      });
      setTestState({ status: "ok", message });
      await settingsRepo.setCloudLastStatus("ok");
    } catch (err) {
      setTestState({ status: "error", message: errorToMessage(err) });
      try {
        await settingsRepo.setCloudLastStatus("failed");
      } catch (statusErr) {
        console.error("Failed to persist cloud status:", statusErr);
      }
    } finally {
      window.dispatchEvent(new CustomEvent("ai-engine-updated"));
    }
  };

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

      {/* AI Engine Selection Card */}
      <div id="settings-ai-engine" className="card-style p-6 flex flex-col gap-5 scroll-mt-6">
        <div className="flex flex-col gap-0.5 border-b border-border-hairline pb-4">
          <h2 className="font-serif text-[20px] font-normal text-text-primary">AI Engine</h2>
          <p className="font-sans text-[13px] text-text-faint">
            Choose where answers are generated. Local keeps everything on-device; Cloud uses your own API key and you pay your provider directly.
          </p>
        </div>

        {/* Engine selector */}
        <div className="grid grid-cols-2 gap-2 border border-border-hairline rounded-xl p-1 bg-card-surface/40">
          {(
            [
              { value: "local", label: "Local (private)" },
              { value: "cloud", label: "Cloud (your API key)" },
            ] as { value: AiEngine; label: string }[]
          ).map((opt) => {
            const active = aiEngine === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleEngineChange(opt.value)}
                className={`py-2 rounded-lg font-sans text-[12px] transition-all cursor-pointer ${
                  active
                    ? "bg-active-hover text-text-primary font-medium soft-shadow"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {aiEngine === "cloud" && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Provider selection */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="font-serif text-[15px] font-normal text-text-primary">Provider</span>
                  <span className="font-sans text-[12px] text-text-faint">Which API your key belongs to.</span>
                </div>
                <select
                  value={cloudProvider}
                  onChange={(e) => handleProviderChange(e.target.value as CloudProvider)}
                  className="px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none cursor-pointer"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              {/* Model id */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="font-serif text-[15px] font-normal text-text-primary">Model</span>
                  <span className="font-sans text-[12px] text-text-faint">Any model id your key supports.</span>
                </div>
                <input
                  type="text"
                  value={cloudModel}
                  onChange={(e) => setCloudModelState(e.target.value)}
                  onBlur={() => handleSaveCloudModel(cloudModel)}
                  className="px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none"
                  placeholder={cloudProvider === "openai" ? "e.g. gpt-4o" : "e.g. claude-sonnet-4-6"}
                />
              </div>
            </div>

            {/* API key + connection test */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="font-serif text-[15px] font-normal text-text-primary">API Key</span>
                {keySaved && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 rounded-full font-sans text-[11px] font-medium text-emerald-600 uppercase">
                    Key saved
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onBlur={handleKeyBlur}
                  autoComplete="off"
                  className="flex-1 px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
                  placeholder={
                    keySaved
                      ? "••••••••••••  (saved — paste a new key to replace it)"
                      : cloudProvider === "openai"
                        ? "sk-..."
                        : "sk-ant-..."
                  }
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testState.status === "testing"}
                  className={`px-3 py-1.5 border rounded-xl font-sans text-[12px] font-medium transition-all ${
                    testState.status === "testing"
                      ? "border-border-hairline text-text-faint cursor-default animate-pulse"
                      : "border-text-primary text-text-primary hover:bg-active-hover cursor-pointer"
                  }`}
                >
                  {testState.status === "testing" ? "Testing..." : "Test connection"}
                </button>
              </div>

              {testState.status === "ok" && (
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl font-sans text-[12px] text-emerald-600 leading-normal">
                  {testState.message || "Connected"}
                </div>
              )}
              {testState.status === "error" && (
                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl font-sans text-[12px] text-red-600 leading-normal">
                  {testState.message}
                </div>
              )}

              <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                Your key is stored locally and only sent to {cloudProvider === "openai" ? "OpenAI" : "Anthropic"}. Embeddings and search always run on-device; in cloud mode only your question plus the retrieved snippets are sent.
              </p>
            </div>
          </div>
        )}
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

      <div id="settings-privacy" className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 scroll-mt-6">
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
          <div id="settings-clear-data" className="card-style p-5 flex flex-col gap-4 scroll-mt-6">
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

          {/* Profile Card */}
          <div className="card-style p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[17px] font-normal text-text-primary">
                Profile
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Your name, shown in the sidebar and your chats
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

          {/* App Lock / Security Card */}
          <div id="settings-app-lock" className="card-style p-5 flex flex-col gap-3 scroll-mt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-serif text-[17px] font-normal text-text-primary">
                  App Lock
                </span>
                <span className="font-sans text-[12px] text-text-muted leading-normal">
                  Require Touch ID (or your Mac password) to unlock Vera — on launch, after your Mac was locked, and when the window was hidden. Authentication is handled entirely by macOS; Vera never stores a password. This gates the app window — it does not additionally encrypt the data on disk.
                </span>
              </div>
              <input
                type="checkbox"
                checked={appLockEnabled}
                onChange={handleToggleAppLock}
                disabled={appLockBusy}
                className="mt-1 cursor-pointer w-4 h-4 accent-text-primary rounded border-border-hairline"
              />
            </div>
            {appLockBusy && (
              <span className="font-sans text-[12px] text-text-faint animate-pulse">
                Waiting for Touch ID…
              </span>
            )}
            {appLockError && (
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl font-sans text-[12px] text-amber-700 leading-normal">
                {appLockError}
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
                  hint: "Screen memory captures",
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

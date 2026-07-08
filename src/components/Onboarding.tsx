import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Lock,
  Eye,
  MousePointerClick,
  Globe,
  Cpu,
  Briefcase,
  Sparkles,
  Check,
  Download,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { settingsRepo, clientsRepo, projectsRepo } from "../lib/db";
import { ollamaClient, PullProgress } from "../lib/ollama";
import { parseEuroToCents } from "../lib/format";
import { enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";

interface OnboardingProps {
  onComplete: () => void;
}

type PermissionState = "granted" | "missing" | "unknown";

// The model Vera recommends out of the box — small enough for an 8 GB Mac,
// good enough for classification and narratives.
const RECOMMENDED_MODEL = "llama3.2:3b";
const TOTAL_STEPS = 5;

const StatusChip: React.FC<{ granted: boolean; label?: string }> = ({ granted, label }) => (
  <span
    className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-full font-sans text-[11px] font-medium uppercase shrink-0 ${
      granted
        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
        : "border-amber-500/20 bg-amber-500/5 text-amber-600"
    }`}
  >
    <span className={`w-1.5 h-1.5 rounded-full ${granted ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
    {label || (granted ? "Granted" : "Not granted")}
  </span>
);

// First-run flow, sales-grade (Schicht 6): 1) what Vera is, 2) permissions,
// 3) local model setup, 4) first client/project, 5) the promise. Time-to-wow
// under 24 h — tomorrow morning Vera shows the first full day.
export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [accessibility, setAccessibility] = useState<PermissionState>("unknown");
  const [screenRecording, setScreenRecording] = useState<PermissionState>("unknown");
  const [nameInput, setNameInput] = useState("");
  const [startAtLogin, setStartAtLogin] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3 — model
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // Step 4 — first client/project
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [savedFirst, setSavedFirst] = useState(false);
  const [savingFirst, setSavingFirst] = useState(false);
  const [firstError, setFirstError] = useState<string | null>(null);

  const refreshPermissions = async () => {
    try {
      const [ax, sr] = await Promise.all([
        invoke<boolean>("has_accessibility_permission"),
        invoke<boolean>("has_screen_recording_permission"),
      ]);
      setAccessibility(ax ? "granted" : "missing");
      setScreenRecording(sr ? "granted" : "missing");
    } catch (err) {
      console.error("Failed to check permissions:", err);
    }
  };

  useEffect(() => {
    if (step === 2) {
      refreshPermissions();
      pollRef.current = setInterval(refreshPermissions, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [step]);

  const checkOllama = async () => {
    try {
      const online = await ollamaClient.isRunning();
      setOllamaOnline(online);
      setModels(online ? await ollamaClient.listModels() : []);
    } catch {
      setOllamaOnline(false);
      setModels([]);
    }
  };

  useEffect(() => {
    if (step === 3) {
      checkOllama();
    }
  }, [step]);

  const hasRecommended = models.some((m) => m === RECOMMENDED_MODEL || m === `${RECOMMENDED_MODEL}:latest`);

  const pullModel = async () => {
    setPulling(true);
    setModelError(null);
    setPullProgress(null);
    try {
      await ollamaClient.pullModel(RECOMMENDED_MODEL, setPullProgress);
      await settingsRepo.setChatModel(RECOMMENDED_MODEL);
      await checkOllama();
    } catch (err: any) {
      setModelError(err?.message || "Model download failed. Is Ollama running?");
    } finally {
      setPulling(false);
      setPullProgress(null);
    }
  };

  const grantAccessibility = async () => {
    try {
      await invoke("request_accessibility_permission");
      await invoke("open_privacy_settings", { pane: "accessibility" });
    } catch (err) {
      console.error("Failed to open accessibility settings:", err);
    }
  };

  const grantScreenRecording = async () => {
    try {
      await invoke("request_screen_recording_permission");
      await invoke("open_privacy_settings", { pane: "screen_recording" });
    } catch (err) {
      console.error("Failed to open screen recording settings:", err);
    }
  };

  const openAutomation = async () => {
    try {
      await invoke("open_privacy_settings", { pane: "automation" });
    } catch (err) {
      console.error("Failed to open automation settings:", err);
    }
  };

  const saveFirstProject = async (demo: boolean) => {
    setSavingFirst(true);
    setFirstError(null);
    try {
      if (demo) {
        const clientId = await clientsRepo.add("Acme Studio", null, 12000);
        await projectsRepo.add(clientId, "Website Relaunch", true, null);
        const legalId = await clientsRepo.add("Northwind Legal", null, 24000);
        await projectsRepo.add(legalId, "Contract Review", true, null);
      } else {
        const cn = clientName.trim();
        const pn = projectName.trim();
        if (!cn || !pn) {
          setFirstError("Enter a client and a project name — or use the demo data.");
          return;
        }
        // parseEuroToCents rejects negatives and junk (shared with ClientsProjects).
        const rateCents = parseEuroToCents(rateInput);
        if (rateInput.trim() && rateCents === null) {
          setFirstError("That hourly rate isn't a valid amount.");
          return;
        }
        const clientId = await clientsRepo.add(cn, null, rateCents);
        await projectsRepo.add(clientId, pn, true, null);
      }
      setSavedFirst(true);
    } catch (err: any) {
      setFirstError(err?.message || "Could not save. Try again.");
    } finally {
      setSavingFirst(false);
    }
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const name = nameInput.trim();
      if (name) {
        await settingsRepo.setUserName(name);
        window.dispatchEvent(new CustomEvent("profile-updated"));
      }
      if (startAtLogin) {
        try {
          await enableAutostart();
          await settingsRepo.setAutostartEnabled(await isAutostartEnabled());
        } catch (err) {
          console.error("Failed to enable start-at-login:", err);
        }
      }
      await settingsRepo.setOnboardingComplete(true);
    } catch (err) {
      console.error("Failed to save onboarding state:", err);
    } finally {
      onComplete();
    }
  };

  const allPermissionsGranted = accessibility === "granted" && screenRecording === "granted";

  return (
    <div className="fixed inset-0 bg-bg-warm flex flex-col items-center justify-center font-sans text-text-primary z-50 overflow-y-auto py-10">
      <div className="w-full max-w-[640px] flex flex-col gap-6 px-8">
        {/* Step 1 — Welcome / positioning */}
        {step === 1 && (
          <div className="flex flex-col items-center gap-6 select-none">
            <h1 className="font-serif text-[64px] font-normal text-text-primary tracking-tight text-center">
              Vera
            </h1>
            <p className="font-serif text-[22px] text-text-muted italic text-center leading-relaxed -mt-2">
              Automatic time tracking that wins back your billable hours.
            </p>
            <div className="card-style p-6 w-full flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <Eye size={18} strokeWidth={1.5} className="text-text-muted shrink-0 mt-0.5" />
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                  Vera quietly captures your workday and turns it into billable work
                  blocks — assigned to clients, with ready-to-bill narratives.
                </p>
              </div>
              <div className="h-px bg-border-hairline w-full" />
              <div className="flex items-start gap-3">
                <Lock size={18} strokeWidth={1.5} className="text-text-muted shrink-0 mt-0.5" />
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                  Everything runs on your Mac — capture, the local database, and the
                  AI itself; screen recordings are encrypted at rest. There is no
                  cloud AI: your workday never leaves your device on its own.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Permissions */}
        {step === 2 && (
          <div className="flex flex-col gap-5 select-none">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-[32px] font-normal tracking-tight">Permissions</h2>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                Vera needs two macOS permissions to reconstruct your workday. Grant
                them in System Settings — the status updates live. macOS re-confirms
                the screen permission about once a month; that's normal, and Vera
                will remind you. You can skip and grant them later in Settings.
              </p>
            </div>

            <div className="card-style p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <MousePointerClick size={18} strokeWidth={1.5} className="text-text-muted shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-sans text-[14px] font-medium">Accessibility</span>
                  <span className="font-sans text-[12px] text-text-faint">
                    Lets Vera see the active app and window title for activity tracking.
                  </span>
                </div>
                <StatusChip granted={accessibility === "granted"} />
                {accessibility !== "granted" && (
                  <button
                    onClick={grantAccessibility}
                    className="px-3 py-1.5 border border-text-primary rounded-xl font-sans text-[12px] font-medium text-text-primary hover:bg-active-hover transition-all cursor-pointer shrink-0"
                  >
                    Grant
                  </button>
                )}
              </div>

              <div className="h-px bg-border-hairline w-full" />

              <div className="flex items-center gap-3">
                <Eye size={18} strokeWidth={1.5} className="text-text-muted shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-sans text-[14px] font-medium">Screen Recording</span>
                  <span className="font-sans text-[12px] text-text-faint">
                    Lets Vera read what you work on, so time blocks can be assigned to the right client.
                  </span>
                </div>
                <StatusChip granted={screenRecording === "granted"} />
                {screenRecording !== "granted" && (
                  <button
                    onClick={grantScreenRecording}
                    className="px-3 py-1.5 border border-text-primary rounded-xl font-sans text-[12px] font-medium text-text-primary hover:bg-active-hover transition-all cursor-pointer shrink-0"
                  >
                    Grant
                  </button>
                )}
              </div>

              <div className="h-px bg-border-hairline w-full" />

              <div className="flex items-center gap-3">
                <Globe size={18} strokeWidth={1.5} className="text-text-muted shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-sans text-[14px] font-medium">
                    Automation <span className="font-normal text-text-faint">(optional)</span>
                  </span>
                  <span className="font-sans text-[12px] text-text-faint">
                    Used to read the browser URL so excluded domains are never captured. macOS asks the first time it is needed.
                  </span>
                </div>
                <button
                  onClick={openAutomation}
                  className="px-3 py-1.5 border border-border-hairline rounded-xl font-sans text-[12px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer shrink-0"
                >
                  Open pane
                </button>
              </div>
            </div>

            {!allPermissionsGranted && (
              <p className="font-sans text-[12px] text-text-faint leading-relaxed">
                Without Accessibility, activity tracking stays empty; without Screen
                Recording, Vera cannot understand what you worked on. Everything else
                keeps working, and you can grant both later in Settings.
              </p>
            )}
          </div>
        )}

        {/* Step 3 — Local model */}
        {step === 3 && (
          <div className="flex flex-col gap-5 select-none">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-[32px] font-normal tracking-tight">Your local AI</h2>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                Vera classifies work and writes narratives with a model that runs
                entirely on your Mac through Ollama. Nothing is sent anywhere.
              </p>
            </div>

            <div className="card-style p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Cpu size={18} strokeWidth={1.5} className="text-text-muted shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-sans text-[14px] font-medium">Ollama</span>
                  <span className="font-sans text-[12px] text-text-faint">
                    {ollamaOnline === null
                      ? "Checking…"
                      : ollamaOnline
                        ? "Running on this Mac."
                        : "Not detected. Install it from ollama.com, then reopen this step."}
                  </span>
                </div>
                <StatusChip granted={!!ollamaOnline} label={ollamaOnline ? "Running" : "Offline"} />
              </div>

              <div className="h-px bg-border-hairline w-full" />

              <div className="flex items-center gap-3">
                <Sparkles size={18} strokeWidth={1.5} className="text-text-muted shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-sans text-[14px] font-medium">
                    Recommended model · {RECOMMENDED_MODEL}
                  </span>
                  <span className="font-sans text-[12px] text-text-faint">
                    About 2 GB. Runs comfortably on Apple Silicon with 8 GB of memory or more.
                  </span>
                </div>
                {hasRecommended ? (
                  <StatusChip granted label="Ready" />
                ) : (
                  <button
                    onClick={pullModel}
                    disabled={!ollamaOnline || pulling}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-text-primary rounded-xl font-sans text-[12px] font-medium text-text-primary hover:bg-active-hover transition-all cursor-pointer shrink-0 disabled:opacity-40"
                  >
                    <Download size={13} strokeWidth={1.5} />
                    {pulling ? "Downloading…" : "Download"}
                  </button>
                )}
              </div>

              {pulling && pullProgress && (
                <div className="flex flex-col gap-1.5">
                  <div className="w-full bg-active-hover h-2 rounded-full overflow-hidden border border-border-hairline">
                    <div
                      className="bg-text-primary h-full transition-all duration-300"
                      style={{ width: `${pullProgress.percent}%` }}
                    />
                  </div>
                  <span className="font-sans text-[11px] text-text-faint italic">{pullProgress.status}</span>
                </div>
              )}
              {modelError && <span className="font-sans text-[12px] text-red-600">{modelError}</span>}
            </div>

            <p className="font-sans text-[12px] text-text-faint leading-relaxed">
              No model yet? You can still use Vera — it falls back to plain,
              evidence-based narratives until a model is ready, and you can set
              this up later in Settings.
            </p>
          </div>
        )}

        {/* Step 4 — First client / project */}
        {step === 4 && (
          <div className="flex flex-col gap-5 select-none">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-[32px] font-normal tracking-tight">Your first client</h2>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                Add one client and project so Vera has somewhere to assign your
                work. You can add more anytime in Clients &amp; Projects.
              </p>
            </div>

            {savedFirst ? (
              <div className="card-style px-6 py-8 flex flex-col items-center text-center gap-3">
                <span className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                  <Check size={20} strokeWidth={2} />
                </span>
                <span className="font-sans text-[14px] text-text-muted">
                  Added. Vera will start suggesting this client for matching work.
                </span>
              </div>
            ) : (
              <div className="card-style p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Briefcase size={16} strokeWidth={1.5} className="text-text-muted shrink-0" />
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client name"
                    className="flex-1 px-3 py-2 bg-bg-warm border border-border-hairline rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-text-muted"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project (e.g. Website Relaunch)"
                    className="flex-1 px-3 py-2 bg-bg-warm border border-border-hairline rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-text-muted"
                  />
                  <input
                    type="text"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    placeholder="€/h (optional)"
                    className="w-32 px-3 py-2 bg-bg-warm border border-border-hairline rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-text-muted"
                  />
                </div>
                {firstError && <span className="font-sans text-[12px] text-red-600">{firstError}</span>}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveFirstProject(false)}
                    disabled={savingFirst}
                    className="px-4 py-2 rounded-lg bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
                  >
                    Add client
                  </button>
                  <button
                    onClick={() => saveFirstProject(true)}
                    disabled={savingFirst}
                    className="px-4 py-2 rounded-lg border border-border-hairline font-sans text-[13px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer disabled:opacity-50"
                  >
                    Use demo data instead
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5 — Promise + name */}
        {step === 5 && (
          <div className="flex flex-col gap-5 select-none">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-[32px] font-normal tracking-tight">You're set.</h2>
              <p className="font-sans text-[15px] text-text-muted leading-relaxed">
                Vera is now watching your workday quietly in the background.
                Tomorrow morning it will show you your first full day — already
                split into blocks, assigned to clients, ready to close in minutes.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                finish();
              }}
            >
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="What should Vera call you?"
                autoFocus
                className="w-full px-5 py-4 bg-card-surface border border-border-hairline rounded-[16px] font-serif text-[22px] text-text-primary outline-none placeholder:text-text-muted placeholder:italic focus:border-text-muted/80 transition-all"
              />
            </form>

            <label className="card-style p-4 flex items-start justify-between gap-4 cursor-pointer">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[14px] font-medium text-text-primary">
                  Start Vera automatically at login <span className="text-text-faint font-normal">(recommended)</span>
                </span>
                <span className="font-sans text-[12px] text-text-muted leading-normal">
                  Vera runs quietly in the menu bar, so no billable minute goes untracked. You can change this later in Settings.
                </span>
              </div>
              <input
                type="checkbox"
                checked={startAtLogin}
                onChange={(e) => setStartAtLogin(e.target.checked)}
                className="mt-1 cursor-pointer w-4 h-4 accent-text-primary rounded border-border-hairline shrink-0"
              />
            </label>

            <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-faint">
              <Lock size={12} strokeWidth={1.5} />
              14-day free trial · no account, no credit card · your capture never leaves your device
            </span>
          </div>
        )}

        {/* Footer: progress dots + navigation */}
        <div className="flex items-center justify-between mt-2 select-none">
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
              <span
                key={s}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  s === step ? "bg-text-primary scale-125" : "bg-border-hairline"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-hairline font-sans text-[13px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
              >
                <ArrowLeft size={14} strokeWidth={1.5} />
                Back
              </button>
            )}
            {step === 2 && !allPermissionsGranted && (
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2.5 rounded-xl font-sans text-[13px] font-medium text-text-faint hover:text-text-muted transition-all cursor-pointer"
              >
                Skip for now
              </button>
            )}
            {step === 4 && !savedFirst && (
              <button
                onClick={() => setStep(5)}
                className="px-4 py-2.5 rounded-xl font-sans text-[13px] font-medium text-text-faint hover:text-text-muted transition-all cursor-pointer"
              >
                Skip for now
              </button>
            )}
            {step < TOTAL_STEPS ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer"
              >
                {step === 2 && !allPermissionsGranted ? "Continue anyway" : "Continue"}
                <ArrowRight size={14} strokeWidth={1.5} />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={finishing}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2} />
                Start using Vera
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

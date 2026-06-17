import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Lock,
  Eye,
  MousePointerClick,
  Globe,
  Check,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Cpu,
  Cloud,
} from "lucide-react";
import { settingsRepo } from "../lib/db";
import { enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { ollamaClient } from "../lib/ollama";

interface OnboardingProps {
  onComplete: () => void;
}

type PermissionState = "granted" | "missing" | "unknown";

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

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [accessibility, setAccessibility] = useState<PermissionState>("unknown");
  const [screenRecording, setScreenRecording] = useState<PermissionState>("unknown");
  const [ollamaOnline, setOllamaOnline] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState("");
  const [startAtLogin, setStartAtLogin] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Live permission status while the permissions step is visible
  useEffect(() => {
    if (step === 2) {
      refreshPermissions();
      pollRef.current = setInterval(refreshPermissions, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      ollamaClient.isRunning().then(setOllamaOnline).catch(() => setOllamaOnline(false));
    }
  }, [step]);

  const grantAccessibility = async () => {
    try {
      // Shows the system prompt (adds Vera to the list) and opens the pane
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
        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="flex flex-col items-center gap-6 select-none">
            <h1 className="font-serif text-[64px] font-normal text-text-primary tracking-tight text-center">
              Vera
            </h1>
            <p className="font-serif text-[22px] text-text-muted italic text-center leading-relaxed -mt-2">
              Your private, local AI assistant that remembers your day.
            </p>
            <div className="card-style p-6 w-full flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <Eye size={18} strokeWidth={1.5} className="text-text-muted shrink-0 mt-0.5" />
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                  Vera quietly tracks which apps you use and reads what is on your screen, so you can ask things like <span className="italic">"what did I work on this morning?"</span>
                </p>
              </div>
              <div className="h-px bg-border-hairline w-full" />
              <div className="flex items-start gap-3">
                <Lock size={18} strokeWidth={1.5} className="text-text-muted shrink-0 mt-0.5" />
                <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                  Everything stays on your Mac — your activity, screen memory, and the AI itself run locally. A cloud engine is optional and uses your own API key.
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
                Vera needs two macOS permissions to remember your day. Grant them in System Settings — the status updates live. You can skip and grant them later in Settings.
              </p>
            </div>

            <div className="card-style p-5 flex flex-col gap-4">
              {/* Accessibility */}
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

              {/* Screen Recording */}
              <div className="flex items-center gap-3">
                <Eye size={18} strokeWidth={1.5} className="text-text-muted shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-sans text-[14px] font-medium">Screen Recording</span>
                  <span className="font-sans text-[12px] text-text-faint">
                    Lets Vera read text on your screen to build your private memory.
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

              {/* Automation (optional) */}
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
                Without Accessibility, activity tracking stays empty; without Screen Recording, Vera cannot build screen memory. Everything else keeps working, and you can grant both later in Settings.
              </p>
            )}
          </div>
        )}

        {/* Step 3 — Engine */}
        {step === 3 && (
          <div className="flex flex-col gap-5 select-none">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-[32px] font-normal tracking-tight">Choose your engine</h2>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                Vera answers questions with a local model by default. You can switch anytime in Settings → AI Engine.
              </p>
            </div>

            <div className="card-style p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <Cpu size={18} strokeWidth={1.5} className="text-text-muted shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-[14px] font-medium">Local (default)</span>
                    <StatusChip
                      granted={ollamaOnline}
                      label={ollamaOnline ? "Ollama detected" : "Ollama not found"}
                    />
                  </div>
                  <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                    Private and free — runs on your Mac via Ollama.{" "}
                    {!ollamaOnline && (
                      <>
                        Install it from{" "}
                        <a
                          href="https://ollama.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium text-text-primary inline-flex items-center gap-0.5"
                        >
                          ollama.com <ExternalLink size={11} />
                        </a>{" "}
                        and pull the default models in Settings.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="h-px bg-border-hairline w-full" />

              <div className="flex items-start gap-3">
                <Cloud size={18} strokeWidth={1.5} className="text-text-muted shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1 flex-1">
                  <span className="font-sans text-[14px] font-medium">Cloud (optional)</span>
                  <p className="font-sans text-[12px] text-text-muted leading-relaxed">
                    Bring your own Anthropic or OpenAI API key for stronger answers. Your screen memory and search always stay on-device — only your question plus retrieved snippets are sent.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4 — Name */}
        {step === 4 && (
          <div className="flex flex-col gap-5 select-none">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-serif text-[32px] font-normal tracking-tight">What should Vera call you?</h2>
              <p className="font-sans text-[14px] text-text-muted leading-relaxed">
                Shown in the sidebar and used by your agents. You can change it anytime in Settings.
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
                placeholder="Your name"
                autoFocus
                className="w-full px-5 py-4 bg-card-surface border border-border-hairline rounded-[16px] font-serif text-[22px] text-text-primary outline-none placeholder:text-text-muted placeholder:italic focus:border-text-muted/80 transition-all"
              />
            </form>

            {/* Optional: start at login */}
            <label className="card-style p-4 flex items-start justify-between gap-4 cursor-pointer">
              <div className="flex flex-col gap-1">
                <span className="font-sans text-[14px] font-medium text-text-primary">
                  Start Vera automatically at login <span className="text-text-faint font-normal">(recommended)</span>
                </span>
                <span className="font-sans text-[12px] text-text-muted leading-normal">
                  Vera runs quietly in the menu bar so it's always remembering your day. You can change this later in Settings.
                </span>
              </div>
              <input
                type="checkbox"
                checked={startAtLogin}
                onChange={(e) => setStartAtLogin(e.target.checked)}
                className="mt-1 cursor-pointer w-4 h-4 accent-text-primary rounded border-border-hairline shrink-0"
              />
            </label>
          </div>
        )}

        {/* Footer: progress dots + navigation */}
        <div className="flex items-center justify-between mt-2 select-none">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
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
            {step < 4 ? (
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

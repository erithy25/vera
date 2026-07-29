import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { Gauge, Shield, Info } from "lucide-react";
import { settingsRepo, SCAN_FPS_CHOICES } from "../lib/db";
import { detectorCount } from "../lib/scan";
import { consumeSettingsSection, type SettingsSection } from "../lib/settingsNav";

const errorToMessage = (err: any): string =>
  typeof err === "string" ? err : err?.message || String(err);

/**
 * What each sampling rate costs and buys, stated plainly. The old settings page
 * had sliders whose effect was never explained; a number here changes whether a
 * secret is found at all, so it gets a sentence.
 */
const FPS_NOTE: Record<number, string> = {
  0.5: "One frame every two seconds. Fastest, and the most likely to miss something brief.",
  1: "One frame per second. The right default for a screen recording.",
  2: "Two frames per second. Worth it when things move quickly on screen.",
  4: "Four frames per second. Thorough and slow — for a final check before publishing.",
};

const Section: React.FC<{
  id: SettingsSection;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ id, icon, title, children }) => (
  <section id={id} className="card-style p-6 flex flex-col gap-5 scroll-mt-6">
    <div className="flex items-center gap-2.5">
      <span className="text-text-muted">{icon}</span>
      <h2 className="font-serif text-[19px] text-text-primary">{title}</h2>
    </div>
    {children}
  </section>
);

export const Settings: React.FC = () => {
  const [fps, setFps] = useState<number>(1);
  const [autostart, setAutostart] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("");
  const [detectors, setDetectors] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    settingsRepo.getScanFps().then(setFps).catch(() => setFps(1));
    getVersion().then(setVersion).catch(() => setVersion(""));
    detectorCount().then(setDetectors).catch(() => setDetectors(null));
    isAutostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false));
  }, []);

  // Scroll to the section the profile menu asked for.
  useEffect(() => {
    const jump = () => {
      const target = consumeSettingsSection();
      if (!target) return;
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    jump();
    window.addEventListener("vera-settings-section", jump);
    return () => window.removeEventListener("vera-settings-section", jump);
  }, []);

  const changeFps = async (next: number) => {
    setFps(next);
    try {
      await settingsRepo.setScanFps(next);
    } catch (err) {
      setError(errorToMessage(err));
    }
  };

  const toggleAutostart = async () => {
    const next = !autostart;
    setAutostart(next);
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    } catch (err) {
      setAutostart(!next);
      setError(errorToMessage(err));
    }
  };

  return (
    <div className="w-full max-w-[860px] flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="font-serif text-[32px] text-text-primary leading-tight">Settings</h1>
        <p className="font-sans text-[14px] text-text-muted">
          There is not much here, and that is deliberate.
        </p>
      </header>

      {error && (
        <p className="card-style px-5 py-4 font-sans text-[13px] text-amber-700">{error}</p>
      )}

      <Section id="scanning" icon={<Gauge size={17} strokeWidth={1.5} />} title="Scanning">
        <div className="flex flex-col gap-3">
          <span className="font-sans text-[13px] font-medium text-text-primary">
            How often to sample the recording
          </span>
          <div className="flex flex-wrap gap-2">
            {SCAN_FPS_CHOICES.map((choice) => (
              <button
                key={choice}
                onClick={() => changeFps(choice)}
                className={`px-4 py-2 rounded-xl border font-sans text-[13px] transition-all active:scale-95 cursor-pointer ${
                  fps === choice
                    ? "bg-text-primary text-bg-warm border-text-primary font-medium"
                    : "border-border-hairline text-text-muted hover:bg-active-hover hover:text-text-primary"
                }`}
              >
                {choice} fps
              </button>
            ))}
          </div>
          <p className="font-sans text-[12px] text-text-muted leading-relaxed">
            {FPS_NOTE[fps] ?? `${fps} frames per second.`}
          </p>
          <p className="font-sans text-[12px] text-text-faint leading-relaxed border-t border-border-hairline pt-3">
            Frames that look identical to the one before them are not read twice, so
            raising this costs less time than the number suggests. It does not change
            what Vera can recognise — only how often it looks.
          </p>
        </div>
      </Section>

      <Section id="privacy" icon={<Shield size={17} strokeWidth={1.5} />} title="Privacy">
        <div className="flex flex-col gap-4">
          <p className="font-sans text-[13px] text-text-muted leading-relaxed">
            A tool that searches your recordings for credentials is the last piece of
            software that should be keeping copies of them. So it does not.
          </p>

          <div className="flex flex-col gap-2.5">
            <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
              What Vera stores
            </span>
            <ul className="flex flex-col gap-1.5">
              <li className="font-sans text-[13px] text-text-primary">
                Your sampling rate and your name, in a local SQLite file.
              </li>
              <li className="font-sans text-[13px] text-text-primary">That is the whole list.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
              What it never stores
            </span>
            <ul className="flex flex-col gap-1.5 font-sans text-[13px] text-text-muted">
              <li>The recording, or any copy of it.</li>
              <li>The frames it reads — they live in memory and are released.</li>
              <li>The text it reads out of them.</li>
              <li>
                The secrets it finds. A finding holds the type, the timestamp and a
                masked preview; the value itself is discarded before the result reaches
                this window.
              </li>
            </ul>
          </div>

          <p className="font-sans text-[12px] text-text-faint leading-relaxed border-t border-border-hairline pt-3">
            Vera makes no network requests while scanning. The only connection it ever
            opens is the update check below, and that sends nothing but a version
            number.
          </p>
        </div>
      </Section>

      <Section id="about" icon={<Info size={17} strokeWidth={1.5} />} title="About">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                Version
              </span>
              <span className="font-sans text-[13px] text-text-primary">
                {version || "—"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                Detectors
              </span>
              <span className="font-sans text-[13px] text-text-primary">
                {detectors === null ? "—" : `${detectors} provider keys`}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
                Platform
              </span>
              <span className="font-sans text-[13px] text-text-primary">macOS</span>
            </div>
          </div>

          <label className="flex items-center justify-between gap-6 border-t border-border-hairline pt-4 cursor-pointer">
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                Open Vera at login
              </span>
              <span className="font-sans text-[12px] text-text-muted">
                Off by default. Vera does nothing until you give it a file.
              </span>
            </div>
            <button
              onClick={toggleAutostart}
              role="switch"
              aria-checked={autostart}
              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 cursor-pointer ${
                autostart ? "bg-text-primary" : "bg-active-hover border border-border-hairline"
              }`}
            >
              <span
                className={`absolute top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-full bg-card-surface shadow-sm transition-all duration-200 ${
                  autostart ? "left-[24px]" : "left-[3px]"
                }`}
                style={{ width: 18, height: 18 }}
              />
            </button>
          </label>

          <p className="font-sans text-[12px] text-text-faint leading-relaxed border-t border-border-hairline pt-4">
            A clean result is not a guarantee. Vera recognises the credential formats it
            knows about and samples the recording rather than decoding every frame. It
            is a good last check before you publish, not a substitute for keeping
            secrets off the screen while you record.
          </p>
        </div>
      </Section>
    </div>
  );
};

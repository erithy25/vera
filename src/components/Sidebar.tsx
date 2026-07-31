import React, { useState, useEffect } from "react";
import {
  ScanLine,
  Clapperboard,
  KeyRound,
  Settings,
  ShieldCheck,
  ShieldAlert,
  ChevronsUpDown,
} from "lucide-react";
import { navItems } from "../lib/config";
import { useUserProfile } from "../lib/useUserProfile";
import { ProfileMenu } from "./ProfileMenu";
import { requestSettingsSection, SettingsSection } from "../lib/settingsNav";
import {
  actionableCount,
  formatTimestamp,
  SEVERITY_STYLE,
  worstSeverity,
  type ScanResult,
} from "../lib/scan";

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const { name: userName, initials: userInitials } = useUserProfile();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "ScanLine":
        return <ScanLine size={18} strokeWidth={1.5} />;
      case "Clapperboard":
        return <Clapperboard size={18} strokeWidth={1.5} />;
      case "KeyRound":
        return <KeyRound size={18} strokeWidth={1.5} />;
      case "Settings":
        return <Settings size={18} strokeWidth={1.5} />;
      default:
        return <ScanLine size={18} strokeWidth={1.5} />;
    }
  };

  // The scan screen announces its result; this panel is the only place it is
  // remembered, and only until the window closes. Nothing is written to disk.
  useEffect(() => {
    const onComplete = (e: Event) => {
      const detail = (e as CustomEvent<ScanResult>).detail;
      if (detail) setLastScan(detail);
    };
    window.addEventListener("vera-scan-complete", onComplete);
    return () => window.removeEventListener("vera-scan-complete", onComplete);
  }, []);

  const handleNavigateSettings = (section: SettingsSection) => {
    setProfileMenuOpen(false);
    setCurrentView("Settings");
    requestSettingsSection(section);
  };

  const actionable = lastScan ? actionableCount(lastScan.incidents) : 0;
  const worst = lastScan ? worstSeverity(lastScan.incidents) : null;

  return (
    <>
      <aside className="w-[260px] h-screen bg-card-surface border-r border-border-hairline flex flex-col justify-between p-5 select-none shrink-0 sticky top-0">
        <div className="flex flex-col gap-6 overflow-y-auto pr-1">
          {/* Brand */}
          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center gap-2">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-primary shrink-0"
              >
                <path d="M4 4l8 16 8-16" />
                <path d="M8 4l4 8 4-8" />
              </svg>
              <span className="font-serif text-[20px] font-normal text-text-primary tracking-tight leading-none">
                Vera
              </span>
            </div>
            <span className="font-sans text-[11px] font-medium text-text-faint tracking-wider uppercase pl-6">
              Recording Scanner
            </span>
          </div>

          {/* Navigation list */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => setCurrentView(item.label)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-sans text-[14px] font-normal transition-all duration-150 cursor-pointer text-left active:scale-[0.98] active:bg-active-hover/80 ${
                  currentView === item.label
                    ? "bg-active-hover text-text-primary font-medium"
                    : "text-text-muted hover:bg-active-hover hover:text-text-primary"
                }`}
              >
                {getIcon(item.icon)}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Last scan */}
          <div className="flex flex-col gap-2.5 mt-2">
            <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase px-1">
              Last Scan
            </span>
            {lastScan ? (
              <button
                onClick={() => setCurrentView("Scan")}
                className="card-style p-4 flex flex-col gap-2 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {actionable === 0 ? (
                    <ShieldCheck size={15} strokeWidth={1.5} className="text-emerald-600 shrink-0" />
                  ) : (
                    <ShieldAlert
                      size={15}
                      strokeWidth={1.5}
                      className={`shrink-0 ${worst ? SEVERITY_STYLE[worst].text : "text-red-700"}`}
                    />
                  )}
                  <span className="font-sans text-[13px] font-medium text-text-primary">
                    {actionable === 0 ? "Clean" : `${actionable} to fix`}
                  </span>
                </div>
                <span className="font-sans text-[12px] text-text-muted truncate">
                  {lastScan.file_name}
                </span>
                <span className="font-sans text-[11px] text-text-faint">
                  {formatTimestamp(lastScan.duration_ms)} · {lastScan.frames_ocred} frames read
                </span>
              </button>
            ) : (
              <button
                onClick={() => setCurrentView("Scan")}
                className="text-left px-1.5 py-1 font-sans text-[12px] text-text-faint italic hover:text-text-muted transition-colors cursor-pointer"
              >
                Nothing scanned yet
              </button>
            )}
          </div>

          {/* Standing promise, in the slot the old notes list used. */}
          <div className="flex flex-col gap-2 mt-2 px-1">
            <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
              Local Only
            </span>
            <p className="font-sans text-[11px] text-text-muted leading-relaxed">
              Your recording is read on this Mac and never uploaded. Vera keeps no copy
              of it, of its frames, or of what it finds.
            </p>
          </div>
        </div>

        {/* Profile block */}
        <div className="relative mt-4">
          {profileMenuOpen && (
            <ProfileMenu
              onClose={() => setProfileMenuOpen(false)}
              onNavigateSettings={handleNavigateSettings}
            />
          )}
          <button
            onClick={() => setProfileMenuOpen((open) => !open)}
            className={`w-full border-t border-border-hairline pt-4 flex items-center justify-between rounded-b-lg transition-colors cursor-pointer ${
              profileMenuOpen ? "" : "hover:opacity-80"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-active-hover flex items-center justify-center border border-border-hairline">
                <span className="font-sans text-[13px] font-semibold text-text-primary">
                  {userInitials}
                </span>
              </div>
              <div className="flex flex-col items-start">
                <span className="font-sans text-[13px] font-medium text-text-primary leading-tight">
                  {userName.trim() || "You"}
                </span>
                <span className="font-sans text-[11px] text-text-faint">Local</span>
              </div>
            </div>
            <ChevronsUpDown size={16} strokeWidth={1.5} className="text-text-muted" />
          </button>
        </div>
      </aside>
    </>
  );
};

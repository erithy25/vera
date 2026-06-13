import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Check,
  Pencil,
  Cpu,
  Shield,
  Lock,
  RotateCcw,
  Download,
  Trash2,
} from "lucide-react";
import { settingsRepo } from "../lib/db";
import { useUserProfile } from "../lib/useUserProfile";
import { exportAllData } from "../lib/exportData";
import { SettingsSection } from "../lib/settingsNav";

interface ProfileMenuProps {
  onClose: () => void;
  onNavigateSettings: (section: SettingsSection) => void;
}

type ExportState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; path: string }
  | { status: "error"; message: string };

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ onClose, onNavigateSettings }) => {
  const { name, initials } = useUserProfile();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [version, setVersion] = useState<string>("");
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const startEdit = () => {
    setNameInput(name);
    setEditing(true);
  };

  const saveName = async () => {
    try {
      await settingsRepo.setUserName(nameInput.trim());
      window.dispatchEvent(new CustomEvent("profile-updated"));
    } catch (err) {
      console.error("Failed to save name:", err);
    }
    setEditing(false);
  };

  const handleExport = async () => {
    setExportState({ status: "working" });
    try {
      const path = await exportAllData();
      if (path) {
        setExportState({ status: "done", path });
      } else {
        setExportState({ status: "idle" }); // cancelled
      }
    } catch (err: any) {
      setExportState({
        status: "error",
        message: typeof err === "string" ? err : err?.message || String(err),
      });
    }
  };

  const handleRerunSetup = () => {
    settingsRepo
      .setOnboardingComplete(false)
      .then(() => window.dispatchEvent(new CustomEvent("onboarding-reset")))
      .catch((err) => console.error("Failed to reset onboarding:", err));
    onClose();
  };

  const LinkRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({
    icon,
    label,
    onClick,
    danger,
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg font-sans text-[13px] transition-colors cursor-pointer text-left ${
        danger
          ? "text-red-600 hover:bg-red-500/5"
          : "text-text-muted hover:bg-active-hover hover:text-text-primary"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <>
      {/* Outside-click backdrop */}
      <div className="fixed inset-0 z-40 cursor-default" onClick={onClose} />

      {/* Popover anchored above the profile */}
      <div className="absolute bottom-full left-0 mb-2 w-[290px] bg-card-surface border border-border-hairline rounded-2xl shadow-lg z-50 p-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start gap-3 px-1 pt-1">
          <div className="w-9 h-9 rounded-full bg-active-hover flex items-center justify-center border border-border-hairline shrink-0">
            <span className="font-sans text-[13px] font-semibold text-text-primary">{initials}</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={nameInput}
                  autoFocus
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  placeholder="Your name"
                  className="flex-1 min-w-0 font-sans text-[14px] text-text-primary bg-transparent border-b border-border-hairline outline-none focus:border-text-muted p-0"
                />
                <button
                  onClick={saveName}
                  className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-active-hover cursor-pointer shrink-0"
                >
                  <Check size={14} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-sans text-[14px] font-medium text-text-primary truncate">
                  {name.trim() || "You"}
                </span>
                <button
                  onClick={startEdit}
                  title="Edit name"
                  className="text-text-faint hover:text-text-primary p-0.5 rounded hover:bg-active-hover cursor-pointer shrink-0"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}
            <span className="font-sans text-[11px] text-text-faint">Local account</span>
          </div>
        </div>
        <p className="px-1 font-sans text-[11px] text-text-faint leading-relaxed">
          Everything stays on this Mac. No cloud account.
        </p>

        <div className="h-px bg-border-hairline w-full" />

        {/* Quick links into existing Settings */}
        <div className="flex flex-col">
          <LinkRow icon={<Cpu size={15} strokeWidth={1.5} />} label="AI Engine" onClick={() => onNavigateSettings("ai-engine")} />
          <LinkRow icon={<Shield size={15} strokeWidth={1.5} />} label="Privacy & Data" onClick={() => onNavigateSettings("privacy")} />
          <LinkRow icon={<Lock size={15} strokeWidth={1.5} />} label="App Lock" onClick={() => onNavigateSettings("app-lock")} />
          <LinkRow icon={<RotateCcw size={15} strokeWidth={1.5} />} label="Re-run setup" onClick={handleRerunSetup} />
        </div>

        <div className="h-px bg-border-hairline w-full" />

        {/* Manage data */}
        <div className="flex flex-col">
          <span className="px-2 pt-0.5 pb-1 font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
            Manage data
          </span>
          <LinkRow
            icon={<Download size={15} strokeWidth={1.5} />}
            label={exportState.status === "working" ? "Exporting…" : "Export all data"}
            onClick={handleExport}
          />
          <LinkRow
            icon={<Trash2 size={15} strokeWidth={1.5} />}
            label="Clear all data"
            danger
            onClick={() => onNavigateSettings("clear-data")}
          />
          {exportState.status === "done" && (
            <span className="px-2 py-1 font-sans text-[11px] text-emerald-600 leading-snug break-all">
              Saved to {exportState.path}
            </span>
          )}
          {exportState.status === "error" && (
            <span className="px-2 py-1 font-sans text-[11px] text-red-600 leading-snug">
              {exportState.message}
            </span>
          )}
        </div>

        <div className="h-px bg-border-hairline w-full" />

        {/* About */}
        <div className="px-2 py-0.5 flex flex-col gap-0.5">
          <span className="font-sans text-[11px] text-text-muted">
            Vera {version ? `v${version}` : ""}
          </span>
          <span className="font-sans text-[11px] text-text-faint">
            Runs locally on your Mac.
          </span>
        </div>
      </div>
    </>
  );
};

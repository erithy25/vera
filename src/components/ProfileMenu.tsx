import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Check, Pencil, Gauge, Shield, Info } from "lucide-react";
import { settingsRepo } from "../lib/db";
import { useUserProfile } from "../lib/useUserProfile";
import { SettingsSection } from "../lib/settingsNav";

interface ProfileMenuProps {
  onClose: () => void;
  onNavigateSettings: (section: SettingsSection) => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ onClose, onNavigateSettings }) => {
  const { name, initials } = useUserProfile();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

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
    } finally {
      setEditing(false);
    }
  };

  const jump = (section: SettingsSection) => () => onNavigateSettings(section);

  return (
    <>
      {/* Click-away layer */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute bottom-full left-0 right-0 mb-2 z-50 card-style p-2 flex flex-col gap-1 shadow-lg">
        {/* Identity */}
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-active-hover flex items-center justify-center border border-border-hairline shrink-0">
            <span className="font-sans text-[13px] font-semibold text-text-primary">
              {initials}
            </span>
          </div>
          {editing ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditing(false);
                }}
                placeholder="Your name"
                className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-border-hairline bg-bg-warm font-sans text-[13px] text-text-primary outline-none focus:border-text-faint"
              />
              <button
                onClick={saveName}
                title="Save"
                className="p-1.5 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-all active:scale-90 cursor-pointer"
              >
                <Check size={14} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-sans text-[13px] font-medium text-text-primary truncate">
                  {name.trim() || "You"}
                </span>
                <span className="font-sans text-[11px] text-text-faint">
                  Everything stays on this Mac
                </span>
              </div>
              <button
                onClick={startEdit}
                title="Edit name"
                className="p-1.5 rounded-lg text-text-muted hover:bg-active-hover hover:text-text-primary transition-all active:scale-90 cursor-pointer"
              >
                <Pencil size={13} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-border-hairline my-1" />

        <MenuItem icon={<Gauge size={14} strokeWidth={1.5} />} label="Scanning" onClick={jump("scanning")} />
        <MenuItem icon={<Shield size={14} strokeWidth={1.5} />} label="Privacy" onClick={jump("privacy")} />
        <MenuItem icon={<Info size={14} strokeWidth={1.5} />} label="About" onClick={jump("about")} />

        {version && (
          <>
            <div className="border-t border-border-hairline my-1" />
            <span className="px-3 py-1 font-sans text-[11px] text-text-faint">
              Vera {version}
            </span>
          </>
        )}
      </div>
    </>
  );
};

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-sans text-[13px] text-text-muted hover:bg-active-hover hover:text-text-primary transition-all text-left active:scale-[0.98] cursor-pointer"
  >
    {icon}
    <span>{label}</span>
  </button>
);

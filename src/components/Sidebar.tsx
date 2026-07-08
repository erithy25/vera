import React, { useState } from "react";
import { Clock, Settings, Briefcase, BarChart3, ChevronsUpDown } from "lucide-react";
import { navItems } from "../lib/config";
import { useUserProfile } from "../lib/useUserProfile";
import { ProfileMenu } from "./ProfileMenu";
import { requestSettingsSection, SettingsSection } from "../lib/settingsNav";

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const { name: userName, initials: userInitials } = useUserProfile();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Navigation icon mapper
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "Settings":
        return <Settings size={18} strokeWidth={1.5} />;
      case "Briefcase":
        return <Briefcase size={18} strokeWidth={1.5} />;
      case "BarChart3":
        return <BarChart3 size={18} strokeWidth={1.5} />;
      default:
        return <Clock size={18} strokeWidth={1.5} />;
    }
  };

  const handleNavigateSettings = (section: SettingsSection) => {
    setProfileMenuOpen(false);
    setCurrentView("Settings");
    requestSettingsSection(section);
  };

  return (
    <aside className="w-[260px] h-screen bg-card-surface border-r border-border-hairline flex flex-col justify-between p-5 select-none shrink-0 sticky top-0">
      {/* Top Section */}
      <div className="flex flex-col gap-6 overflow-y-auto pr-1">
        {/* Brand/Header */}
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
            Automatic Time Tracking
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
      </div>

      {/* Profile Section Pinned at Bottom — opens the local profile hub */}
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
              <span className="font-sans text-[11px] text-text-faint">
                Local
              </span>
            </div>
          </div>
          <ChevronsUpDown size={16} strokeWidth={1.5} className="text-text-muted" />
        </button>
      </div>
    </aside>
  );
};

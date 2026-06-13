import React, { useState, useEffect } from "react";
import {
  Home,
  Clock,
  Users,
  BookOpen,
  Target,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  ChevronsUpDown
} from "lucide-react";
import { navItems } from "../lib/config";
import { notesRepo, DbNote } from "../lib/db";
import { useUserProfile } from "../lib/useUserProfile";
import { NotesComposer } from "./NotesComposer";
import { ProfileMenu } from "./ProfileMenu";
import { requestSettingsSection, SettingsSection } from "../lib/settingsNav";

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  dbReady: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, dbReady }) => {
  const { name: userName, initials: userInitials } = useUserProfile();

  // Navigation Icon Mapper
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "Home":
        return <Home size={18} strokeWidth={1.5} />;
      case "Clock":
        return <Clock size={18} strokeWidth={1.5} />;
      case "Users":
        return <Users size={18} strokeWidth={1.5} />;
      case "BookOpen":
        return <BookOpen size={18} strokeWidth={1.5} />;
      case "Target":
        return <Target size={18} strokeWidth={1.5} />;
      case "Settings":
        return <Settings size={18} strokeWidth={1.5} />;
      default:
        return <Home size={18} strokeWidth={1.5} />;
    }
  };

  // --- Focus Mode Timer State & Logic ---
  const [timeLeft, setTimeLeft] = useState(1500); // 25:00 in seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            if (interval) clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // --- Quick Notes State & Logic ---
  const [notes, setNotes] = useState<DbNote[]>([]);
  // The note being composed: a DbNote (edit), "new" (create), or null (closed)
  const [composerNote, setComposerNote] = useState<DbNote | "new" | null>(null);
  // Bumped on a timer so relative timestamps stay live without refetching
  const [, setClockTick] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleNavigateSettings = (section: SettingsSection) => {
    setProfileMenuOpen(false);
    setCurrentView("Settings");
    requestSettingsSection(section);
  };

  const fetchNotes = async () => {
    try {
      setNotes(await notesRepo.list());
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    }
  };

  useEffect(() => {
    if (!dbReady) return;
    fetchNotes();

    // Refresh when a note changes anywhere (composer, approved agent action, ...)
    const onNotesUpdated = () => fetchNotes();
    window.addEventListener("notes-updated", onNotesUpdated);

    // Keep relative timestamps live
    const tick = setInterval(() => setClockTick((t) => t + 1), 30000);

    return () => {
      window.removeEventListener("notes-updated", onNotesUpdated);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady]);

  const getRelativeTime = (createdAt: Date) => {
    const elapsedMs = Date.now() - createdAt.getTime();
    const elapsedSecs = Math.floor(elapsedMs / 1000);
    if (elapsedSecs < 60) {
      return "just now";
    }
    const elapsedMins = Math.floor(elapsedSecs / 60);
    if (elapsedMins < 60) {
      return `${elapsedMins}m ago`;
    }
    const elapsedHours = Math.floor(elapsedMins / 60);
    if (elapsedHours < 24) {
      return `${elapsedHours}h ago`;
    }
    const elapsedDays = Math.floor(elapsedHours / 24);
    return `${elapsedDays}d ago`;
  };

  return (
    <>
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
            Local AI Assistant
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

        {/* Focus Mode Section */}
        <div className="flex flex-col gap-2.5 mt-2">
          <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase px-1">
            Focus Mode
          </span>
          <div className="card-style p-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-[13px] font-medium text-text-primary">
                Deep Work
              </span>
              <span className="font-serif text-[18px] text-text-muted">
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Reset Button */}
              {(timeLeft < 1500 || isTimerRunning) && (
                <button
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimeLeft(1500);
                  }}
                  title="Reset Timer"
                  className="w-7 h-7 rounded-full border border-border-hairline flex items-center justify-center bg-card-surface hover:bg-active-hover hover:text-text-primary text-text-muted transition-all duration-150 active:scale-90 cursor-pointer"
                >
                  <RotateCcw size={11} strokeWidth={1.5} />
                </button>
              )}
              {/* Play/Pause Button */}
              <button
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="w-8 h-8 rounded-full border border-border-hairline flex items-center justify-center bg-card-surface hover:bg-active-hover transition-all duration-150 active:scale-90 group cursor-pointer"
              >
                {isTimerRunning ? (
                  <Pause size={12} strokeWidth={1.5} className="text-text-primary fill-text-primary" />
                ) : (
                  <Play size={12} strokeWidth={1.5} className="text-text-primary fill-text-primary translate-x-[1px]" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Notes Section */}
        <div className="flex flex-col gap-2.5 mt-2">
          <div className="flex items-center justify-between px-1">
            <span className="font-sans text-[10px] font-semibold text-text-faint tracking-widest uppercase">
              Quick Notes
            </span>
            <button
              onClick={() => setComposerNote("new")}
              title="New note"
              className="text-text-muted hover:text-text-primary hover:bg-active-hover p-1 rounded transition-all active:scale-90 cursor-pointer"
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => setComposerNote(note)}
                className="group relative flex flex-col px-1.5 py-1 rounded-lg hover:bg-active-hover/40 transition-colors w-full cursor-pointer"
              >
                <div className="flex flex-col pr-6">
                  <span className="font-sans text-[13px] text-text-primary truncate">
                    {note.title || "Untitled Note"}
                  </span>
                  <span className="font-sans text-[11px] text-text-faint">
                    {getRelativeTime(new Date(note.created_at))}
                  </span>
                </div>
                {/* Delete button (only visible on item hover) */}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await notesRepo.remove(note.id);
                      setNotes((prev) => prev.filter((n) => n.id !== note.id));
                    } catch (err) {
                      console.error("Failed to delete note:", err);
                    }
                  }}
                  title="Delete note"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 text-text-muted hover:text-red-600 p-1 rounded hover:bg-active-hover active:scale-90 cursor-pointer"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}

            {notes.length === 0 && (
              <button
                onClick={() => setComposerNote("new")}
                className="text-left px-1.5 py-1 font-sans text-[12px] text-text-faint italic hover:text-text-muted transition-colors cursor-pointer"
              >
                No notes yet — add one
              </button>
            )}
          </div>
        </div>
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

      {/* Quick Note composer (create / view / edit) */}
      <NotesComposer
        note={composerNote}
        onClose={() => setComposerNote(null)}
        onChanged={fetchNotes}
      />
    </>
  );
};

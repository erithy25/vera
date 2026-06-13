import React, { useState, useEffect, useRef } from "react";
import { X, Trash2 } from "lucide-react";
import { notesRepo, DbNote } from "../lib/db";

interface NotesComposerProps {
  // A DbNote to edit, or "new" to create. null means closed.
  note: DbNote | "new" | null;
  onClose: () => void;
  onChanged: () => void;
}

// Centered modal composer for a Quick Note (title + body), in Vera's warm
// monochrome design. Handles create, edit and delete; persists to the notes
// table and notifies listeners via the notes-updated event.
export const NotesComposer: React.FC<NotesComposerProps> = ({ note, onClose, onChanged }) => {
  const isNew = note === "new";
  const existing = note && note !== "new" ? note : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(existing?.title ?? "");
    setBody(existing?.body ?? "");
    // Focus the title when the composer opens
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const notify = () => {
    onChanged();
    window.dispatchEvent(new CustomEvent("notes-updated"));
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    // An empty note is a no-op (and an empty existing note is removed)
    if (!trimmedTitle && !trimmedBody) {
      if (existing) {
        await notesRepo.remove(existing.id);
        notify();
      }
      onClose();
      return;
    }
    setSaving(true);
    try {
      const finalTitle = trimmedTitle || "Untitled Note";
      if (existing) {
        await notesRepo.update(existing.id, finalTitle, trimmedBody);
      } else {
        await notesRepo.add(finalTitle, trimmedBody);
      }
      notify();
      onClose();
    } catch (err) {
      console.error("Failed to save note:", err);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) {
      onClose();
      return;
    }
    try {
      await notesRepo.remove(existing.id);
      notify();
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
    onClose();
  };

  if (note === null) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-text-primary/10 backdrop-blur-[1px] flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        className="card-style w-full max-w-[520px] p-6 flex flex-col gap-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">
            {isNew ? "New note" : "Edit note"}
          </span>
          <button
            onClick={onClose}
            className="text-text-faint hover:text-text-primary p-1 rounded hover:bg-active-hover transition-all active:scale-90 cursor-pointer"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Note title"
          className="w-full font-serif text-[22px] text-text-primary placeholder:text-text-muted placeholder:italic bg-transparent outline-none border-none p-0"
        />

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="Write something..."
          rows={6}
          className="w-full font-sans text-[14px] text-text-primary leading-relaxed placeholder:text-text-faint bg-card-surface border border-border-hairline rounded-xl p-3 outline-none resize-none focus:border-text-muted/40 transition-colors"
        />

        {/* Actions */}
        <div className="flex items-center justify-between">
          {existing ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 text-red-600 hover:text-red-700 hover:bg-red-500/5 font-sans text-[13px] font-medium transition-all cursor-pointer"
            >
              <Trash2 size={14} strokeWidth={1.5} />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border-hairline font-sans text-[13px] font-medium text-text-muted hover:text-text-primary hover:bg-active-hover transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

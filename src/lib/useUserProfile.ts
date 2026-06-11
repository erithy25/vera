import { useState, useEffect } from "react";
import { settingsRepo } from "./db";

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ME";
  const first = parts[0][0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] || "" : parts[0][1] || "";
  return (first + second).toUpperCase();
}

/** The user's name from settings, kept fresh via the profile-updated event. */
export function useUserProfile(): { name: string; initials: string } {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stored = await settingsRepo.getUserName();
        if (!cancelled) setName(stored);
      } catch (err) {
        console.error("Failed to load user name:", err);
      }
    };
    load();

    const onProfileUpdated = () => load();
    window.addEventListener("profile-updated", onProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", onProfileUpdated);
    };
  }, []);

  return { name, initials: initialsFromName(name) };
}

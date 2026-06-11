import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Fingerprint } from "lucide-react";

interface LockScreenProps {
  onUnlock: () => void;
}

interface AppLockAuthResult {
  success: boolean;
  available: boolean;
}

type AuthState = "idle" | "authenticating" | "failed" | "unavailable";

// Opaque full-screen gate. Authentication is fully delegated to macOS
// (Touch ID with Mac-password fallback) — Vera stores no secret of its own.
export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [authState, setAuthState] = useState<AuthState>("idle");
  const authStateRef = useRef<AuthState>("idle");
  authStateRef.current = authState;

  const attemptUnlock = async () => {
    if (authStateRef.current === "authenticating") return;
    setAuthState("authenticating");
    try {
      const result = await invoke<AppLockAuthResult>("authenticate_app_lock", {
        reason: "Unlock Vera",
      });
      if (result.success) {
        onUnlock();
      } else if (!result.available) {
        setAuthState("unavailable");
      } else {
        setAuthState("failed");
      }
    } catch (err) {
      console.error("App lock authentication failed:", err);
      setAuthState("failed");
    }
  };

  // Prompt automatically when the lock screen appears — but only while the
  // window is actually visible (not while minimized in the background)
  useEffect(() => {
    if (!document.hidden) {
      attemptUnlock();
    }
    const onVisibilityChange = () => {
      if (!document.hidden && authStateRef.current === "idle") {
        attemptUnlock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-bg-warm z-[100] flex flex-col items-center justify-center select-none">
      <div className="flex flex-col items-center gap-6 max-w-[420px] px-8 text-center">
        {/* V mark */}
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-primary"
        >
          <path d="M4 4l8 16 8-16" />
          <path d="M8 4l4 8 4-8" />
        </svg>

        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
            Vera is locked
          </h1>
          <p className="font-sans text-[14px] text-text-muted leading-relaxed">
            Unlock with Touch ID or your Mac password.
          </p>
        </div>

        {authState === "unavailable" ? (
          <div className="flex flex-col items-center gap-4">
            <p className="font-sans text-[13px] text-amber-700 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 leading-relaxed">
              Touch ID and password authentication are not available on this Mac right now, so Vera stays accessible — you are never locked out of your own data.
            </p>
            <button
              onClick={onUnlock}
              className="px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={attemptUnlock}
              disabled={authState === "authenticating"}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-60"
            >
              <Fingerprint size={15} strokeWidth={1.5} />
              {authState === "authenticating" ? "Waiting for Touch ID…" : "Unlock"}
            </button>
            {authState === "failed" && (
              <span className="font-sans text-[12px] text-text-faint">
                Authentication didn't complete. Try again.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

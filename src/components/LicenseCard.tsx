import React, { useEffect, useState } from "react";
import { KeyRound, Check, Lock, Sparkles } from "lucide-react";
import { blocksRepo, projectsRepo } from "../lib/db";
import {
  currentEntitlement,
  activateLicense,
  deactivateLicense,
  PLAN_LABELS,
  Entitlement,
} from "../lib/license";
import { recoveredValueCents } from "../lib/license-core";
import { recoveredTimeMs } from "../lib/reports-core";
import { effectiveRateCents } from "../lib/billing-core";
import { dayStartOf, formatDuration, formatEuroFromCents } from "../lib/format";

// The buy trigger: total recovered time "so far" valued at the user's average
// billable rate. Honest — shows only hours when no rate is set yet.
async function computeFoundValue(): Promise<{ recoveredMs: number; cents: number | null }> {
  const now = Date.now();
  const [blocks, projects] = await Promise.all([
    blocksRepo.confirmedInRange(dayStartOf(0), now), // all confirmed work to date
    projectsRepo.listWithClients(true),
  ]);
  const recoveredMs = recoveredTimeMs(blocks);
  const rates = projects
    .map((p) => effectiveRateCents(p))
    .filter((r): r is number => r !== null && r > 0);
  if (rates.length === 0) return { recoveredMs, cents: null };
  const avgRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  return { recoveredMs, cents: recoveredValueCents(recoveredMs, avgRate) };
}

const MIN_SHOWABLE_MS = 60_000; // below one minute reads as "0 m" — don't nag

// The "License" settings card: trial/licensed/grace/expired status, the
// unobtrusive "Vera found you €X" buy trigger, and key activation. Licensing
// is fully offline — the key is verified on-device against an embedded public
// key, so activating it makes no network call.
export const LicenseCard: React.FC = () => {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [found, setFound] = useState<{ recoveredMs: number; cents: number | null } | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [e, f] = await Promise.all([currentEntitlement(), computeFoundValue()]);
      setEnt(e);
      setFound(f);
    } catch (err) {
      console.error("Failed to load license state:", err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      const err = await activateLicense(keyInput);
      if (err) {
        setError(err);
      } else {
        setKeyInput("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      await deactivateLicense();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const licensed = ent?.status === "licensed" || ent?.status === "grace";

  const statusLine = (): string => {
    if (!ent) return "";
    switch (ent.status) {
      case "trial":
        return ent.trialDaysLeft <= 0
          ? "Free trial · last day"
          : `Free trial · ${ent.trialDaysLeft} day${ent.trialDaysLeft === 1 ? "" : "s"} left`;
      case "trial_expired":
        return "Free trial ended";
      case "licensed":
        return `${ent.plan ? PLAN_LABELS[ent.plan] : "Licensed"} · active`;
      case "grace":
        return `${ent.plan ? PLAN_LABELS[ent.plan] : "License"} lapsed · ${ent.graceDaysLeft} day${
          ent.graceDaysLeft === 1 ? "" : "s"
        } of grace left`;
      case "expired":
        return "License expired";
    }
  };

  return (
    <div id="settings-license" className="card-style p-5 flex flex-col gap-4 scroll-mt-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="font-serif text-[17px] font-normal text-text-primary">License</span>
          <span className="font-sans text-[12px] text-text-faint">{statusLine()}</span>
        </div>
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-full font-sans text-[11px] font-medium uppercase shrink-0 ${
            ent?.entitled
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
              : "border-amber-500/20 bg-amber-500/5 text-amber-600"
          }`}
        >
          {licensed ? <Check size={12} strokeWidth={2} /> : <KeyRound size={12} strokeWidth={1.75} />}
          {ent?.entitled ? (licensed ? "Licensed" : "Trial") : "Locked"}
        </span>
      </div>

      {/* Buy trigger — unobtrusive, only while unlicensed */}
      {!licensed && found && found.recoveredMs >= MIN_SHOWABLE_MS && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
          <Sparkles size={16} strokeWidth={1.5} className="text-emerald-600 shrink-0 mt-0.5" />
          <span className="font-sans text-[13px] text-emerald-800 leading-relaxed">
            In the last 30 days Vera recovered{" "}
            <strong>{formatDuration(found.recoveredMs)}</strong>
            {found.cents !== null && found.cents > 0 && (
              <>
                {" "}
                of billable time — about <strong>{formatEuroFromCents(found.cents)}</strong>
              </>
            )}
            {" "}that a manual timesheet typically loses.
          </span>
        </div>
      )}

      {(ent?.status === "trial_expired" || ent?.status === "expired") && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl">
          <span className="font-sans text-[12.5px] text-amber-800">
            Capture and review keep working. Exporting billing files needs an active license.
          </span>
        </div>
      )}

      {/* Key entry is always available — a renewed or upgraded key can be
          pasted without first removing the current one (e.g. during grace). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              setError(null);
            }}
            placeholder={licensed ? "Paste a renewed or upgraded key" : "Paste your license key"}
            className="flex-1 px-3 py-2 bg-bg-warm border border-border-hairline rounded-lg font-sans text-[13px] text-text-primary outline-none focus:border-text-muted"
          />
          <button
            onClick={activate}
            disabled={busy || !keyInput.trim()}
            className="px-4 py-2 rounded-lg bg-text-primary text-card-surface font-sans text-[13px] font-medium hover:bg-text-muted transition-all cursor-pointer disabled:opacity-50"
          >
            Activate
          </button>
        </div>
        {error && <span className="font-sans text-[12px] text-red-600">{error}</span>}
        {!licensed && (
          <span className="font-sans text-[12px] text-text-faint">
            No key yet? Get Vera from the Vera website, then paste your key here — the
            14-day trial needs no key.
          </span>
        )}
        <span className="flex items-center gap-1.5 font-sans text-[11px] text-text-faint">
          <Lock size={11} strokeWidth={1.5} />
          Verified on this Mac — activating your license makes no network call.
        </span>
        {licensed && (
          <button
            onClick={deactivate}
            disabled={busy}
            className="self-start mt-1 px-3 py-1.5 rounded-lg border border-border-hairline font-sans text-[12px] text-text-muted hover:text-text-primary hover:bg-active-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            Remove license from this Mac
          </button>
        )}
      </div>
    </div>
  );
};

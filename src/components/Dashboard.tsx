import React from "react";
import { Clock, Lock } from "lucide-react";

// "Today" — the future daily review. The block engine that turns raw capture
// into billable work blocks arrives with the next layer; until then this view
// says honestly what is happening in the background.
export const Dashboard: React.FC = () => {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      <div className="flex flex-col gap-1.5 border-b border-border-hairline pb-4">
        <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
          Today
        </h1>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed">{today}</p>
      </div>

      <div className="card-style px-8 py-16 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-active-hover border border-border-hairline flex items-center justify-center text-text-primary">
          <Clock size={22} strokeWidth={1.5} />
        </div>
        <h2 className="font-serif text-[24px] text-text-primary tracking-tight">
          Vera is capturing your workday.
        </h2>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed max-w-[460px]">
          Your day will appear here as billable work blocks — grouped by client,
          with ready-to-bill narratives — starting with the next update. Capture
          runs locally in the background, so nothing you do now is lost.
        </p>
        <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-faint">
          <Lock size={12} strokeWidth={1.5} />
          Recorded on this Mac only · encrypted · not a single byte leaves your device
        </span>
      </div>
    </div>
  );
};

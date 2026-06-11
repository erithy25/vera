import React, { useState, useEffect } from "react";
import { Code, FileText, Component, MessageSquare, Globe } from "lucide-react";
import { activityRepo } from "../lib/db";

interface AppUsage {
  name: string;
  timeLabel: string;
  minutes: number;
  iconName: string;
}

export const TopAppsCard: React.FC = () => {
  const [apps, setApps] = useState<AppUsage[]>([]);

  useEffect(() => {
    async function loadApps() {
      try {
        const list = await activityRepo.topAppsToday();
        setApps(list);
      } catch (err) {
        console.error("Failed to load top apps:", err);
      }
    }
    loadApps();

    window.addEventListener("activity-updated", loadApps);
    return () => {
      window.removeEventListener("activity-updated", loadApps);
    };
  }, []);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "Code":
        return <Code size={13} strokeWidth={1.5} />;
      case "FileText":
        return <FileText size={13} strokeWidth={1.5} />;
      case "Framer":
        return <Component size={13} strokeWidth={1.5} />;
      case "MessageSquare":
        return <MessageSquare size={13} strokeWidth={1.5} />;
      case "Globe":
        return <Globe size={13} strokeWidth={1.5} />;
      default:
        return <FileText size={13} strokeWidth={1.5} />;
    }
  };

  const maxMinutes = apps.length > 0 ? Math.max(...apps.map((a) => a.minutes)) : 1;

  return (
    <div className="card-style p-6 flex flex-col h-[340px] justify-between">
      {/* Title & Subtitle */}
      <div>
        <h2 className="font-serif text-[20px] font-normal text-text-primary leading-tight">
          Top Apps
        </h2>
        <p className="font-sans text-[10px] font-semibold text-text-faint uppercase tracking-wider mt-1">
          By active time
        </p>
      </div>

      {/* App rows */}
      <div className="flex flex-col gap-4 mt-3 flex-1 justify-center">
        {apps.map((app) => {
          const widthPercent = (app.minutes / maxMinutes) * 100;
          return (
            <div key={app.name} className="flex items-center gap-3 select-none">
              {/* App identity */}
              <div className="flex items-center gap-2 w-[90px] shrink-0">
                <div className="w-6.5 h-6.5 rounded-lg bg-active-hover flex items-center justify-center text-text-primary border border-border-hairline shrink-0">
                  {getIcon(app.iconName)}
                </div>
                <span className="font-sans text-[13px] font-normal text-text-primary truncate">
                  {app.name}
                </span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 h-1.5 bg-active-hover rounded-full overflow-hidden">
                <div
                  className="h-full bg-text-primary rounded-full"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>

              {/* Time value */}
              <span className="font-sans text-[12px] font-medium text-text-muted shrink-0 w-[55px] text-right">
                {app.timeLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

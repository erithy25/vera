import React, { useState, useEffect } from "react";
import { activityRepo, goalsRepo } from "../lib/db";

interface TodayStats {
  activeHours: string;
  focusTime: string;
  meetings: string;
  interruptions: string;
  progressPercent: number;
}

export const TodayCard: React.FC = () => {
  const [stats, setStats] = useState<TodayStats>({
    activeHours: "0m",
    focusTime: "0m",
    meetings: "0",
    interruptions: "0",
    progressPercent: 0,
  });
  const [goalLabel, setGoalLabel] = useState("of 8h goal");

  useEffect(() => {
    async function loadStats() {
      try {
        const [todayStats, dailyGoal] = await Promise.all([
          activityRepo.todayStats(),
          goalsRepo.getDailyGoal(),
        ]);
        setStats(todayStats);

        if (dailyGoal) {
          const goalHours = Math.floor(dailyGoal.target_minutes / 60);
          setGoalLabel(`of ${goalHours}h goal`);
        }
      } catch (err) {
        console.error("Failed to load today stats:", err);
      }
    }
    loadStats();

    window.addEventListener("activity-updated", loadStats);
    return () => {
      window.removeEventListener("activity-updated", loadStats);
    };
  }, []);

  // SVG progress variables
  const radius = 42;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.progressPercent / 100) * circumference;

  return (
    <div className="card-style p-6 flex flex-col h-[340px] justify-between">
      {/* Title */}
      <div>
        <h2 className="font-serif text-[20px] font-normal text-text-primary leading-tight">
          Today
        </h2>
      </div>

      {/* Content Area */}
      <div className="flex items-center justify-between gap-4 flex-1 mt-4">
        {/* Left: Progress circle */}
        <div className="relative w-[96px] h-[96px] flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="stroke-border-hairline fill-none"
              strokeWidth={strokeWidth}
            />
            {/* Foreground circle */}
            <circle
              cx="48"
              cy="48"
              r={radius}
              className="stroke-text-primary fill-none transition-all duration-700 ease-out"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          {/* Centered label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-serif text-[16px] font-normal text-text-primary leading-none">
              {stats.activeHours}
            </span>
            <span className="font-sans text-[8px] text-text-faint tracking-wider uppercase mt-0.5">
              {goalLabel}
            </span>
          </div>
        </div>

        {/* Right: List of statistics in a vertical stacked list to avoid horizontal overlaps */}
        <div className="flex flex-col gap-3.5 flex-1 pl-5 border-l border-border-hairline h-full justify-center">
          <div>
            <div className="font-sans text-[9px] font-semibold text-text-faint tracking-widest uppercase leading-none">
              Active Hours
            </div>
            <div className="font-serif text-[17px] font-normal text-text-primary mt-1.5 leading-none">
              {stats.activeHours}
            </div>
          </div>

          <div>
            <div className="font-sans text-[9px] font-semibold text-text-faint tracking-widest uppercase leading-none">
              Focus Time
            </div>
            <div className="font-serif text-[17px] font-normal text-text-primary mt-1.5 leading-none">
              {stats.focusTime}
            </div>
          </div>

          <div>
            <div className="font-sans text-[9px] font-semibold text-text-faint tracking-widest uppercase leading-none">
              Meetings
            </div>
            <div className="font-serif text-[17px] font-normal text-text-primary mt-1.5 leading-none">
              {stats.meetings}
            </div>
          </div>

          <div>
            <div className="font-sans text-[9px] font-semibold text-text-faint tracking-widest uppercase leading-none">
              Interruptions
            </div>
            <div className="font-serif text-[17px] font-normal text-text-primary mt-1.5 leading-none">
              {stats.interruptions}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { activityRepo } from "../lib/db";

export const TimelineCard: React.FC = () => {
  const [selectedRange, setSelectedRange] = useState<"Today" | "This Week" | "This Month">("Today");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeData, setActiveData] = useState<Array<{ label: string; minutes: number }>>([]);

  useEffect(() => {
    async function loadTimeline() {
      try {
        let data;
        if (selectedRange === "This Week") {
          data = await activityRepo.timelineThisWeek();
        } else if (selectedRange === "This Month") {
          data = await activityRepo.timelineThisMonth();
        } else {
          data = await activityRepo.timelineToday();
        }
        setActiveData(data);
      } catch (err) {
        console.error("Failed to load timeline:", err);
      }
    }
    loadTimeline();

    window.addEventListener("activity-updated", loadTimeline);
    return () => {
      window.removeEventListener("activity-updated", loadTimeline);
    };
  }, [selectedRange]);

  return (
    <div className="card-style p-6 flex flex-col h-[340px] justify-between">
      {/* Header */}
      <div className="flex items-center justify-between select-none">
        <h2 className="font-serif text-[20px] font-normal text-text-primary leading-tight">
          Timeline
        </h2>
        
        {/* Dropdown Menu */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-hairline bg-card-surface text-[12px] font-sans font-medium text-text-muted hover:bg-active-hover hover:text-text-primary transition-all duration-150 active:scale-95 cursor-pointer"
          >
            <span>{selectedRange}</span>
            <ChevronDown size={12} strokeWidth={1.5} />
          </button>
          
          {isDropdownOpen && (
            <>
              {/* Invisible full-screen backdrop to detect click-away */}
              <div
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setIsDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1.5 w-32 bg-card-surface border border-border-hairline rounded-lg shadow-lg z-20 py-1 flex flex-col">
                {(["Today", "This Week", "This Month"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => {
                      setSelectedRange(range);
                      setIsDropdownOpen(false);
                    }}
                    className={`px-3 py-1.5 text-left font-sans text-[12px] font-normal transition-all cursor-pointer w-full active:bg-active-hover/80 ${
                      selectedRange === range
                        ? "bg-active-hover text-text-primary font-medium"
                        : "text-text-muted hover:bg-active-hover hover:text-text-primary"
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bar Chart Container */}
      <div className="flex-1 flex items-end justify-center mt-6 w-full h-[185px]">
        <svg viewBox="0 0 260 130" className="w-full h-full select-none">
          {/* Grid Lines */}
          <line
            x1="35"
            y1="15"
            x2="252"
            y2="15"
            className="stroke-border-hairline"
            strokeDasharray="2 2"
            strokeWidth="0.5"
          />
          <line
            x1="35"
            y1="55"
            x2="252"
            y2="55"
            className="stroke-border-hairline"
            strokeDasharray="2 2"
            strokeWidth="0.5"
          />
          <line
            x1="35"
            y1="95"
            x2="252"
            y2="95"
            className="stroke-border-hairline"
            strokeWidth="0.5"
          />

          {/* Y-Axis Label Texts */}
          <text
            x="5"
            y="18"
            className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider"
          >
            60m
          </text>
          <text
            x="5"
            y="58"
            className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider"
          >
            30m
          </text>
          <text
            x="5"
            y="98"
            className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider"
          >
            0m
          </text>

          {/* Activity Data Bars */}
          {activeData.map((dp, i) => {
            const chartWidth = 212;
            let barWidth = 3.5;
            let x = 35 + i * (chartWidth / 23);

            if (selectedRange === "This Week") {
              barWidth = 12;
              x = 35 + i * (chartWidth / 6) + (chartWidth / 6 - barWidth) / 2;
            } else if (selectedRange === "This Month") {
              barWidth = 28;
              x = 35 + i * (chartWidth / 3) + (chartWidth / 3 - barWidth) / 2;
            }

            const barHeight = (dp.minutes / 60) * 80;
            const y = 95 - barHeight;

            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={selectedRange === "Today" ? "1" : "2"}
                className="fill-current text-text-primary hover:text-text-muted transition-colors duration-150 cursor-pointer"
              />
            );
          })}

          {/* X-Axis Label Texts (Dynamic based on Selected Range) */}
          {selectedRange === "Today" && (
            <>
              <text x="37" y="118" className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider" textAnchor="middle">
                12 AM
              </text>
              <text x="91" y="118" className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider" textAnchor="middle">
                6 AM
              </text>
              <text x="145" y="118" className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider" textAnchor="middle">
                12 PM
              </text>
              <text x="199" y="118" className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider" textAnchor="middle">
                6 PM
              </text>
              <text x="248" y="118" className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider" textAnchor="middle">
                12 AM
              </text>
            </>
          )}

          {selectedRange === "This Week" &&
            activeData.map((dp, i) => {
              const chartWidth = 212;
              const x = 35 + i * (chartWidth / 6) + (chartWidth / 6) / 2;
              return (
                <text
                  key={dp.label}
                  x={x}
                  y="118"
                  className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider"
                  textAnchor="middle"
                >
                  {dp.label}
                </text>
              );
            })}

          {selectedRange === "This Month" &&
            activeData.map((dp, i) => {
              const chartWidth = 212;
              const x = 35 + i * (chartWidth / 3) + (chartWidth / 3) / 2;
              return (
                <text
                  key={dp.label}
                  x={x}
                  y="118"
                  className="font-sans text-[8px] fill-current text-text-faint font-semibold uppercase tracking-wider"
                  textAnchor="middle"
                >
                  {dp.label}
                </text>
              );
            })}
        </svg>
      </div>
    </div>
  );
};

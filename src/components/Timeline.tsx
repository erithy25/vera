import React, { useState, useEffect } from "react";
import { Clock, Eye, ChevronDown, ChevronUp } from "lucide-react";
import {
  activityRepo,
  capturesRepo,
  formatHoursMinutes,
  DbActivityEvent,
  DbCapture,
} from "../lib/db";

type TimelineItem =
  | { kind: "activity"; time: number; event: DbActivityEvent }
  | { kind: "capture"; time: number; capture: DbCapture };

interface HourGroup {
  hour: number;
  items: TimelineItem[];
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextDay(ms: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayChipLabel(dayMs: number): string {
  const today = startOfDay(Date.now());
  const yesterday = startOfDay(today - 1000);
  if (dayMs === today) return "Today";
  if (dayMs === yesterday) return "Yesterday";
  return new Date(dayMs).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function hourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${period}`;
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const Timeline: React.FC = () => {
  const [days, setDays] = useState<number[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(startOfDay(Date.now()));
  const [groups, setGroups] = useState<HourGroup[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Build the day selector: always include Today, plus every day with data
  const loadDays = async () => {
    try {
      const active = await activityRepo.activeDays();
      const today = startOfDay(Date.now());
      const merged = active.includes(today) ? active : [today, ...active];
      setDays(merged.sort((a, b) => b - a));
    } catch (err) {
      console.error("Failed to load timeline days:", err);
      setDays([startOfDay(Date.now())]);
    }
  };

  const loadDay = async (dayMs: number) => {
    setLoaded(false);
    try {
      const start = dayMs;
      const end = nextDay(dayMs);
      const [events, captures] = await Promise.all([
        activityRepo.eventsForDay(start, end),
        capturesRepo.forDay(start, end),
      ]);

      const items: TimelineItem[] = [
        ...events.map((e) => ({ kind: "activity" as const, time: e.started_at, event: e })),
        ...captures.map((c) => ({ kind: "capture" as const, time: c.captured_at, capture: c })),
      ];

      // Reverse-chronological so the freshest moments are at the top and the
      // user scrolls down to rewind earlier into the day
      items.sort((a, b) => b.time - a.time);

      const byHour = new Map<number, TimelineItem[]>();
      for (const item of items) {
        const h = new Date(item.time).getHours();
        if (!byHour.has(h)) byHour.set(h, []);
        byHour.get(h)!.push(item);
      }

      const hourGroups: HourGroup[] = Array.from(byHour.entries())
        .map(([hour, groupItems]) => ({ hour, items: groupItems }))
        .sort((a, b) => b.hour - a.hour);

      setGroups(hourGroups);
    } catch (err) {
      console.error("Failed to load timeline day:", err);
      setGroups([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadDays();
  }, []);

  useEffect(() => {
    setExpandedIds(new Set());
    loadDay(selectedDay);

    // Keep Today live as new activity/captures arrive
    const onUpdate = () => {
      if (selectedDay === startOfDay(Date.now())) {
        loadDay(selectedDay);
        loadDays();
      }
    };
    window.addEventListener("activity-updated", onUpdate);
    window.addEventListener("captures-updated", onUpdate);
    return () => {
      window.removeEventListener("activity-updated", onUpdate);
      window.removeEventListener("captures-updated", onUpdate);
    };
  }, [selectedDay]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasItems = groups.length > 0;

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
          Timeline
        </h1>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed max-w-[600px]">
          Rewind through your day — your activity and what was on screen, in the order it happened. Processed locally and private.
        </p>
      </div>

      {/* Day selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {days.map((dayMs) => {
          const active = dayMs === selectedDay;
          return (
            <button
              key={dayMs}
              onClick={() => setSelectedDay(dayMs)}
              className={`px-3.5 py-1.5 rounded-full font-sans text-[12px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer border ${
                active
                  ? "bg-text-primary text-card-surface border-text-primary"
                  : "bg-card-surface text-text-muted border-border-hairline hover:bg-active-hover hover:text-text-primary"
              }`}
            >
              {dayChipLabel(dayMs)}
            </button>
          );
        })}
      </div>

      {/* Timeline body */}
      {hasItems ? (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <div key={group.hour} className="flex gap-4">
              {/* Hour rail */}
              <div className="w-[52px] shrink-0 pt-1">
                <span className="font-sans text-[11px] font-semibold text-text-faint tracking-widest uppercase">
                  {hourLabel(group.hour)}
                </span>
              </div>

              {/* Items for this hour */}
              <div className="flex-1 card-style px-5 py-2 flex flex-col min-w-0">
                {group.items.map((item, idx) => (
                  <div key={`${item.kind}-${item.kind === "activity" ? item.event.id : item.capture.id}`} className="flex flex-col">
                    {idx > 0 && <div className="h-px bg-border-hairline w-full" />}

                    {item.kind === "activity" ? (
                      <div className="flex items-center gap-3 py-3">
                        <div className="w-2 h-2 rounded-full bg-text-primary shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-sans text-[13px] font-semibold text-text-primary shrink-0">
                              {item.event.app_name}
                            </span>
                            {item.event.window_title && (
                              <span
                                className="font-sans text-[12px] text-text-muted truncate min-w-0"
                                title={item.event.window_title}
                              >
                                {item.event.window_title}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-sans text-[11px] text-text-faint shrink-0 tabular-nums">
                          {clockTime(item.time)}–{clockTime(item.time + item.event.duration_seconds * 1000)} · {formatHoursMinutes(item.event.duration_seconds)}
                        </span>
                      </div>
                    ) : (
                      <div
                        onClick={() => toggleExpand(item.capture.id)}
                        className="group flex flex-col gap-1.5 py-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <Eye size={13} strokeWidth={1.5} className="text-text-faint shrink-0" />
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-sans text-[12px] font-medium text-text-primary px-2 py-0.5 bg-active-hover rounded-md shrink-0">
                              {item.capture.app_name}
                            </span>
                            {item.capture.window_title && (
                              <span
                                className="font-sans text-[12px] text-text-muted truncate min-w-0"
                                title={item.capture.window_title}
                              >
                                {item.capture.window_title}
                              </span>
                            )}
                          </div>
                          <span className="font-sans text-[11px] text-text-faint shrink-0 tabular-nums">
                            {clockTime(item.time)}
                          </span>
                          {expandedIds.has(item.capture.id) ? (
                            <ChevronUp size={14} strokeWidth={1.5} className="text-text-faint shrink-0" />
                          ) : (
                            <ChevronDown size={14} strokeWidth={1.5} className="text-text-faint shrink-0" />
                          )}
                        </div>

                        {expandedIds.has(item.capture.id) ? (
                          <div className="font-sans text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap select-text selection:bg-active-hover/80 pl-6 pt-1">
                            {item.capture.ocr_text || (
                              <span className="text-text-faint italic">No readable text captured</span>
                            )}
                          </div>
                        ) : (
                          <p className="font-sans text-[12px] text-text-muted leading-relaxed line-clamp-2 pl-6">
                            {item.capture.ocr_text.replace(/\n+/g, "  ") || (
                              <span className="text-text-faint italic">No readable text captured</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        loaded && (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-card-surface border border-border-hairline border-dashed rounded-3xl gap-3">
            <div className="w-12 h-12 rounded-full bg-active-hover flex items-center justify-center text-text-muted">
              <Clock size={22} strokeWidth={1.5} />
            </div>
            <div className="flex flex-col items-center text-center gap-1">
              <span className="font-serif text-[18px] text-text-primary">Nothing recorded</span>
              <span className="font-sans text-[13px] text-text-faint max-w-[280px]">
                There's no activity or screen memory for this day yet.
              </span>
            </div>
          </div>
        )
      )}
    </div>
  );
};

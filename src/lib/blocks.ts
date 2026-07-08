import { activityRepo, blocksRepo, framesRepo, isSystemProcessName, settingsRepo } from "./db";
import { queueAssignment } from "./assign";
import { dayStartOf, nextDayStart, prevDayStart } from "./format";
import { Moment, segmentDay, subtractPreserved } from "./segmentation";

// The block engine: feeds the day's raw capture (activity events + frames)
// through the pure segmentation module and persists the result idempotently.
// Engine-owned blocks (open, untouched) are replaced on every run; anything
// the user confirmed, discarded, or edited is never recomputed — its time
// range is subtracted from the fresh computation instead.
//
// All runs (interval ticks AND manual refreshes) are serialized through one
// promise queue, so two recomputes can never interleave their delete+insert
// phases. A persisted watermark backfills days that were captured while the
// app was not running (Rust keeps capturing with the window hidden, but a
// quit/crash can leave whole days unsegmented).

const FRAME_MOMENT_MS = 1000; // nominal weight of one frame sample
const RUN_INTERVAL_MS = 15 * 60 * 1000;
const BACKFILL_LIMIT_DAYS = 14;

async function momentsForDay(dayStartMs: number, dayEndMs: number): Promise<Moment[]> {
  const [events, frames] = await Promise.all([
    activityRepo.eventsOverlapping(dayStartMs, dayEndMs),
    framesRepo.forDay(dayStartMs, dayEndMs),
  ]);
  const moments: Moment[] = [];
  for (const e of events) {
    // Defensive: legacy rows may predate the Rust-side system-process guard.
    if (isSystemProcessName(e.app_name)) continue;
    moments.push({
      t: e.started_at,
      durationMs: Math.max(1, e.duration_seconds * 1000),
      app: e.app_name,
      title: e.window_title,
      url: null,
      ocr: null,
    });
  }
  for (const f of frames) {
    moments.push({
      t: f.timestamp,
      durationMs: FRAME_MOMENT_MS,
      app: f.app ?? "Unknown",
      title: f.window_title,
      url: f.url,
      ocr: f.ocr_text,
    });
  }
  return moments;
}

async function runForDayInner(dayStartMs: number): Promise<void> {
  const dayEndMs = nextDayStart(dayStartMs);
  const moments = await momentsForDay(dayStartMs, dayEndMs);
  if (moments.length === 0) {
    // No raw capture (left) for this day — never touch existing blocks.
    // This keeps the promise "raw data expires, blocks remain" true even if
    // a recompute is triggered for a day past the retention horizon.
    return;
  }
  const preserved = await blocksRepo.preservedForDay(dayStartMs, dayEndMs);
  const computed = subtractPreserved(
    segmentDay(moments, dayStartMs, dayEndMs),
    preserved.map((p) => ({ startedAt: p.started_at, endedAt: p.ended_at }))
  );
  await blocksRepo.reconcileComputedForDay(
    dayStartMs,
    dayEndMs,
    computed.map((b) => ({
      started_at: b.startedAt,
      ended_at: b.endedAt,
      app_summary: b.appSummary,
      title_summary: b.titleSummary,
      evidence: JSON.stringify(b.evidence),
    }))
  );
  // Fresh structure renders immediately; the assignment engine runs on its
  // OWN queue (fire-and-forget here) so a minutes-long LLM pass never blocks
  // recomputes or the UI — it dispatches its own blocks-updated when done.
  window.dispatchEvent(new CustomEvent("blocks-updated"));
  queueAssignment(dayStartMs, dayEndMs).catch((err) =>
    console.error("[Vera Blocks] assignment run failed:", err)
  );
}

// One queue for every recompute — interval ticks and manual refreshes alike.
// Coalesced per day so a slow run can never build an unbounded backlog of
// identical recomputes behind itself.
let queue: Promise<void> = Promise.resolve();
const pendingDays = new Set<number>();

function enqueue(dayStartMs: number, work: () => Promise<void>): Promise<void> {
  if (pendingDays.has(dayStartMs)) return queue;
  pendingDays.add(dayStartMs);
  const next = queue.then(() => {
    pendingDays.delete(dayStartMs); // re-queues during the run are allowed
    return work();
  });
  // The queue itself must survive a failed run; callers still see the error.
  queue = next.catch((err) => {
    console.error("[Vera Blocks] engine run failed:", err);
  });
  return next;
}

/** Recompute one day (serialized with all other engine runs). */
export function recomputeDay(dayStartMs: number): Promise<void> {
  return enqueue(dayStartMs, () => runForDayInner(dayStartMs));
}

// Days from the persisted watermark (exclusive of already-final days) up to
// today. Capped so a machine that was off for months doesn't grind through
// its whole history at once.
async function daysToProcess(): Promise<number[]> {
  const today = dayStartOf(Date.now());
  let from = prevDayStart(today); // default: yesterday + today
  try {
    const watermark = await settingsRepo.getBlocksWatermark();
    if (watermark !== null && watermark < from) {
      from = Math.max(watermark, prevDayStart(today) - (BACKFILL_LIMIT_DAYS - 1) * 24 * 60 * 60 * 1000);
      from = dayStartOf(from);
    }
  } catch (err) {
    console.error("[Vera Blocks] failed to read watermark:", err);
  }
  const days: number[] = [];
  for (let d = from; d <= today; d = nextDayStart(d)) {
    days.push(d);
  }
  // Newest first: today is usable immediately; older days backfill behind it.
  return days.reverse();
}

let lastTickToday: number | null = null;

async function tick(): Promise<void> {
  const today = dayStartOf(Date.now());
  const firstRun = lastTickToday === null;
  const dayRolled = lastTickToday !== null && lastTickToday !== today;
  lastTickToday = today;
  try {
    if (firstRun || dayRolled) {
      // Startup / midnight rollover: cover everything since the watermark.
      for (const day of await daysToProcess()) {
        await recomputeDay(day);
      }
      await settingsRepo.setBlocksWatermark(today);
    } else {
      // Ordinary interval tick: yesterday's capture is immutable — only
      // today needs refreshing.
      await recomputeDay(today);
    }
  } catch (err) {
    console.error("[Vera Blocks] engine tick failed:", err);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the engine: an immediate backfill run (watermark → today), then a
 * refresh of today every 15 minutes. Returns a stop function.
 */
export function startBlockEngine(): () => void {
  tick();
  if (!intervalHandle) {
    intervalHandle = setInterval(tick, RUN_INTERVAL_MS);
  }
  return () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
}

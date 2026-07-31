/**
 * The dry run's bridge to Rust.
 *
 * Everything here is a typed wrapper. Two things in particular are deliberately
 * *not* computed on this side: the canary string, and the legibility maths.
 * Both are measured and tested in `vera-core`, and both decide whether a user
 * re-records or ships — a second copy of either would be a copy that drifts.
 */

import { invoke } from "@tauri-apps/api/core";

export interface Recorder {
  name: string;
  /** `builtin` — already on every Mac. `installed` — found in /Applications. */
  kind: "builtin" | "installed";
  installed: boolean;
  note: string;
}

export interface RecordingEnvironment {
  recorders: Recorder[];
  /** Absolute path. Empty when the probe could not answer. */
  save_location: string;
  save_location_known: boolean;
  /** Device pixels, and the backing scale. Zero means the probe failed. */
  display_width: number;
  display_height: number;
  display_scale: number;
}

export type Legibility = "comfortable" | "marginal" | "unreadable";

export interface PlanVerdict {
  glyph_px: number;
  glyph_px_before_export: number;
  export_ratio: number;
  legibility: Legibility;
  export_is_the_problem: boolean;
  summary: string;
}

export interface RecordingPlanReport {
  verdict: PlanVerdict;
  /** Null when no export size helps — the text is already too small at full size. */
  smallest_safe_export_height: number | null;
}

export const recordingEnvironment = () =>
  invoke<RecordingEnvironment>("recording_environment");

export const dryRunCanary = () => invoke<string>("dry_run_canary");

export const openScreenRecorder = () => invoke<void>("open_screen_recorder");

export const revealFolder = (path: string) => invoke<void>("reveal_folder", { path });

export const evaluateRecordingPlan = (
  fontPoints: number,
  displayScale: number,
  captureHeightPx: number,
  exportHeightPx: number
) =>
  invoke<RecordingPlanReport>("evaluate_recording_plan", {
    fontPoints,
    displayScale,
    captureHeightPx,
    exportHeightPx,
  });

/** The pattern the canary is: what the dry run looks for in its own recording. */
export const CANARY_PATTERN_ID = "openai_project";

/** How a display reads to a person: "3456 × 2234 at 2×". Empty when unknown. */
export function describeDisplay(env: RecordingEnvironment): string {
  if (!env.display_width || !env.display_height) return "";
  const scale = env.display_scale >= 2 ? `${Math.round(env.display_scale)}×` : "1×";
  return `${env.display_width} × ${env.display_height} at ${scale}`;
}

/** `/Users/erik/Desktop` reads better as `~/Desktop`. */
export function shortenHome(path: string): string {
  const m = path.match(/^\/Users\/[^/]+(\/.*)?$/);
  return m ? `~${m[1] ?? ""}` : path;
}

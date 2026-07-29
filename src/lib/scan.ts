/**
 * The scanner bridge.
 *
 * Everything here is a thin, typed wrapper over a Tauri command. The detection
 * itself lives in Rust (`src-tauri/core/src/detect.rs`) and is never duplicated
 * on this side — that duplication across the Rust/TypeScript/Swift boundary is
 * exactly what the audit found and what the rebuild removed.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Severity = "info" | "medium" | "high" | "critical";

/**
 * One secret, over the time range it was visible.
 *
 * Note what is absent: the secret itself. `preview` is masked in Rust before it
 * ever crosses the IPC boundary, so the window never holds the real value.
 */
export interface Incident {
  pattern_id: string;
  label: string;
  provider: string;
  severity: Severity;
  preview: string;
  first_seen_ms: number;
  last_seen_ms: number;
  first_frame_index: number;
  frame_count: number;
  confidence: number;
}

export interface ScanResult {
  incidents: Incident[];
  frames_scanned: number;
  frames_with_findings: number;
  duration_ms: number;
  file_name: string;
  frames_ocred: number;
  engine_version: string;
  cancelled: boolean;
}

export interface ScanProgress {
  frames_done: number;
  frames_total: number;
  duration_ms: number;
  incidents_so_far: number;
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "info"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  info: "Informational",
};

/**
 * What the user should actually do about each severity. A scanner that only
 * says "critical" leaves the hard part undone.
 */
export const SEVERITY_ADVICE: Record<Severity, string> = {
  critical: "Rotate this key, then re-record or cut the segment.",
  high: "Treat as compromised — rotate it before publishing.",
  medium: "Limited blast radius, but do not publish it.",
  info: "Safe to publish. Listed so you know it was seen.",
};

/** Tailwind classes per severity, using the palette already in the app. */
export const SEVERITY_STYLE: Record<Severity, { dot: string; text: string; chip: string }> = {
  critical: {
    dot: "bg-red-500",
    text: "text-red-700",
    chip: "bg-red-50 text-red-700 border-red-200",
  },
  high: {
    dot: "bg-orange-500",
    text: "text-orange-700",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
  },
  medium: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
  },
  info: {
    dot: "bg-text-faint",
    text: "text-text-muted",
    chip: "bg-active-hover text-text-muted border-border-hairline",
  },
};

/** `4:12`, or `1:02:05` once past an hour. Mirrors `scan::format_timestamp`. */
export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** How long a finding stayed on screen, phrased for a person. */
export function formatVisibleFor(incident: Incident): string {
  const ms = incident.last_seen_ms - incident.first_seen_ms;
  if (ms < 1000) return "a single frame";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export function worstSeverity(incidents: Incident[]): Severity | null {
  for (const level of SEVERITY_ORDER) {
    if (incidents.some((i) => i.severity === level)) return level;
  }
  return null;
}

/**
 * Findings that need action, i.e. everything except the informational ones.
 * The verdict headline counts these, so a recording whose only finding is a
 * publishable Stripe key still reads as clean.
 */
export function actionableCount(incidents: Incident[]): number {
  return incidents.filter((i) => i.severity !== "info").length;
}

export async function scanVideo(path: string, fps: number): Promise<ScanResult> {
  return invoke<ScanResult>("scan_video", { path, fps });
}

export async function cancelScan(): Promise<boolean> {
  return invoke<boolean>("cancel_scan");
}

export async function detectorCount(): Promise<number> {
  return invoke<number>("detector_count");
}

export interface DetectorInfo {
  id: string;
  label: string;
  provider: string;
  severity: Severity;
}

/**
 * The detectors that actually run, read from the engine.
 *
 * Deliberately not a hand-written list on this side: the old code shipped a UI
 * that described redaction patterns the backend no longer had.
 */
export async function detectorList(): Promise<DetectorInfo[]> {
  return invoke<DetectorInfo[]>("detector_list");
}

export async function framePreview(
  path: string,
  frameIndex: number,
  fps: number
): Promise<string> {
  return invoke<string>("scan_frame_preview", { path, frameIndex, fps });
}

export async function onScanProgress(
  handler: (p: ScanProgress) => void
): Promise<UnlistenFn> {
  return listen<ScanProgress>("scan-progress", (event) => handler(event.payload));
}

/** Containers the backend will accept. Kept in step with `VIDEO_EXTENSIONS`. */
export const VIDEO_EXTENSIONS = ["mov", "mp4", "m4v"];

export function looksLikeVideo(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

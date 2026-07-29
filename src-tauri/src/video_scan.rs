//! Scanning a finished recording — the commands behind Vera's main screen.
//!
//! The pipeline is three parts, each of which already existed in some form:
//!
//! ```text
//!   video file
//!      │
//!      ├─ video-scan sidecar (Swift)   sample frames, dedupe by perceptual
//!      │                               hash, OCR with Vision
//!      │        one JSON line per frame
//!      ↓
//!   vera_core::detect                  OCR-tolerant secret detection
//!      │
//!      ↓
//!   vera_core::scan::aggregate         collapse per-frame hits into incidents
//! ```
//!
//! ## Why the carry-forward exists
//!
//! The sidecar skips OCR on frames that are visually identical to the previous
//! one — that is where nearly all the scan time is saved, because a screen
//! recording barely changes between frames. But a skipped frame is not an
//! absence of text: the secret is still on screen. So the previous frame's text
//! is carried forward to the skipped timestamps. Without that, a key visible
//! for 40 seconds would be reported as visible for one frame, and the user
//! would trim the wrong part of the video.
//!
//! ## What is never persisted
//!
//! Nothing. There is no scan table, no cache, no temp file. Findings live in
//! the returned value for as long as the window is open, and a `Finding` never
//! contains the secret itself — only its type, position and a masked preview.

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use vera_core::scan::{aggregate, FrameText, ScanSummary};

/// Set while a scan is running; cleared to ask that scan to stop early.
static SCAN_ACTIVE: AtomicBool = AtomicBool::new(false);
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Video containers the scanner accepts. Anything else is refused before a
/// process is spawned, so a mistyped path cannot hand an arbitrary file to the
/// decoder.
///
/// ## On the path itself
///
/// The audit's finding F-2 was that two commands read any path the webview
/// handed them. The fix there was to confine paths to an allowed directory.
/// That fix cannot apply here: the whole point is to open a recording the user
/// chose, and their recordings live wherever they live — the Desktop, Movies,
/// an external drive. There is no root to confine to.
///
/// What holds instead is narrower and stated plainly: the path must name an
/// existing file with one of these extensions, so the commands can only ever
/// be pointed at a video; and nothing they return exposes its contents in the
/// clear — a scan returns masked findings, and the preview command returns a
/// still from a file that was already proven decodable as video.
pub const VIDEO_EXTENSIONS: &[&str] = &["mov", "mp4", "m4v"];

/// How far apart two findings may be before they count as separate incidents.
const MERGE_GAP_MS: u64 = 4000;

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub frames_done: usize,
    pub frames_total: usize,
    pub duration_ms: u64,
    /// Findings so far. Lets the UI show hits while the scan is still running.
    pub incidents_so_far: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    #[serde(flatten)]
    pub summary: ScanSummary,
    pub file_name: String,
    /// Frames the sidecar actually ran OCR on, as opposed to skipped as
    /// duplicates. Surfaced so the number in the UI is honest about what was
    /// read rather than implying every frame was inspected separately.
    pub frames_ocred: usize,
    pub engine_version: String,
    pub cancelled: bool,
}

#[derive(Debug, Deserialize)]
struct SidecarLine {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
    #[serde(default)]
    total_frames: Option<usize>,
    #[serde(default)]
    frame_index: Option<u64>,
    #[serde(default)]
    timestamp_ms: Option<u64>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    skipped: Option<bool>,
    #[serde(default)]
    frames_ocred: Option<usize>,
}

/// Does this path look like a video we can scan?
pub fn has_video_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_ascii_lowercase();
            VIDEO_EXTENSIONS.iter().any(|v| *v == e)
        })
        .unwrap_or(false)
}

/// Turns the sidecar's frame lines into the frame list the engine consumes,
/// carrying text forward across skipped (visually identical) frames.
///
/// Split out from the process handling so it can be tested without a video, a
/// sidecar, or macOS. This is where the subtle bug would live.
pub fn build_frames(events: &[(u64, u64, Option<String>)]) -> Vec<FrameText> {
    let mut out = Vec::with_capacity(events.len());
    let mut carried = String::new();
    for (frame_index, timestamp_ms, text) in events {
        match text {
            Some(t) => carried = t.clone(),
            None => {
                // Skipped frame: identical picture, so identical text. If we
                // have not seen any text yet there is nothing to carry.
                if carried.is_empty() {
                    continue;
                }
            }
        }
        out.push(FrameText {
            timestamp_ms: *timestamp_ms,
            frame_index: *frame_index,
            text: carried.clone(),
        });
    }
    out
}

/// Scan a recording. Emits `scan-progress` events while it runs.
#[tauri::command]
pub async fn scan_video(
    app: tauri::AppHandle,
    path: String,
    fps: Option<f64>,
) -> Result<ScanResult, String> {
    let file = Path::new(&path);
    if !file.is_file() {
        return Err(format!("no file at {path}"));
    }
    if !has_video_extension(file) {
        return Err(format!(
            "Vera scans {} files. That one is something else.",
            VIDEO_EXTENSIONS.join(", ")
        ));
    }
    if SCAN_ACTIVE.swap(true, Ordering::SeqCst) {
        return Err("a scan is already running".into());
    }
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    // `run_scan` blocks for as long as the scan takes — minutes, on a long
    // recording. Running that directly in an async command ties up a runtime
    // worker for the whole time; the progress events it emits would queue up
    // behind it and the window would sit frozen on "Opening the file…" until
    // the scan finished. `spawn_blocking` puts it on a thread meant for this.
    let file = file.to_path_buf();
    let fps = fps.unwrap_or(1.0);
    let result = tauri::async_runtime::spawn_blocking(move || run_scan(&app, &file, fps))
        .await
        .unwrap_or_else(|e| Err(format!("the scan stopped unexpectedly: {e}")));

    // Whatever happened above, the flag has to come back down.
    SCAN_ACTIVE.store(false, Ordering::SeqCst);
    result
}

/// Accumulates the sidecar's JSONL output.
///
/// Separated from the process plumbing so the parsing can be driven by a
/// recorded transcript in a test. Everything interesting happens here — which
/// lines count as frames, what a skipped frame means, how a mid-stream error is
/// surfaced — and none of it should only ever be exercised on a Mac.
#[derive(Debug, Default)]
struct Ingest {
    /// `(frame_index, timestamp_ms, text)`; `None` text means a skipped frame.
    events: Vec<(u64, u64, Option<String>)>,
    total_frames: usize,
    duration_ms: u64,
    frames_ocred: usize,
    error: Option<String>,
}

impl Ingest {
    /// Consumes one line. Returns true when it was a frame, so the caller knows
    /// whether there is new progress worth reporting.
    fn push_line(&mut self, line: &str) -> bool {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return false;
        }
        let Ok(parsed) = serde_json::from_str::<SidecarLine>(trimmed) else {
            // Swift runtime warnings land on stdout; they are not fatal.
            return false;
        };

        match parsed.kind.as_str() {
            "meta" => {
                self.total_frames = parsed.total_frames.unwrap_or(0);
                self.duration_ms = parsed.duration_ms.unwrap_or(0);
                false
            }
            "frame" => {
                let idx = parsed.frame_index.unwrap_or(0);
                let ts = parsed.timestamp_ms.unwrap_or(0);
                let skipped = parsed.skipped.unwrap_or(false);
                self.events.push((idx, ts, if skipped { None } else { parsed.text }));
                true
            }
            "done" => {
                self.frames_ocred = parsed.frames_ocred.unwrap_or(0);
                false
            }
            "error" => {
                self.error = parsed.error;
                false
            }
            _ => false,
        }
    }

    fn progress(&self) -> ScanProgress {
        let partial = aggregate(&build_frames(&self.events), MERGE_GAP_MS);
        ScanProgress {
            frames_done: self.events.len(),
            frames_total: self.total_frames,
            duration_ms: self.duration_ms,
            incidents_so_far: partial.incidents.len(),
        }
    }

    fn summarise(&self) -> ScanSummary {
        let mut summary = aggregate(&build_frames(&self.events), MERGE_GAP_MS);
        // The sidecar knows the real duration; the aggregate only sees the last
        // frame it was given, which is short by up to one sampling interval.
        summary.duration_ms = self.duration_ms.max(summary.duration_ms);
        summary
    }
}

fn run_scan(app: &tauri::AppHandle, file: &Path, fps: f64) -> Result<ScanResult, String> {
    let helper = app
        .path()
        .resolve("binaries/video-scan", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("video-scan helper not found: {e}"))?;

    let mut child = Command::new(&helper)
        .arg(file)
        .arg("--fps")
        .arg(fps.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start the scanner: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "scanner produced no output".to_string())?;

    let mut ingest = Ingest::default();
    let mut cancelled = false;

    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if !ingest.push_line(&line) {
            continue;
        }

        // A frame landed. Emit progress every tenth one rather than on each:
        // at 4 fps over a long recording the event stream would outpace the UI.
        if ingest.events.len() % 10 == 0 {
            let _ = app.emit("scan-progress", ingest.progress());
        }

        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            cancelled = true;
            let _ = child.kill();
            break;
        }
    }

    let stderr = child
        .stderr
        .take()
        .map(|e| {
            BufReader::new(e)
                .lines()
                .map_while(Result::ok)
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    let _ = child.wait();

    if let Some(err) = ingest.error {
        return Err(err);
    }
    if ingest.events.is_empty() {
        let detail = if stderr.trim().is_empty() {
            String::new()
        } else {
            format!(" ({})", stderr.trim())
        };
        return Err(format!("no frames could be read from this file{detail}"));
    }

    let frames_ocred = ingest.frames_ocred;

    Ok(ScanResult {
        summary: ingest.summarise(),
        file_name: file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "recording".into()),
        frames_ocred,
        engine_version: vera_core::CORE_VERSION.to_string(),
        cancelled,
    })
}

/// Ask a running scan to stop. Returns whether one was running.
#[tauri::command]
pub fn cancel_scan() -> bool {
    let running = SCAN_ACTIVE.load(Ordering::SeqCst);
    if running {
        CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    }
    running
}

/// How many provider patterns the engine knows — shown in the UI.
#[tauri::command]
pub fn detector_count() -> usize {
    vera_core::pattern_count()
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectorInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub provider: &'static str,
    pub severity: &'static str,
}

/// The detectors, for the screen that lists them.
///
/// Read from the engine rather than restated in TypeScript. A hand-maintained
/// copy in the UI is how the old code ended up claiming to redact patterns it
/// no longer had — the list a user is shown has to be the list that actually
/// runs.
#[tauri::command]
pub fn detector_list() -> Vec<DetectorInfo> {
    vera_core::PATTERNS
        .iter()
        .map(|p| DetectorInfo {
            id: p.id,
            label: p.label,
            provider: p.provider,
            severity: p.severity.as_str(),
        })
        .collect()
}

/// A still from the scanned file at one frame index, as a data URL.
///
/// Used to show the user *where* a finding is. The extracted JPEG is read back
/// and deleted immediately, the same rule the timeline follows: a tool that
/// hunts for leaked credentials must not leave frames of your recording lying
/// around in the temp directory.
#[tauri::command]
pub async fn scan_frame_preview(
    app: tauri::AppHandle,
    path: String,
    frame_index: u64,
    fps: Option<f64>,
) -> Result<String, String> {
    // Decoding an exact frame out of a long file is not instant. Same reasoning
    // as `scan_video`: off the runtime worker, onto a blocking thread.
    tauri::async_runtime::spawn_blocking(move || extract_preview(&app, &path, frame_index, fps))
        .await
        .unwrap_or_else(|e| Err(format!("the preview stopped unexpectedly: {e}")))
}

fn extract_preview(
    app: &tauri::AppHandle,
    path: &str,
    frame_index: u64,
    fps: Option<f64>,
) -> Result<String, String> {
    let file = Path::new(path);
    if !file.is_file() {
        return Err(format!("no file at {path}"));
    }
    if !has_video_extension(file) {
        return Err("not a video file".into());
    }

    let helper = app
        .path()
        .resolve("binaries/frame-extract", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("frame-extract helper not found: {e}"))?;

    let out = std::env::temp_dir().join(format!(
        "vera-scan-{}-{}.jpg",
        std::process::id(),
        frame_index
    ));
    let output = Command::new(&helper)
        .arg(file)
        .arg(frame_index.to_string())
        .arg(&out)
        .arg(fps.unwrap_or(1.0).round().max(1.0).to_string())
        .output()
        .map_err(|e| format!("run frame-extract: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value =
        serde_json::from_str(stdout.trim()).unwrap_or(serde_json::Value::Null);

    if parsed.get("status").and_then(|s| s.as_str()) != Some("ok") {
        let _ = std::fs::remove_file(&out);
        let err = parsed
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("unknown error");
        return Err(format!("frame-extract failed: {err}"));
    }

    let bytes = std::fs::read(&out).map_err(|e| format!("read extracted frame: {e}"))?;
    let _ = std::fs::remove_file(&out);
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(i: u64, ts: u64, t: Option<&str>) -> (u64, u64, Option<String>) {
        (i, ts, t.map(|s| s.to_string()))
    }

    #[test]
    fn accepted_extensions() {
        assert!(has_video_extension(Path::new("/x/demo.mov")));
        assert!(has_video_extension(Path::new("/x/demo.MP4")));
        assert!(!has_video_extension(Path::new("/x/vera.db")));
        assert!(!has_video_extension(Path::new("/x/notes.txt")));
        assert!(!has_video_extension(Path::new("/x/noext")));
    }

    #[test]
    fn skipped_frames_inherit_the_previous_text() {
        // This is the whole point of the carry-forward: a key that stays on
        // screen must keep its time range, even though only the first frame
        // was actually read.
        let events = vec![
            ev(0, 0, Some("sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd")),
            ev(1, 1000, None),
            ev(2, 2000, None),
            ev(3, 3000, None),
        ];
        let frames = build_frames(&events);
        assert_eq!(frames.len(), 4);
        assert!(frames.iter().all(|f| f.text.contains("sk-proj-")));

        let summary = aggregate(&frames, MERGE_GAP_MS);
        assert_eq!(summary.incidents.len(), 1);
        assert_eq!(summary.incidents[0].first_seen_ms, 0);
        assert_eq!(
            summary.incidents[0].last_seen_ms, 3000,
            "the secret was visible for the whole run, not just the read frame"
        );
    }

    #[test]
    fn new_text_replaces_the_carried_text() {
        let events = vec![
            ev(0, 0, Some("sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd")),
            ev(1, 1000, None),
            ev(2, 2000, Some("nothing to see here")),
            ev(3, 3000, None),
        ];
        let frames = build_frames(&events);
        assert!(frames[1].text.contains("sk-proj-"));
        assert!(!frames[2].text.contains("sk-proj-"));
        assert!(!frames[3].text.contains("sk-proj-"));

        let summary = aggregate(&frames, MERGE_GAP_MS);
        assert_eq!(summary.incidents[0].last_seen_ms, 1000);
    }

    #[test]
    fn leading_skips_before_any_text_are_dropped() {
        // Nothing has been read yet, so there is nothing to carry. These frames
        // must not turn into empty entries that inflate frames_scanned.
        let events = vec![ev(0, 0, None), ev(1, 1000, None), ev(2, 2000, Some("hello"))];
        let frames = build_frames(&events);
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].frame_index, 2);
    }

    #[test]
    fn a_clean_recording_produces_no_incidents() {
        let events = vec![
            ev(0, 0, Some("npm run dev")),
            ev(1, 1000, None),
            ev(2, 2000, Some("commit 3c198ac on main")),
        ];
        let summary = aggregate(&build_frames(&events), MERGE_GAP_MS);
        assert!(summary.is_clean(), "unexpected: {:#?}", summary.incidents);
    }

    #[test]
    fn empty_event_list_is_not_a_panic() {
        assert!(build_frames(&[]).is_empty());
    }

    // ---- The full pipeline, driven by a recorded sidecar transcript ----
    //
    // Everything below the Swift boundary runs here: JSONL parsing, the
    // skipped-frame carry-forward, detection, and aggregation into incidents.
    // The only part these cannot reach is Vision itself, so the transcripts use
    // text with the damage Vision actually produces.

    fn drive(lines: &[&str]) -> Ingest {
        let mut ingest = Ingest::default();
        for line in lines {
            ingest.push_line(line);
        }
        ingest
    }

    #[test]
    fn a_recording_with_a_leaked_key_is_reported_end_to_end() {
        let ingest = drive(&[
            r#"{"type":"meta","duration_ms":12000,"total_frames":12}"#,
            r#"{"type":"frame","frame_index":0,"timestamp_ms":0,"text":"$ npm run dev","skipped":false}"#,
            r#"{"type":"frame","frame_index":1,"timestamp_ms":1000,"skipped":true}"#,
            r#"{"type":"frame","frame_index":2,"timestamp_ms":2000,"text":"export OPENAI_API_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd","skipped":false}"#,
            r#"{"type":"frame","frame_index":3,"timestamp_ms":3000,"skipped":true}"#,
            r#"{"type":"frame","frame_index":4,"timestamp_ms":4000,"skipped":true}"#,
            r#"{"type":"frame","frame_index":5,"timestamp_ms":5000,"text":"server listening on 3000","skipped":false}"#,
            r#"{"type":"done","frames_scanned":6,"frames_ocred":3}"#,
        ]);

        let summary = ingest.summarise();
        assert_eq!(summary.incidents.len(), 1, "got {:#?}", summary.incidents);

        let hit = &summary.incidents[0];
        assert_eq!(hit.pattern_id, "openai_project");
        assert_eq!(hit.severity, vera_core::Severity::Critical);
        assert_eq!(hit.first_seen_ms, 2000);
        // Visible across the two skipped frames that followed it.
        assert_eq!(hit.last_seen_ms, 4000);
        // The jump target has to be the frame it first appeared on.
        assert_eq!(hit.first_frame_index, 2);
        // And the secret must not have survived into the result.
        assert!(!hit.preview.contains("T3xK9mPq2LvR8wZa5NbYc7Hd"));

        assert_eq!(ingest.frames_ocred, 3);
        assert_eq!(summary.duration_ms, 12000, "duration comes from the sidecar");
    }

    #[test]
    fn a_key_mangled_by_ocr_is_still_found() {
        // This is the difference between Vera and running gitleaks on a
        // transcript. Vision returns `0` for `o`, `l` for `1`, `5` for `S`, and
        // an en dash for a hyphen. An exact pattern finds none of these.
        for damaged in [
            "sk-pr0j-T3xK9mPq2LvR8wZa5NbYc7Hd",
            "5k-proj-T3xK9mPq2LvR8wZa5NbYc7Hd",
            "sk\u{2011}proj\u{2013}T3xK9mPq2LvR8wZa5NbYc7Hd",
        ] {
            let ingest = drive(&[
                r#"{"type":"meta","duration_ms":2000,"total_frames":2}"#,
                &format!(
                    r#"{{"type":"frame","frame_index":0,"timestamp_ms":0,"text":"{damaged}","skipped":false}}"#
                ),
            ]);
            let summary = ingest.summarise();
            assert_eq!(
                summary.incidents.len(),
                1,
                "OCR-damaged key was missed: {damaged}"
            );
        }
    }

    #[test]
    fn a_tutorial_recording_stays_clean() {
        // The screen of someone recording a tutorial. Every line here looks
        // like a secret to a naive scanner, and none of them is one. If this
        // test ever fails, the product is unusable for its own audience.
        let ingest = drive(&[
            r#"{"type":"meta","duration_ms":8000,"total_frames":8}"#,
            r#"{"type":"frame","frame_index":0,"timestamp_ms":0,"text":"const apiKey = process.env.OPENAI_API_KEY","skipped":false}"#,
            r#"{"type":"frame","frame_index":1,"timestamp_ms":1000,"text":"OPENAI_API_KEY=sk-your-api-key-here","skipped":false}"#,
            r#"{"type":"frame","frame_index":2,"timestamp_ms":2000,"text":"aws_access_key_id = AKIAIOSFODNN7EXAMPLE","skipped":false}"#,
            r#"{"type":"frame","frame_index":3,"timestamp_ms":3000,"text":"commit a074f80ab12cd34ef56789012345678901234567","skipped":false}"#,
            r#"{"type":"frame","frame_index":4,"timestamp_ms":4000,"text":"id: dbf38fa8-c92d-5164-853a-fd6f17eb9cc9","skipped":false}"#,
            r#"{"type":"frame","frame_index":5,"timestamp_ms":5000,"text":"dist/assets/main.a3f9b2c1.js  373.45 kB","skipped":false}"#,
            r#"{"type":"frame","frame_index":6,"timestamp_ms":6000,"text":"vite v7.0.4  ready at http://localhost:5173","skipped":false}"#,
            r#"{"type":"frame","frame_index":7,"timestamp_ms":7000,"text":"token: ${{ secrets.GITHUB_TOKEN }}","skipped":false}"#,
            r#"{"type":"done","frames_scanned":8,"frames_ocred":8}"#,
        ]);

        let summary = ingest.summarise();
        assert!(
            summary.is_clean(),
            "false alarms on an ordinary tutorial screen: {:#?}",
            summary.incidents
        );
    }

    #[test]
    fn several_providers_in_one_recording_are_ranked_worst_first() {
        let ingest = drive(&[
            r#"{"type":"meta","duration_ms":4000,"total_frames":4}"#,
            r#"{"type":"frame","frame_index":0,"timestamp_ms":0,"text":"pk_live_T3xK9mPq2LvR8wZa5NbYc7Hd","skipped":false}"#,
            r#"{"type":"frame","frame_index":1,"timestamp_ms":1000,"text":"-----BEGIN RSA PRIVATE KEY-----","skipped":false}"#,
            r#"{"type":"frame","frame_index":2,"timestamp_ms":2000,"text":"DATABASE_URL=postgres://admin:Hunter2Pass9x@db.example.com:5432/app","skipped":false}"#,
            r#"{"type":"done","frames_scanned":3,"frames_ocred":3}"#,
        ]);

        let summary = ingest.summarise();
        let ids: Vec<&str> = summary.incidents.iter().map(|i| i.pattern_id.as_str()).collect();
        assert!(ids.contains(&"private_key"), "got {ids:?}");
        assert!(ids.contains(&"db_uri"), "got {ids:?}");
        assert!(ids.contains(&"stripe_publishable"), "got {ids:?}");

        // Critical first, and the publishable key — which is safe to show —
        // must not be what the headline counts.
        assert_eq!(summary.incidents[0].severity, vera_core::Severity::Critical);
        assert_eq!(
            summary.incidents.last().unwrap().severity,
            vera_core::Severity::Info
        );
    }

    #[test]
    fn a_sidecar_error_line_is_surfaced_not_swallowed() {
        let ingest = drive(&[r#"{"type":"error","error":"could not read a duration from this file"}"#]);
        assert_eq!(
            ingest.error.as_deref(),
            Some("could not read a duration from this file")
        );
        assert!(ingest.events.is_empty());
    }

    #[test]
    fn noise_on_stdout_does_not_derail_the_scan() {
        // Swift runtime warnings and blank lines arrive mixed into the stream.
        let ingest = drive(&[
            "",
            "objc[4242]: class _TtC10Foundation is implemented in two places",
            r#"{"type":"meta","duration_ms":1000,"total_frames":1}"#,
            "   ",
            r#"{"type":"frame","frame_index":0,"timestamp_ms":0,"text":"ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rW4uXy","skipped":false}"#,
            "not json at all",
            r#"{"type":"done","frames_scanned":1,"frames_ocred":1}"#,
        ]);
        assert_eq!(ingest.events.len(), 1);
        assert_eq!(ingest.summarise().incidents.len(), 1);
    }

    #[test]
    fn only_frame_lines_count_as_progress() {
        // The caller reports progress on a true return; meta/done/error must
        // not advance the bar.
        let mut ingest = Ingest::default();
        assert!(!ingest.push_line(r#"{"type":"meta","duration_ms":1000,"total_frames":1}"#));
        assert!(ingest.push_line(
            r#"{"type":"frame","frame_index":0,"timestamp_ms":0,"text":"hi","skipped":false}"#
        ));
        assert!(!ingest.push_line(r#"{"type":"done","frames_scanned":1,"frames_ocred":1}"#));
        assert_eq!(ingest.progress().frames_done, 1);
        assert_eq!(ingest.progress().frames_total, 1);
    }
}

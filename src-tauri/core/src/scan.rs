//! Frame aggregation.
//!
//! A secret that stays visible for 6 seconds produces six frame hits at 1 fps.
//! The user wants **one** entry with a time range for that, not six rows. This
//! module merges frame-level findings into incidents.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::detect::{detect_in_text, Finding};
use crate::patterns::Severity;

/// One OCR result for exactly one frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameText {
    /// Position in the video, in milliseconds.
    pub timestamp_ms: u64,
    /// Running frame index (used to jump to the spot).
    pub frame_index: u64,
    pub text: String,
}

/// A merged incident spanning a time range.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Incident {
    pub pattern_id: String,
    pub label: String,
    pub provider: String,
    pub severity: Severity,
    pub preview: String,
    /// First sighting, in ms.
    pub first_seen_ms: u64,
    /// Last sighting, in ms.
    pub last_seen_ms: u64,
    /// Frame index of the first sighting — this is where the UI jumps.
    pub first_frame_index: u64,
    /// How many frames showed this finding?
    pub frame_count: usize,
    /// Highest confidence across all frames.
    pub confidence: f64,
}

impl Incident {
    /// Visible duration in milliseconds. Zero for a single frame.
    pub fn duration_ms(&self) -> u64 {
        self.last_seen_ms.saturating_sub(self.first_seen_ms)
    }
}

/// Summary of a complete scan.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanSummary {
    pub incidents: Vec<Incident>,
    pub frames_scanned: usize,
    pub frames_with_findings: usize,
    /// Scanned video duration in ms (timestamp of the last frame).
    pub duration_ms: u64,
}

impl ScanSummary {
    pub fn is_clean(&self) -> bool {
        self.incidents.is_empty()
    }

    pub fn count_by_severity(&self, s: Severity) -> usize {
        self.incidents.iter().filter(|i| i.severity == s).count()
    }

    /// Worst severity present — drives the traffic light in the UI.
    pub fn worst_severity(&self) -> Option<Severity> {
        self.incidents.iter().map(|i| i.severity).max()
    }
}

/// The key frame findings are grouped under.
///
/// The finding itself must not be stored, so grouping happens over
/// (pattern, preview, token length). That is stable enough: the same key in
/// consecutive frames produces the same mask. An OCR error can flip the mask —
/// then two incidents appear instead of one. That is the safe direction (better
/// to warn twice than to stay silent once).
fn incident_key(f: &Finding) -> (String, String, usize) {
    (f.pattern_id.clone(), f.preview.clone(), f.token_len)
}

/// Merges frame OCR results into a scan summary.
///
/// `merge_gap_ms`: if a finding disappears briefly (cursor in front of it, a
/// window overlapping it) and comes back, it is treated as the same incident as
/// long as the gap is smaller than this. 4000 ms is a good default.
pub fn aggregate(frames: &[FrameText], merge_gap_ms: u64) -> ScanSummary {
    let mut order: Vec<(String, String, usize)> = Vec::new();
    let mut groups: HashMap<(String, String, usize), Vec<(u64, u64, Finding)>> = HashMap::new();
    let mut frames_with_findings = 0usize;
    let mut duration_ms = 0u64;

    for frame in frames {
        duration_ms = duration_ms.max(frame.timestamp_ms);
        let findings = detect_in_text(&frame.text);
        if !findings.is_empty() {
            frames_with_findings += 1;
        }
        for f in findings {
            let key = incident_key(&f);
            if !groups.contains_key(&key) {
                order.push(key.clone());
            }
            groups
                .entry(key)
                .or_default()
                .push((frame.timestamp_ms, frame.frame_index, f));
        }
    }

    let mut incidents = Vec::new();
    for key in order {
        let mut hits = groups.remove(&key).unwrap_or_default();
        hits.sort_by_key(|(ts, _, _)| *ts);

        // Start a new incident when the gap exceeds merge_gap_ms.
        let mut run: Vec<(u64, u64, Finding)> = Vec::new();
        let flush = |run: &mut Vec<(u64, u64, Finding)>, out: &mut Vec<Incident>| {
            if run.is_empty() {
                return;
            }
            let first = &run[0];
            let last = &run[run.len() - 1];
            let best_conf = run
                .iter()
                .map(|(_, _, f)| f.confidence)
                .fold(0.0f64, f64::max);
            out.push(Incident {
                pattern_id: first.2.pattern_id.clone(),
                label: first.2.label.clone(),
                provider: first.2.provider.clone(),
                severity: first.2.severity,
                preview: first.2.preview.clone(),
                first_seen_ms: first.0,
                last_seen_ms: last.0,
                first_frame_index: first.1,
                frame_count: run.len(),
                confidence: best_conf,
            });
            run.clear();
        };

        for hit in hits {
            if let Some(prev) = run.last() {
                if hit.0.saturating_sub(prev.0) > merge_gap_ms {
                    flush(&mut run, &mut incidents);
                }
            }
            run.push(hit);
        }
        flush(&mut run, &mut incidents);
    }

    // Worst first, then chronological.
    incidents.sort_by(|a, b| {
        b.severity
            .cmp(&a.severity)
            .then(a.first_seen_ms.cmp(&b.first_seen_ms))
    });

    ScanSummary {
        incidents,
        frames_scanned: frames.len(),
        frames_with_findings,
        duration_ms,
    }
}

/// Formats a timestamp as `m:ss` or `h:mm:ss`.
pub fn format_timestamp(ms: u64) -> String {
    let total = ms / 1000;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(idx: u64, ms: u64, text: &str) -> FrameText {
        FrameText { timestamp_ms: ms, frame_index: idx, text: text.into() }
    }

    #[test]
    fn timestamps_format_correctly() {
        assert_eq!(format_timestamp(0), "0:00");
        assert_eq!(format_timestamp(65_000), "1:05");
        assert_eq!(format_timestamp(252_000), "4:12");
        assert_eq!(format_timestamp(3_725_000), "1:02:05");
    }

    #[test]
    fn repeated_frames_collapse_to_one_incident() {
        let secret = "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
        let frames: Vec<FrameText> = (0..6)
            .map(|i| frame(i, i * 1000, &format!("terminal output {secret}")))
            .collect();

        let s = aggregate(&frames, 4000);
        assert_eq!(s.incidents.len(), 1, "six frames must collapse into one incident");
        assert_eq!(s.incidents[0].frame_count, 6);
        assert_eq!(s.incidents[0].first_seen_ms, 0);
        assert_eq!(s.incidents[0].last_seen_ms, 5000);
        assert_eq!(s.incidents[0].duration_ms(), 5000);
        assert_eq!(s.frames_with_findings, 6);
    }

    #[test]
    fn large_gap_splits_incidents() {
        let secret = "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
        let frames = vec![
            frame(0, 0, secret),
            frame(1, 1000, secret),
            // 60 s gap
            frame(2, 61_000, secret),
            frame(3, 62_000, secret),
        ];
        let s = aggregate(&frames, 4000);
        assert_eq!(s.incidents.len(), 2);
    }

    #[test]
    fn clean_video_reports_clean() {
        let frames = vec![
            frame(0, 0, "Welcome to this tutorial"),
            frame(1, 1000, "npm install && npm run dev"),
            frame(2, 2000, "commit 3c198ac on main"),
        ];
        let s = aggregate(&frames, 4000);
        assert!(s.is_clean(), "unexpected findings: {:#?}", s.incidents);
        assert_eq!(s.frames_scanned, 3);
        assert_eq!(s.frames_with_findings, 0);
    }

    #[test]
    fn worst_severity_and_counts() {
        let frames = vec![
            frame(0, 0, "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd"),
            frame(1, 1000, "pk_live_T3xK9mPq2LvR8wZa5NbYc7Hd"),
        ];
        let s = aggregate(&frames, 4000);
        assert_eq!(s.worst_severity(), Some(Severity::Critical));
        assert_eq!(s.count_by_severity(Severity::Critical), 1);
        assert_eq!(s.count_by_severity(Severity::Info), 1);
        // Critical has to be on top
        assert_eq!(s.incidents[0].severity, Severity::Critical);
    }

    #[test]
    fn duration_tracks_last_frame() {
        let frames = vec![frame(0, 0, "a"), frame(1, 9000, "b")];
        assert_eq!(aggregate(&frames, 4000).duration_ms, 9000);
    }
}

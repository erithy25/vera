//! Frame-Aggregation.
//!
//! Ein Secret, das 6 Sekunden lang sichtbar ist, erzeugt bei 1 fps sechs
//! Frame-Treffer. Der Nutzer will davon **einen** Eintrag mit einem Zeitbereich
//! sehen, nicht sechs Zeilen. Dieses Modul führt Frame-Funde zu Vorfällen
//! zusammen.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::detect::{detect_in_text, Finding};
use crate::patterns::Severity;

/// Ein OCR-Ergebnis für genau ein Frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameText {
    /// Position im Video in Millisekunden.
    pub timestamp_ms: u64,
    /// Fortlaufender Frame-Index (für den Sprung zur Stelle).
    pub frame_index: u64,
    pub text: String,
}

/// Ein zusammengefasster Vorfall über einen Zeitbereich.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Incident {
    pub pattern_id: String,
    pub label: String,
    pub provider: String,
    pub severity: Severity,
    pub preview: String,
    /// Erste Sichtung in ms.
    pub first_seen_ms: u64,
    /// Letzte Sichtung in ms.
    pub last_seen_ms: u64,
    /// Frame-Index der ersten Sichtung — hierhin springt die UI.
    pub first_frame_index: u64,
    /// Wie viele Frames zeigten diesen Fund?
    pub frame_count: usize,
    /// Höchste Konfidenz über alle Frames.
    pub confidence: f64,
}

impl Incident {
    /// Sichtbarkeitsdauer in Millisekunden. Bei einem einzelnen Frame 0.
    pub fn duration_ms(&self) -> u64 {
        self.last_seen_ms.saturating_sub(self.first_seen_ms)
    }
}

/// Zusammenfassung eines kompletten Scans.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanSummary {
    pub incidents: Vec<Incident>,
    pub frames_scanned: usize,
    pub frames_with_findings: usize,
    /// Gescannte Videodauer in ms (letzter Frame-Zeitstempel).
    pub duration_ms: u64,
}

impl ScanSummary {
    pub fn is_clean(&self) -> bool {
        self.incidents.is_empty()
    }

    pub fn count_by_severity(&self, s: Severity) -> usize {
        self.incidents.iter().filter(|i| i.severity == s).count()
    }

    /// Höchste vorkommende Schwere — steuert die Ampel in der UI.
    pub fn worst_severity(&self) -> Option<Severity> {
        self.incidents.iter().map(|i| i.severity).max()
    }
}

/// Schlüssel, unter dem Frame-Funde zusammengefasst werden.
///
/// Der Fund selbst darf nicht gespeichert werden, deshalb wird über
/// (Muster, Vorschau, Tokenlänge) gruppiert. Das ist stabil genug: derselbe Key
/// in aufeinanderfolgenden Frames erzeugt dieselbe Maske. Ein OCR-Fehler kann
/// die Maske kippen — dann entstehen zwei Vorfälle statt einem. Das ist die
/// sichere Richtung (lieber zweimal warnen als einmal verschweigen).
fn incident_key(f: &Finding) -> (String, String, usize) {
    (f.pattern_id.clone(), f.preview.clone(), f.token_len)
}

/// Führt Frame-OCR-Ergebnisse zu einer Scan-Zusammenfassung zusammen.
///
/// `merge_gap_ms`: Verschwindet ein Fund kurz (Cursor davor, Fenster kurz
/// überlagert) und taucht wieder auf, wird er als derselbe Vorfall behandelt,
/// solange die Lücke kleiner ist. 4000 ms ist ein guter Standardwert.
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

        // Bei einer Lücke > merge_gap_ms einen neuen Vorfall beginnen.
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

    // Schlimmste zuerst, dann chronologisch.
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

/// Formatiert einen Zeitstempel als `m:ss` bzw. `h:mm:ss`.
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
        assert_eq!(s.incidents.len(), 1, "sechs Frames müssen ein Vorfall werden");
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
            // 60 s Lücke
            frame(2, 61_000, secret),
            frame(3, 62_000, secret),
        ];
        let s = aggregate(&frames, 4000);
        assert_eq!(s.incidents.len(), 2);
    }

    #[test]
    fn clean_video_reports_clean() {
        let frames = vec![
            frame(0, 0, "Willkommen zu diesem Tutorial"),
            frame(1, 1000, "npm install && npm run dev"),
            frame(2, 2000, "commit 3c198ac auf main"),
        ];
        let s = aggregate(&frames, 4000);
        assert!(s.is_clean(), "unerwartete Funde: {:#?}", s.incidents);
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
        // Kritisch muss oben stehen
        assert_eq!(s.incidents[0].severity, Severity::Critical);
    }

    #[test]
    fn duration_tracks_last_frame() {
        let frames = vec![frame(0, 0, "a"), frame(1, 9000, "b")];
        assert_eq!(aggregate(&frames, 4000).duration_ms, 9000);
    }
}

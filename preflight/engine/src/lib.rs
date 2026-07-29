//! # preflight-engine
//!
//! OCR-fehlertolerante Secret-Erkennung für Bildschirmaufnahmen.
//!
//! ## Warum das kein gitleaks ist
//!
//! Dateibasierte Secret-Scanner (gitleaks, trufflehog) setzen **perfekten Text**
//! voraus. Sie matchen exakte Regex-Muster gegen Dateiinhalte.
//!
//! Preflight bekommt Text, der nie korrekt gelesen wurde. Vision/Tesseract
//! liefern für `sk-proj-AbC1` je nach Schriftart, Farbschema und Auflösung
//! `sk-pr0j-AbCl` oder `5k-proj-A6C1`. Jedes exakte Muster scheitert daran.
//!
//! Die Antwort dieses Crates ist eine Zerlegung:
//!
//! | Teil | Behandlung |
//! |---|---|
//! | Präfix (`sk-proj-`) | unscharfer Vergleich im Verwechslungsraum, Levenshtein ≤ 2 |
//! | Körper | nur Länge + Zeichensatz + Entropie, **nie** exakt |
//! | Kontext | Zuweisungen, PEM-Header, Verbindungsstrings zeilenweise |
//! | Negativfilter | Git-SHAs, UUIDs, Build-Hashes — und vor allem Tutorial-Platzhalter |
//!
//! Ein einzelner OCR-Fehler verändert weder Länge noch Zusammensetzung des
//! Körpers. Genau deshalb überlebt die Erkennung ihn.
//!
//! ## Datenschutz als Invariante
//!
//! Ein [`detect::Finding`] enthält **niemals** das gefundene Secret — nur Typ,
//! Position und eine maskierte Vorschau. Diese Zusage wird durch Tests
//! abgesichert (`tests/privacy.rs`).
//!
//! ## Beispiel
//!
//! ```
//! use preflight_engine::{aggregate, FrameText};
//!
//! let frames = vec![FrameText {
//!     timestamp_ms: 252_000,
//!     frame_index: 252,
//!     text: "export OPENAI_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd".into(),
//! }];
//!
//! let summary = aggregate(&frames, 4000);
//! assert!(!summary.is_clean());
//! ```

pub mod detect;
pub mod entropy;
pub mod negative;
pub mod ocr;
pub mod patterns;
pub mod scan;

pub use detect::{detect_in_text, detect_with_report, DetectionReport, Finding, Rejected};
pub use patterns::{Severity, PATTERNS};
pub use scan::{aggregate, format_timestamp, FrameText, Incident, ScanSummary};

/// Version der Engine. Wird im Scan-Report mitgeschrieben, damit ein Report
/// später einer Erkennungsversion zugeordnet werden kann.
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Wie viele Anbieter-Muster kennt die Engine? Für die UI ("erkennt N Typen").
pub fn pattern_count() -> usize {
    PATTERNS.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_set() {
        assert!(!ENGINE_VERSION.is_empty());
    }

    #[test]
    fn has_patterns() {
        assert!(pattern_count() >= 15, "zu wenige Muster: {}", pattern_count());
    }
}

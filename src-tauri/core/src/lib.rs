//! # vera-core
//!
//! Vera's detection engine, **free of any Tauri dependency**.
//!
//! ## Why this crate exists
//!
//! Before the rebuild, all logic lived in a single file: `src-tauri/src/lib.rs`,
//! 2,292 lines, not one `mod`, eight responsibilities side by side. Tauri only
//! builds on macOS, so none of it could be exercised anywhere — the result was
//! zero tests across 12,141 lines of code. Logic that needed to run in more
//! than one place was copied across language boundaries instead of shared, and
//! the copies drifted apart in ways that mattered.
//!
//! This crate holds the logic that needs no platform. It builds and tests
//! anywhere; `src-tauri` is a thin shell around it.
//!
//! ## What the engine does
//!
//! Finds API keys, tokens and credentials that are legible in a screen
//! recording, working from text that was read by OCR and is therefore wrong.
//!
//! It is deliberately not a regex scanner. File-based tools (gitleaks,
//! trufflehog) assume perfect text. Here the text never was: Vision returns
//! `sk-pr0j-AbCl` for `sk-proj-AbC1` depending on the font and the resolution,
//! and every exact pattern fails on that. So each pattern is split in two —
//!
//! | Part | How it is matched |
//! |---|---|
//! | Prefix (`sk-proj-`) | fuzzily, in confusion space, Levenshtein ≤ 2 ([`ocr`]) |
//! | Body | length, character set and randomness only — never exactly ([`entropy`]) |
//! | Context | assignments, PEM headers, connection strings, line by line ([`detect`]) |
//! | Negative filters | git SHAs, UUIDs, build hashes, and above all tutorial placeholders ([`negative`]) |
//!
//! A single OCR error changes neither the length nor the composition of the
//! body. That is precisely why detection survives it.
//!
//! ## The privacy invariant
//!
//! A [`Finding`] never contains the secret that was found — only its type, its
//! position, and a masked preview.

pub mod detect;
pub mod entropy;
pub mod negative;
pub mod ocr;
pub mod patterns;
pub mod scan;
pub mod schema;

pub use detect::{detect_in_text, detect_with_report, DetectionReport, Finding, Rejected};
pub use patterns::{Severity, PATTERNS};
pub use scan::{aggregate, format_timestamp, FrameText, Incident, ScanSummary};

/// Core logic version. Deliberately pinned to the app version.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// How many provider patterns does the engine know? Shown in the UI.
pub fn pattern_count() -> usize {
    PATTERNS.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_set() {
        assert!(!CORE_VERSION.is_empty());
    }

    #[test]
    fn has_a_useful_number_of_patterns() {
        assert!(pattern_count() >= 15, "too few patterns: {}", pattern_count());
    }

    #[test]
    fn a_finding_never_carries_the_secret() {
        // The invariant the whole product rests on, asserted end to end.
        let secret = "T3xK9mPq2LvR8wZa5NbYc7Hd";
        let text = format!("export OPENAI_API_KEY=sk-proj-{secret}");
        let findings = detect_in_text(&text);
        assert!(!findings.is_empty(), "the planted key was not detected");
        for f in &findings {
            assert!(
                !f.preview.contains(secret),
                "preview leaked the secret: {}",
                f.preview
            );
        }
    }
}

//! Guards the redaction patterns against drifting apart again.
//!
//! ## Why this test exists
//!
//! The audit found redaction implemented three times, in three languages, with
//! differences that were security-relevant — an OpenAI key of 30 characters was
//! redacted on the Swift path and written to the database in plaintext on the
//! Rust path.
//!
//! Two of the three copies are gone. The Swift one has to stay: it runs inside
//! the capture sidecar, before any text leaves that process. Keeping a second
//! copy is the right call there — but only if it cannot silently drift.
//!
//! This test reads the actual Swift source and compares its pattern list to the
//! canonical one in `redact.rs`. If someone adds a provider to Rust and forgets
//! Swift (or the other way around), the build fails with the exact difference.
//!
//! It is deliberately a test and not a build script: a build script would run
//! on the developer's machine only, while this runs in CI too.

use std::path::PathBuf;
use vera_core::redact::SECRET_PATTERNS;

const BEGIN: &str = "// BEGIN CANONICAL SECRET PATTERNS";
const END: &str = "// END CANONICAL SECRET PATTERNS";

fn swift_source() -> String {
    // CARGO_MANIFEST_DIR is src-tauri/core; the sidecar lives in src-tauri/src.
    let path: PathBuf = [env!("CARGO_MANIFEST_DIR"), "..", "src", "frame-capture.swift"]
        .iter()
        .collect();
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

/// Extracts the regex strings from the marked block, undoing Swift's string
/// escaping so they can be compared to the Rust raw strings.
fn swift_patterns(src: &str) -> Vec<String> {
    let start = src
        .find(BEGIN)
        .unwrap_or_else(|| panic!("marker '{BEGIN}' missing from frame-capture.swift"));
    let end = src
        .find(END)
        .unwrap_or_else(|| panic!("marker '{END}' missing from frame-capture.swift"));
    assert!(end > start, "markers are in the wrong order");

    let block = &src[start..end];
    let mut out = Vec::new();

    for line in block.lines() {
        let line = line.trim();
        if !line.starts_with('"') {
            continue;
        }
        // Take the literal up to the closing quote, honouring escapes.
        let bytes: Vec<char> = line.chars().collect();
        let mut literal = String::new();
        let mut i = 1usize;
        while i < bytes.len() {
            match bytes[i] {
                '\\' if i + 1 < bytes.len() => {
                    // Swift doubles backslashes; collapse them back.
                    literal.push(bytes[i + 1]);
                    i += 2;
                }
                '"' => break,
                c => {
                    literal.push(c);
                    i += 1;
                }
            }
        }
        out.push(literal);
    }
    out
}

#[test]
fn swift_sidecar_has_the_same_patterns_as_the_rust_core() {
    let src = swift_source();
    let swift = swift_patterns(&src);
    let rust: Vec<String> = SECRET_PATTERNS.iter().map(|p| p.regex.to_string()).collect();

    assert!(!swift.is_empty(), "no patterns found inside the marked block");

    if swift != rust {
        let mut msg = String::from(
            "\nRedaction patterns have drifted apart.\n\
             Fix: change src-tauri/core/src/redact.rs, then mirror the block in\n\
             src-tauri/src/frame-capture.swift between the CANONICAL markers.\n\n",
        );
        let max = swift.len().max(rust.len());
        for i in 0..max {
            let r = rust.get(i).map(String::as_str).unwrap_or("<missing>");
            let s = swift.get(i).map(String::as_str).unwrap_or("<missing>");
            if r != s {
                let name = SECRET_PATTERNS.get(i).map(|p| p.name).unwrap_or("?");
                msg.push_str(&format!("  [{i}] {name}\n    rust : {r}\n    swift: {s}\n"));
            }
        }
        panic!("{msg}");
    }
}

#[test]
fn swift_uses_the_same_replacement_token() {
    let src = swift_source();
    assert!(
        src.contains(vera_core::redact::REDACTED),
        "Swift sidecar does not use the '{}' replacement token — redacted spans \
         would look different depending on which path produced them",
        vera_core::redact::REDACTED
    );
}

#[test]
fn swift_still_disables_ocr_language_correction() {
    // Vision's language correction "improves" sk-proj-… into words. With it on,
    // keys become unrecognisable to every pattern on both sides.
    let src = swift_source();
    assert!(
        src.contains("usesLanguageCorrection = false"),
        "OCR language correction must stay off, or secrets stop being detectable"
    );
}

#[test]
fn the_marked_block_is_not_accidentally_empty() {
    let src = swift_source();
    let swift = swift_patterns(&src);
    assert_eq!(
        swift.len(),
        SECRET_PATTERNS.len(),
        "Swift block has {} patterns, Rust has {}",
        swift.len(),
        SECRET_PATTERNS.len()
    );
}

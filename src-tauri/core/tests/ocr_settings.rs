//! Guards the one Vision setting the whole product depends on.
//!
//! ## Why this test exists
//!
//! `VNRecognizeTextRequest.usesLanguageCorrection` defaults to **true**. With
//! it on, Vision does not return what is on screen — it returns what it thinks
//! the text was meant to say. `sk-proj-T3xK9mPq` is not a word, so it gets
//! "corrected" into something word-shaped, and the key stops matching anything
//! the engine looks for.
//!
//! The failure mode is the dangerous kind: the scan still runs, still reports
//! frames read, and still finishes with a green verdict. It just silently stops
//! finding the thing it exists to find.
//!
//! It is one line in a Swift file that nothing else references, which is
//! exactly the kind of line that gets "cleaned up". So it is asserted here,
//! where it fails the build instead of failing a user.

use std::path::PathBuf;

fn sidecar_source(name: &str) -> String {
    // CARGO_MANIFEST_DIR is src-tauri/core; the sidecars live in src-tauri/src.
    let path: PathBuf = [env!("CARGO_MANIFEST_DIR"), "..", "src", name].iter().collect();
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

#[test]
fn video_scan_disables_ocr_language_correction() {
    let src = sidecar_source("video-scan.swift");
    assert!(
        src.contains("usesLanguageCorrection = false"),
        "OCR language correction must stay off, or secrets stop being detectable \
         and every scan quietly comes back clean"
    );
    assert!(
        !src.contains("usesLanguageCorrection = true"),
        "language correction is switched on somewhere in video-scan.swift"
    );
}

#[test]
fn video_scan_uses_the_accurate_recognition_level() {
    // `.fast` drops enough characters out of small monospace text to break the
    // body-length and character-set checks the engine relies on.
    let src = sidecar_source("video-scan.swift");
    assert!(
        src.contains("recognitionLevel = .accurate"),
        "the scanner must use Vision's accurate recognition level"
    );
}

#[test]
fn video_scan_never_writes_a_frame_to_disk() {
    // The promise on the privacy screen is that decoded frames stay in memory.
    // A `write(to:` in this file would quietly make that false.
    let src = sidecar_source("video-scan.swift");
    assert!(
        !src.contains("write(to:"),
        "video-scan.swift writes to disk — the frames of a user's recording must \
         never be persisted"
    );
}

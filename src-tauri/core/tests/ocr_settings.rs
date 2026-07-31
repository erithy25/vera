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

/// The frame-skipping settings, which shipped broken once and cost three of four
/// findings.
///
/// ## What happened
///
/// Frames whose picture has not changed are not OCR'd twice — that is where
/// nearly all of the scan time is saved. The comparison was an 8x8 average hash:
/// the frame squeezed into 64 grey cells, one bit each for "brighter than this
/// frame's own average". On a terminal, which is a light field with a little
/// dark text on it, that describes the *window*, not the text in it.
///
/// Measured on `testdata/vera-demo-recording.mov`: four completely different
/// screens sat within 2 bits of each other, and the stretch holding two of the
/// four planted keys sat at exactly the threshold of 5. The scanner read 3 of 56
/// frames and reported one of the four secrets — and reported it as a finished,
/// successful scan.
///
/// The engine was never at fault. Run over the OCR text of all 56 frames it
/// finds all four keys in exactly their windows, and nothing in the 34 seconds
/// of decoys. The frames simply never reached it.
///
/// These assertions are string matches against a Swift file, which is crude, but
/// it is the only mechanism that runs on a machine without Xcode — and this
/// failure is invisible from inside the app, because a scan that skips
/// everything still finishes and still comes back green.
#[test]
fn video_scan_compares_frames_with_a_hash_that_can_see_text() {
    let src = sidecar_source("video-scan.swift");
    assert!(
        src.contains("func differenceHash("),
        "frame comparison must use a difference hash, which encodes local \
         structure; an average hash cannot tell two screens of terminal text \
         apart and silently skips the frames a secret is on"
    );
    assert!(
        !src.contains("func averageHash("),
        "the 8x8 average hash is back — it read 3 of 56 frames on the test \
         recording and found one of four planted keys"
    );
    assert!(
        src.contains("let hashSide = 16"),
        "the hash must stay at 16x16 (256 bits); coarser cannot separate a \
         blinking cursor from a change of screen"
    );
}

#[test]
fn video_scan_caps_how_many_frames_it_may_skip_in_a_row() {
    // The threshold is a judgement about a hash and a hash can be wrong. The cap
    // is not a judgement: whatever the hash believes, OCR runs again after this
    // many consecutive skips, so at 1 fps anything on screen for longer than
    // `maxSkipRun` seconds is read at least once. It is the difference between
    // hoping a secret was seen and being able to say so.
    let src = sidecar_source("video-scan.swift");
    assert!(
        src.contains("var maxSkipRun: Int ="),
        "video-scan.swift has no cap on consecutive skipped frames — without one \
         a bad hash can skip an unbounded run and miss a secret entirely"
    );
    assert!(
        src.contains("skipRun < opts.maxSkipRun"),
        "the skip branch does not consult the cap, so the cap does nothing"
    );

    let cap = src
        .split("var maxSkipRun: Int =")
        .nth(1)
        .and_then(|rest| rest.split(|c: char| !c.is_ascii_digit()).find(|s| !s.is_empty()))
        .and_then(|n| n.parse::<usize>().ok())
        .expect("could not read the value of maxSkipRun");
    assert!(
        (1..=10).contains(&cap),
        "maxSkipRun is {cap}: at 1 fps that is the number of seconds a credential \
         can sit on screen without being read. Above 10 the guarantee stops being \
         worth making; 0 would disable skipping altogether."
    );
}

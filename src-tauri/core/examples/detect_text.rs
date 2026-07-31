//! Run the engine over text on stdin and print what it finds.
//!
//! The debugging tool that was missing the first time a scan came back with
//! fewer findings than it should have: with this, text read out of a frame can
//! be put through the real detector without a Mac, a sidecar or a build of the
//! app, which separates "the frame was never read" from "the frame was read and
//! nothing was found in it".
//!
//!     tesseract frame.png - | cargo run -q --example detect_text

use std::io::Read;

fn main() {
    let mut text = String::new();
    if std::io::stdin().read_to_string(&mut text).is_err() {
        eprintln!("could not read stdin");
        std::process::exit(1);
    }
    for f in vera_core::detect_in_text(&text) {
        println!("{}\t{}\t{:.3}\t{}", f.label, f.severity.as_str(), f.confidence, f.preview);
    }
}

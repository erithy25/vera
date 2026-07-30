//! What does the engine see in this text?
//!
//! ```text
//!   echo 'export KEY=sk-proj-…' | cargo run -q --example detect -p vera-core
//! ```
//!
//! Reads stdin, prints one line per finding. Blocks separated by a line
//! containing only `---` are treated as separate frames, and the first line of
//! each block is used as its label — which makes it easy to pipe in the OCR of
//! a whole recording, one file per frame, and see the timeline of findings.
//!
//! This is how the OCR-inserted-whitespace bug was found: the transcript of a
//! rendered test recording went in, and two of the four planted credentials
//! came back clean.

use std::io::Read;

fn main() {
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).unwrap();

    for block in text.split("\n---\n") {
        let label = block.lines().next().unwrap_or("").to_string();
        let findings = vera_core::detect_in_text(block);
        if findings.is_empty() {
            println!("CLEAN    | {label}");
        } else {
            for f in findings {
                println!(
                    "{:8} | {} | {} | {}",
                    f.severity.as_str().to_uppercase(),
                    f.pattern_id,
                    f.preview,
                    label
                );
            }
        }
    }
}

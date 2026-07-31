//! Ground truth for the website's demonstration.
//!
//! The site carries an element that lets a visitor degrade a key the way a
//! recording does and watch whether the engine still finds it. To answer that
//! in a browser, `website/src/reader.ts` re-implements the pattern gate in
//! TypeScript — and a second copy of a rule is a copy that drifts.
//!
//! This is the pin. It reads one candidate per line on stdin, runs the real
//! engine over each, and prints what the engine decided. `website/scripts/
//! check-reader.mjs` runs the TypeScript over the same list and asserts the two
//! agree, so the demonstration cannot quietly start claiming something the
//! product does not do.
//!
//!     node --experimental-strip-types website/scripts/reader-corpus.mjs \
//!       | cargo run -q --example reader_oracle \
//!       > website/src/reader.oracle.tsv
//!
//! Output is one tab-separated line per input: the candidate, then either the
//! finding's label and confidence to six places, or `-` and `-` when the engine
//! reported nothing.

use std::io::{self, BufRead};

fn main() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let candidate = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("read error: {e}");
                std::process::exit(1);
            }
        };
        if candidate.is_empty() {
            continue;
        }

        // The public entry point, not an internal helper: whatever the shipped
        // engine reports for this text is by definition the right answer.
        let findings = vera_core::detect_in_text(&candidate);
        let best = findings
            .iter()
            .filter(|f| f.label == "OpenAI Project Key")
            .max_by(|a, b| {
                a.confidence
                    .partial_cmp(&b.confidence)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

        match best {
            Some(f) => println!("{candidate}\t{}\t{:.6}", f.label, f.confidence),
            None => println!("{candidate}\t-\t-"),
        }
    }
}

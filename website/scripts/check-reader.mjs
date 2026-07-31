/**
 * Does the browser's copy of the rule still agree with the engine?
 *
 * `reader.ts` re-implements the pattern gate in TypeScript so the element on
 * the site can compute its answer rather than replay one. A second copy of a
 * rule is a copy that drifts, so this asserts the two agree on every string the
 * element can produce — the whole reachable space, not a sample.
 *
 *   node --experimental-strip-types scripts/check-reader.mjs
 *
 * To regenerate the ground truth after changing the engine:
 *   node --experimental-strip-types scripts/reader-corpus.mjs \
 *     | (cd ../src-tauri/core && cargo run -q --example reader_oracle) \
 *     > scripts/reader.oracle.tsv
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { veraVerdict } from "../src/reader.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(here, "reader.oracle.tsv"), "utf8")
  .split("\n")
  .filter((l) => l.length > 0)
  .map((l) => {
    const [candidate, label, confidence] = l.split("\t");
    return { candidate, label, confidence };
  });

if (rows.length === 0) {
  console.error("the oracle file is empty");
  process.exit(1);
}

let mismatches = 0;
for (const row of rows) {
  const mine = veraVerdict(row.candidate);
  const engineFound = row.label !== "-";

  if (mine.found !== engineFound) {
    mismatches++;
    console.log(
      `  FOUND-MISMATCH  "${row.candidate}"\n      engine: ${engineFound ? row.label : "nothing"}` +
        `\n      port:   ${mine.found ? mine.label : `nothing (${mine.reason})`}`
    );
    continue;
  }
  if (!mine.found) continue;

  // Confidence is a float built from three weighted terms in both languages;
  // anything past the sixth place is the print format, not a disagreement.
  const delta = Math.abs(mine.confidence - Number(row.confidence));
  if (delta > 1e-6) {
    mismatches++;
    console.log(
      `  CONFIDENCE-MISMATCH  "${row.candidate}"  engine ${row.confidence}  port ${mine.confidence.toFixed(6)}  Δ${delta.toExponential(2)}`
    );
  }
}

const found = rows.filter((r) => r.label !== "-").length;
console.log(
  `\n  ${rows.length} strings checked — ${found} the engine finds, ${rows.length - found} it does not`
);
console.log(
  mismatches === 0
    ? "  PASS  the browser's copy of the rule agrees with the engine on every one"
    : `  FAIL  ${mismatches} disagreements`
);
process.exit(mismatches === 0 ? 0 : 1);

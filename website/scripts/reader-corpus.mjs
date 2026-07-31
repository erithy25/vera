/**
 * Every string the demonstration can produce.
 *
 * The element has three controls, but they only ever reach the damage model
 * through one number — how many pixels tall a glyph ends up. So the reachable
 * state space is that single axis, and it can be enumerated exhaustively rather
 * than sampled: 0 to 15 pixels in twentieths.
 *
 *   node --experimental-strip-types scripts/reader-corpus.mjs > reader.corpus.txt
 */
import { readBack } from "../src/reader.ts";

const SOURCE = "sk-proj-T3xK9mPqrn7wZ2bVdL4hCj8s";

const seen = new Set();
for (let px = 0; px <= 15.0001; px += 0.05) {
  const { text } = readBack(SOURCE, px);
  if (text.length === 0) continue; // nothing came back; there is nothing to ask about
  seen.add(text);
}
for (const t of seen) process.stdout.write(t + "\n");
process.stderr.write(`${seen.size} distinct strings reachable\n`);

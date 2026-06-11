// Token-set Jaccard similarity, mirroring jaccard_similarity in
// src-tauri/src/lib.rs. Used as a frontend safety net against storing
// near-duplicate captures (e.g. when an older backend is still running).
export function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

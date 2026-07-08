// Pure billing helpers shared by the daily close, reports, and export — the
// ONE place rate resolution and money rounding live, so the three call sites
// can never drift. No Tauri/DB imports (bundled into replica tests).

export interface RatedProject {
  billable: number | boolean;
  hourly_rate_cents: number | null;
  client_rate_cents: number | null;
}

/** The effective €/h: project rate, else client rate; null when non-billable or unpriced. */
export function effectiveRateCents(p: RatedProject): number | null {
  if (!p.billable) return null;
  return p.hourly_rate_cents ?? p.client_rate_cents;
}

/** rounded_minutes × €/h, kaufmännisch to whole cents. */
export function amountCents(roundedMinutes: number, rateCents: number): number {
  return Math.round((roundedMinutes / 60) * rateCents);
}

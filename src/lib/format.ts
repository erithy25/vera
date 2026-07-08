// Small shared formatting + local-calendar helpers (durations, times, money,
// day boundaries). Day math goes through Date calendar arithmetic so DST
// transition days (23h/25h) stay midnight-aligned.

export function dayStartOf(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function nextDayStart(dayStartMs: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function prevDayStart(dayStartMs: number): number {
  const d = new Date(dayStartMs);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${mins} m`;
  return `${mins} m`;
}

/** HH:MM (24h) — also valid as an <input type="time"> value. */
export function formatTimeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatEuroFromCents(cents: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Parse a user-entered rate like "120" or "95.50" into cents (null if empty/invalid). */
export function parseEuroToCents(input: string): number | null {
  const cleaned = input.replace(",", ".").replace(/[^\d.]/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

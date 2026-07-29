/**
 * Local settings store.
 *
 * ## What used to be here
 *
 * 1,191 lines: repositories for captures, frames, activity events, notes,
 * goals and agents, a second copy of the redaction logic, a second copy of the
 * app categoriser, and `CREATE TABLE` statements that duplicated the ones in
 * the Rust migrations. The audit found three separate sources of truth for the
 * schema, in two languages.
 *
 * Vera scans a recording and shows you what it found. It stores no recordings,
 * no frames, no OCR text and no findings — so almost none of that had anything
 * left to do. What remains is the handful of preferences the window needs to
 * come back the way you left it.
 *
 * The schema itself lives in `src-tauri/core/src/schema.rs` and nowhere else.
 */

import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:vera.db");
  }
  return dbPromise;
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ value: string | null }[]>(
      "SELECT value FROM settings WHERE key = $1",
      [key]
    );
    return rows.length > 0 ? rows[0].value : null;
  } catch (err) {
    console.error(`Failed to read setting '${key}':`, err);
    return null;
  }
}

async function writeSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

/** How often a recording is sampled, in frames per second. */
export const DEFAULT_SCAN_FPS = 1;

/**
 * Sampling rates offered in Settings.
 *
 * Below 1 fps a secret that flashes up briefly can fall between two samples,
 * so 0.5 is described honestly as a trade rather than as an "optimisation".
 */
export const SCAN_FPS_CHOICES = [0.5, 1, 2, 4] as const;

export const settingsRepo = {
  async getUserName(): Promise<string> {
    return (await readSetting("user_name")) ?? "";
  },

  async setUserName(name: string): Promise<void> {
    await writeSetting("user_name", name);
  },

  async getScanFps(): Promise<number> {
    const raw = await readSetting("scan_fps");
    const parsed = raw === null ? NaN : Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCAN_FPS;
  },

  async setScanFps(fps: number): Promise<void> {
    await writeSetting("scan_fps", String(fps));
  },
};

/**
 * Opens the database so the Rust migrations have run before the first read.
 * Returns false when the store is unavailable — the scanner itself does not
 * need it, so the app stays usable either way.
 */
export async function initializeSettings(): Promise<boolean> {
  try {
    await getDb();
    return true;
  } catch (err) {
    console.error("Settings store unavailable; continuing without it:", err);
    return false;
  }
}

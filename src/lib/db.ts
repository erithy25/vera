import Database from "@tauri-apps/plugin-sql";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:vera.db");
  }
  return dbInstance;
}

export interface DbActivityEvent {
  id: number;
  app_name: string;
  window_title: string | null;
  started_at: number;
  duration_seconds: number;
  category: string | null;
}

// System UI processes (lock screen, screensaver, ...) that must never count as
// activity. Matched exactly against the lowercased app name — mirrors
// SYSTEM_PROCESS_BLOCKLIST in src-tauri/src/lib.rs.
const SYSTEM_PROCESS_NAMES = [
  "loginwindow",
  "login window",
  "windowserver",
  "window server",
  "screensaverengine",
  "screensaver",
  "screen saver",
  "controlcenter",
  "control center",
  "systemuiserver",
  "dock",
  "unknown",
];

export function isSystemProcessName(appName: string): boolean {
  const name = appName.toLowerCase().trim();
  return SYSTEM_PROCESS_NAMES.includes(name) || name.includes("loginwindow");
}

// Raw activity data. The Rust backend writes these rows directly; this repo is
// the read path (and a defensive insert path) that the block engine of the
// next layer builds on.
export const activityRepo = {
  // Upsert path for activity events (guarded against system UI processes).
  async insertEvent(event: {
    app_name: string;
    window_title: string | null;
    started_at: number;
    duration_seconds: number;
    category?: string | null;
  }) {
    if (isSystemProcessName(event.app_name)) {
      return;
    }

    const db = await getDb();
    const existing = await db.select<any[]>(
      "SELECT id FROM activity_events WHERE app_name = $1 AND (window_title = $2 OR (window_title IS NULL AND $2 IS NULL)) AND started_at = $3",
      [event.app_name, event.window_title || null, event.started_at]
    );

    if (existing.length > 0) {
      await db.execute(
        "UPDATE activity_events SET duration_seconds = $1 WHERE id = $2",
        [event.duration_seconds, existing[0].id]
      );
    } else {
      await db.execute(
        "INSERT INTO activity_events (app_name, window_title, started_at, duration_seconds, category) VALUES ($1, $2, $3, $4, $5)",
        [event.app_name, event.window_title || null, event.started_at, event.duration_seconds, event.category || null]
      );
    }
  },

  // All activity events that started within [startMs, endMs), chronological.
  async eventsForDay(startMs: number, endMs: number): Promise<DbActivityEvent[]> {
    const db = await getDb();
    return db.select<DbActivityEvent[]>(
      "SELECT * FROM activity_events WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at ASC",
      [startMs, endMs]
    );
  },

  // Wipe the entire activity history ("Delete everything" in Settings).
  async deleteAll(): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM activity_events");
  },

  // Local-midnight timestamps (ms) of every day that has activity, most
  // recent first — drives day selectors.
  async activeDays(): Promise<number[]> {
    const db = await getDb();
    const rows = await db.select<{ day: string }[]>(
      "SELECT DISTINCT date(started_at/1000, 'unixepoch', 'localtime') as day FROM activity_events"
    );
    const days = rows
      .filter((r) => r.day)
      .map((r) => {
        const [y, m, dd] = r.day.split("-").map(Number);
        return new Date(y, m - 1, dd).getTime();
      });
    return days.sort((a, b) => b - a);
  },
};

export interface DbFrame {
  id: number;
  timestamp: number;
  app: string | null;
  window_title: string | null;
  url: string | null;
  ocr_text: string | null;
  segment_id: string | null;
  frame_index: number | null;
  thumbnail_path: string | null;
}

const FRAME_COLS =
  "id, timestamp, app, window_title, url, ocr_text, segment_id, frame_index, thumbnail_path";

// macOS system UI that is not real activity. Older recordings may still contain
// these (captured before the sidecar/Rust filters existed), so every read path
// excludes them — keeps the lock screen / Notification Centre out of results.
const SYSTEM_APPS = [
  "loginwindow", "login window", "windowserver", "window server", "dock",
  "systemuiserver", "controlcenter", "control center", "notificationcenter",
  "notification center", "usernotificationcenter", "spotlight",
  "screensaverengine", "screensaver", "screen saver", "coreautha",
  "universalcontrol", "wallpaper", "talagent", "screencaptureui",
  "lockoutagent", "unknown",
];
// Hardcoded constant (no user input) → safe to inline as a SQL literal list.
const SYSTEM_APPS_SQL = SYSTEM_APPS.map((a) => `'${a}'`).join(", ");
const NOT_SYSTEM_APP = `LOWER(COALESCE(app, '')) NOT IN (${SYSTEM_APPS_SQL})`;

// Read path over captured frames (redacted OCR text + metadata). This is the
// evidence source for the block engine of the next layer; media stays
// encrypted until a thumbnail is decrypted on demand for display.
export const framesRepo = {
  // Keyword candidates (+ optional time window), most recent first.
  async search(
    query?: string,
    startMs?: number,
    endMs?: number,
    limit = 300
  ): Promise<DbFrame[]> {
    const db = await getDb();
    const clauses: string[] = ["thumbnail_path IS NOT NULL", NOT_SYSTEM_APP];
    const params: any[] = [];
    let p = 1;
    if (query && query.trim()) {
      clauses.push(
        `(ocr_text LIKE $${p} OR app LIKE $${p} OR window_title LIKE $${p} OR url LIKE $${p})`
      );
      params.push(`%${query.trim()}%`);
      p++;
    }
    if (typeof startMs === "number") {
      clauses.push(`timestamp >= $${p}`);
      params.push(startMs);
      p++;
    }
    if (typeof endMs === "number") {
      clauses.push(`timestamp < $${p}`);
      params.push(endMs);
      p++;
    }
    params.push(limit);
    return db.select<DbFrame[]>(
      `SELECT ${FRAME_COLS} FROM frames WHERE ${clauses.join(" AND ")} ORDER BY timestamp DESC LIMIT $${p}`,
      params
    );
  },

  // All frames within [startMs, endMs), chronological.
  async forDay(startMs: number, endMs: number): Promise<DbFrame[]> {
    const db = await getDb();
    return db.select<DbFrame[]>(
      `SELECT ${FRAME_COLS} FROM frames WHERE timestamp >= $1 AND timestamp < $2 AND ${NOT_SYSTEM_APP} ORDER BY timestamp ASC`,
      [startMs, endMs]
    );
  },
};

export const settingsRepo = {
  async getCapturePaused(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'capture_paused'"
    );
    if (rows.length > 0) {
      return rows[0].value === "true";
    }
    return false;
  },

  async setCapturePaused(paused: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('capture_paused', $1)",
      [String(paused)]
    );
  },

  async getFramesCaptureEnabled(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'frames_capture_enabled'"
    );
    if (rows.length > 0) {
      return rows[0].value === "true";
    }
    return false; // default OFF
  },

  async setFramesCaptureEnabled(enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('frames_capture_enabled', $1)",
      [String(enabled)]
    );
  },

  async getFramesMaxStorageMb(): Promise<number> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'frames_max_storage_mb'");
    if (rows.length > 0) {
      const n = parseInt(rows[0].value, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return 2048; // 2 GB default
  },

  async setFramesMaxStorageMb(mb: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('frames_max_storage_mb', $1)",
      [String(Math.max(1, Math.floor(mb)))]
    );
  },

  async getFramesRetentionDays(): Promise<number> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'frames_retention_days'");
    if (rows.length > 0) {
      const n = parseInt(rows[0].value, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return 30;
  },

  async setFramesRetentionDays(days: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('frames_retention_days', $1)",
      [String(Math.max(1, Math.floor(days)))]
    );
  },

  async getExcludedApps(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'excluded_apps'");
    if (rows.length > 0) {
      try {
        return JSON.parse(rows[0].value);
      } catch (e) {
        console.error("Failed to parse excluded_apps:", e);
      }
    }
    return [];
  },

  async setExcludedApps(apps: string[]): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('excluded_apps', $1)",
      [JSON.stringify(apps)]
    );
  },

  async getExcludedDomains(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'excluded_domains'");
    if (rows.length > 0) {
      try {
        return JSON.parse(rows[0].value);
      } catch (e) {
        console.error("Failed to parse excluded_domains:", e);
      }
    }
    return [];
  },

  async setExcludedDomains(domains: string[]): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('excluded_domains', $1)",
      [JSON.stringify(domains)]
    );
  },

  // The local Ollama model used for assignment and narrative generation.
  async getChatModel(): Promise<string> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'chat_model'");
    if (rows.length > 0) {
      return rows[0].value;
    }
    return "llama3.2:3b";
  },

  async setChatModel(model: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('chat_model', $1)",
      [model]
    );
  },

  // --- Profile & onboarding ---

  async getUserName(): Promise<string> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'user_name'");
    return rows.length > 0 ? rows[0].value : "";
  },

  async setUserName(name: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('user_name', $1)",
      [name]
    );
  },

  async getOnboardingComplete(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'onboarding_complete'"
    );
    return rows.length > 0 && rows[0].value === "true";
  },

  async setOnboardingComplete(complete: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarding_complete', $1)",
      [complete ? "true" : "false"]
    );
  },

  // Mirror of the OS "start at login" state (the OS Login Items is the truth).
  async getAutostartEnabled(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'autostart_enabled'"
    );
    return rows.length > 0 && rows[0].value === "true";
  },

  async setAutostartEnabled(enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('autostart_enabled', $1)",
      [enabled ? "true" : "false"]
    );
  },
};

export async function initializeDefaultSettings() {
  const db = await getDb();

  // Defensive: guarantee the frame-capture table exists on every launch. The
  // v5 migration also creates it, but this removes any dependency on migration
  // timing/state so `frames` is always present once this build runs.
  await db.execute(
    `CREATE TABLE IF NOT EXISTS frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      app TEXT, window_title TEXT, url TEXT, ocr_text TEXT,
      image_path TEXT, perceptual_hash TEXT,
      segment_id TEXT, frame_index INTEGER, thumbnail_path TEXT, embedding TEXT
    )`
  );

  const checkAndSeed = async (key: string, defaultValue: string) => {
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = $1",
      [key]
    );
    if (rows.length === 0) {
      await db.execute(
        "INSERT INTO settings (key, value) VALUES ($1, $2)",
        [key, defaultValue]
      );
      console.log(`[Vera DB] Initialized setting '${key}' with default: ${defaultValue}`);
    }
  };

  const defaultApps = [
    "1Password",
    "Bitwarden",
    "Keychain Access",
    "KeychainAccess",
    "KeePassXC",
    "Dashlane",
    "LastPass",
    "Authy",
    "Enpass",
    "Banking"
  ];

  await checkAndSeed("capture_paused", "false"); // active/not-paused by default for new installs
  await checkAndSeed("frames_capture_enabled", "false"); // frame-based screen recording OFF by default
  await checkAndSeed("frames_max_storage_mb", "2048"); // 2 GB budget for HEVC segments + thumbnails
  await checkAndSeed("frames_retention_days", "30"); // evict frame data older than this
  await checkAndSeed("excluded_apps", JSON.stringify(defaultApps));
  await checkAndSeed("excluded_domains", "[]");
  await checkAndSeed("chat_model", "llama3.2:3b");
  await checkAndSeed("user_name", "");
  await checkAndSeed("onboarding_complete", "false");
  await checkAndSeed("autostart_enabled", "false");

  // Delete existing system-process rows (lock screen, screensaver, ...) from activity history
  try {
    const namesList = SYSTEM_PROCESS_NAMES.map((n) => `'${n}'`).join(", ");
    await db.execute(
      `DELETE FROM activity_events WHERE LOWER(app_name) IN (${namesList}) OR LOWER(app_name) LIKE '%loginwindow%'`
    );
    console.log("[Vera DB] Purged system-process rows from activity events.");
  } catch (err) {
    console.error("Failed to delete system-process activity events:", err);
  }
}

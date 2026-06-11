import Database from "@tauri-apps/plugin-sql";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:vera.db");
  }
  return dbInstance;
}

export interface DbNote {
  id: number;
  title: string;
  body: string | null;
  created_at: number;
  updated_at: number;
}

export interface DbGoal {
  id: number;
  title: string;
  target_minutes: number;
  created_at: number;
  done: number; // SQLite boolean (0/1)
}

export interface DbActivityEvent {
  id: number;
  app_name: string;
  window_title: string | null;
  started_at: number;
  duration_seconds: number;
  category: string | null;
}

export interface DbCapture {
  id: number;
  captured_at: number;
  app_name: string;
  window_title: string | null;
  ocr_text: string;
  char_count: number;
  embedding?: string | null;
}

// Helper to format seconds to "Hh Mm" or "Mm"
export function formatHoursMinutes(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function getAppIconName(appName: string): string {
  const name = appName.toLowerCase();
  if (name.includes("code") || name.includes("xcode") || name.includes("terminal") || name.includes("warp") || name.includes("iterm") || name.includes("developer")) {
    return "Code";
  }
  if (name.includes("notion") || name.includes("obsidian") || name.includes("word") || name.includes("pages") || name.includes("notes") || name.includes("textedit")) {
    return "FileText";
  }
  if (name.includes("figma") || name.includes("sketch") || name.includes("framer") || name.includes("photoshop") || name.includes("illustrator")) {
    return "Framer";
  }
  if (name.includes("message") || name.includes("slack") || name.includes("mail") || name.includes("discord") || name.includes("whatsapp") || name.includes("telegram")) {
    return "MessageSquare";
  }
  if (name.includes("arc") || name.includes("chrome") || name.includes("safari") || name.includes("firefox") || name.includes("edge") || name.includes("browser")) {
    return "Globe";
  }
  return "FileText";
}

// Simple App Categorization Heuristics
export function categorizeApp(appName: string): string {
  const name = appName.toLowerCase();
  if (name.includes("code") || name.includes("xcode") || name.includes("terminal") || name.includes("warp") || name.includes("iterm") || name.includes("developer")) {
    return "code";
  }
  if (name.includes("figma") || name.includes("sketch") || name.includes("photoshop") || name.includes("illustrator") || name.includes("framer")) {
    return "design";
  }
  if (name.includes("notion") || name.includes("obsidian") || name.includes("word") || name.includes("pages") || name.includes("textedit") || name.includes("book") || name.includes("reader")) {
    return "docs";
  }
  if (name.includes("message") || name.includes("slack") || name.includes("mail") || name.includes("discord") || name.includes("whatsapp") || name.includes("telegram")) {
    return "comms";
  }
  if (name.includes("zoom") || name.includes("meet") || name.includes("facetime") || name.includes("teams") || name.includes("webex")) {
    return "meeting";
  }
  if (name.includes("arc") || name.includes("chrome") || name.includes("safari") || name.includes("firefox") || name.includes("edge") || name.includes("browser")) {
    return "browser";
  }
  return "other";
}

// --- Repositories ---

export const notesRepo = {
  async list(): Promise<DbNote[]> {
    const db = await getDb();
    return db.select<DbNote[]>("SELECT * FROM notes ORDER BY created_at DESC");
  },

  async add(title: string, body: string = ""): Promise<DbNote> {
    const db = await getDb();
    const now = Date.now();
    const result = await db.execute(
      "INSERT INTO notes (title, body, created_at, updated_at) VALUES ($1, $2, $3, $4)",
      [title, body, now, now]
    );
    return {
      id: result.lastInsertId!,
      title,
      body,
      created_at: now,
      updated_at: now,
    };
  },

  async update(id: number, title: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE notes SET title = $1, updated_at = $2 WHERE id = $3",
      [title, Date.now(), id]
    );
  },

  async remove(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM notes WHERE id = $1", [id]);
  },
};

export const goalsRepo = {
  async getDailyGoal(): Promise<DbGoal | null> {
    const db = await getDb();
    // The most recent goal that is not done yet acts as the daily goal
    const rows = await db.select<DbGoal[]>(
      "SELECT * FROM goals WHERE done = 0 ORDER BY created_at DESC LIMIT 1"
    );
    return rows[0] || null;
  },

  async list(): Promise<DbGoal[]> {
    const db = await getDb();
    return db.select<DbGoal[]>("SELECT * FROM goals ORDER BY created_at DESC");
  },

  async add(title: string, targetMinutes: number = 60): Promise<DbGoal> {
    const db = await getDb();
    const now = Date.now();
    const result = await db.execute(
      "INSERT INTO goals (title, target_minutes, created_at, done) VALUES ($1, $2, $3, 0)",
      [title, targetMinutes, now]
    );
    return {
      id: result.lastInsertId!,
      title,
      target_minutes: targetMinutes,
      created_at: now,
      done: 0,
    };
  },

  async setDone(id: number, done: boolean): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE goals SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
  },

  async remove(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM goals WHERE id = $1", [id]);
  },
};

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

export const activityRepo = {
  // Upsert Path for background tracking events
  async insertEvent(event: {
    app_name: string;
    window_title: string | null;
    started_at: number;
    duration_seconds: number;
    category?: string | null;
  }) {
    // Guard: never record lock screen / system UI processes as activity
    if (isSystemProcessName(event.app_name)) {
      return;
    }

    const db = await getDb();
    const category = event.category || categorizeApp(event.app_name);

    // Check if event already exists with the same app name, window title, and start time
    const existing = await db.select<any[]>(
      "SELECT id FROM activity_events WHERE app_name = $1 AND (window_title = $2 OR (window_title IS NULL AND $2 IS NULL)) AND started_at = $3",
      [event.app_name, event.window_title || null, event.started_at]
    );

    if (existing.length > 0) {
      // Update duration of the existing session (live updates)
      await db.execute(
        "UPDATE activity_events SET duration_seconds = $1 WHERE id = $2",
        [event.duration_seconds, existing[0].id]
      );
    } else {
      // Insert new session event
      await db.execute(
        "INSERT INTO activity_events (app_name, window_title, started_at, duration_seconds, category) VALUES ($1, $2, $3, $4, $5)",
        [event.app_name, event.window_title || null, event.started_at, event.duration_seconds, category]
      );
    }
  },

  async todayStats() {
    const db = await getDb();
    const startOfDayMs = new Date().setHours(0, 0, 0, 0);

    // Active Hours: sum of active (non-idle) durations today
    const activeRows = await db.select<any[]>(
      "SELECT SUM(duration_seconds) as total_seconds FROM activity_events WHERE started_at >= $1",
      [startOfDayMs]
    );
    const totalSecs = activeRows[0]?.total_seconds || 0;

    // Focus Time: sum of continuous same-app sessions in non-comms, non-meeting categories lasting >= 10m (600s)
    const focusRows = await db.select<any[]>(
      "SELECT SUM(duration_seconds) as focus_seconds FROM activity_events WHERE started_at >= $1 AND (category NOT IN ('comms', 'meeting') OR category IS NULL) AND duration_seconds >= 600",
      [startOfDayMs]
    );
    const focusSecs = focusRows[0]?.focus_seconds || 0;

    // Meetings count: count of distinct sessions today in the "meeting" category
    const meetingRows = await db.select<any[]>(
      "SELECT COUNT(*) as cnt FROM activity_events WHERE started_at >= $1 AND category = 'meeting'",
      [startOfDayMs]
    );
    const meetings = meetingRows[0]?.cnt || 0;

    // Interruptions: count of times an app switch immediately breaks a focus session
    const events = await db.select<any[]>(
      "SELECT app_name, duration_seconds, category FROM activity_events WHERE started_at >= $1 ORDER BY started_at ASC",
      [startOfDayMs]
    );

    let interruptions = 0;
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      const next = events[i + 1];
      const isFocusSession = current.duration_seconds >= 600 && current.category !== "comms" && current.category !== "meeting";
      if (isFocusSession && next.app_name !== current.app_name) {
        interruptions++;
      }
    }

    return {
      activeHours: formatHoursMinutes(totalSecs),
      focusTime: formatHoursMinutes(focusSecs),
      meetings: String(meetings),
      interruptions: String(interruptions),
      progressPercent: Math.min(100, Math.round((totalSecs / 60 / 480) * 100)), // Goal: 8h (480m)
    };
  },

  async topAppsToday() {
    const db = await getDb();
    const startOfDayMs = new Date().setHours(0, 0, 0, 0);

    const rows = await db.select<any[]>(
      `SELECT app_name, SUM(duration_seconds) as total_seconds
       FROM activity_events
       WHERE started_at >= $1
       GROUP BY app_name
       ORDER BY total_seconds DESC
       LIMIT 5`,
      [startOfDayMs]
    );

    return rows.map((r) => ({
      name: r.app_name,
      timeLabel: formatHoursMinutes(r.total_seconds),
      minutes: Math.floor(r.total_seconds / 60),
      iconName: getAppIconName(r.app_name),
    }));
  },

  async timelineToday() {
    const db = await getDb();
    const startOfDayMs = new Date().setHours(0, 0, 0, 0);
    const endOfDayMs = startOfDayMs + 24 * 3600 * 1000;

    const events = await db.select<any[]>(
      `SELECT started_at, duration_seconds 
       FROM activity_events 
       WHERE started_at >= $1 AND started_at < $2`,
      [startOfDayMs, endOfDayMs]
    );

    const hourlySeconds = Array(24).fill(0);
    events.forEach((e) => {
      const date = new Date(e.started_at);
      const hour = date.getHours();
      hourlySeconds[hour] += e.duration_seconds;
    });

    return hourlySeconds.map((secs, hour) => {
      const period = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      return {
        label: `${displayHour} ${period}`,
        minutes: Math.round(secs / 60),
      };
    });
  },

  async timelineThisWeek() {
    const db = await getDb();
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const result: Array<{ label: string; minutes: number }> = [];

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startMs = d.getTime();
      const endMs = startMs + 24 * 3600 * 1000;

      const events = await db.select<any[]>(
        `SELECT SUM(duration_seconds) as total_seconds
         FROM activity_events
         WHERE started_at >= $1 AND started_at < $2`,
        [startMs, endMs]
      );
      const totalSecs = events[0]?.total_seconds || 0;
      result.push({
        label: weekdays[d.getDay()],
        minutes: Math.round(totalSecs / 60),
      });
    }
    return result;
  },

  async timelineThisMonth() {
    const db = await getDb();
    const result: Array<{ label: string; minutes: number }> = [];
    const nowMs = Date.now();
    const weekMs = 7 * 24 * 3600 * 1000;

    for (let i = 3; i >= 0; i--) {
      const startMs = nowMs - (i + 1) * weekMs;
      const endMs = nowMs - i * weekMs;

      const events = await db.select<any[]>(
        `SELECT SUM(duration_seconds) as total_seconds
         FROM activity_events
         WHERE started_at >= $1 AND started_at < $2`,
        [startMs, endMs]
      );
      const totalSecs = events[0]?.total_seconds || 0;
      result.push({
        label: `Week ${4 - i}`,
        minutes: Math.round(totalSecs / 60),
      });
    }
    return result;
  },
};

export const capturesRepo = {
  async list(searchQuery?: string): Promise<DbCapture[]> {
    const db = await getDb();
    if (searchQuery && searchQuery.trim().length > 0) {
      const escapedQuery = `%${searchQuery.trim()}%`;
      return db.select<DbCapture[]>(
        "SELECT * FROM captures WHERE ocr_text LIKE $1 OR app_name LIKE $1 OR window_title LIKE $1 ORDER BY captured_at DESC",
        [escapedQuery]
      );
    }
    return db.select<DbCapture[]>("SELECT * FROM captures ORDER BY captured_at DESC");
  },

  async latestForApp(appName: string): Promise<DbCapture | null> {
    const db = await getDb();
    const rows = await db.select<DbCapture[]>(
      "SELECT * FROM captures WHERE app_name = $1 ORDER BY captured_at DESC LIMIT 1",
      [appName]
    );
    return rows[0] || null;
  },

  async insert(capture: {
    app_name: string;
    window_title: string | null;
    ocr_text: string;
    char_count: number;
    embedding?: number[] | null;
  }): Promise<number> {
    const db = await getDb();
    const now = Date.now();
    
    // Read redaction setting
    const redactionEnabled = await settingsRepo.getRedactionEnabled();
    let textToStore = capture.ocr_text;
    if (redactionEnabled) {
      textToStore = redactSensitiveData(capture.ocr_text);
    }

    const embeddingStr = capture.embedding ? JSON.stringify(capture.embedding) : null;

    const result = await db.execute(
      "INSERT INTO captures (captured_at, app_name, window_title, ocr_text, char_count, embedding) VALUES ($1, $2, $3, $4, $5, $6)",
      [now, capture.app_name, capture.window_title, textToStore, textToStore.length, embeddingStr]
    );
    return result.lastInsertId!;
  },

  async updateEmbedding(id: number, embedding: number[]): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE captures SET embedding = $1 WHERE id = $2",
      [JSON.stringify(embedding), id]
    );
  },
};

// Keep regex patterns in one clearly commented, editable place.
export function redactSensitiveData(text: string): string {
  let redacted = text;

  // 1. Credit Card Numbers (13-16 digits, with optional spaces/hyphens, Luhn-validated)
  const ccRegex = /\b(?:\d[ -]?){13,16}\b/g;
  redacted = redacted.replace(ccRegex, (match) => {
    const clean = match.replace(/[\s-]/g, "");
    if (isLuhnValid(clean)) {
      return "[redacted]";
    }
    return match;
  });

  // 2. IBANs (2 letters + 2 digits + up to 30 alphanumeric characters)
  const ibanRegex = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;
  redacted = redacted.replace(ibanRegex, "[redacted]");

  // 3. Long all-digit sequences (10 or more digits, common for accounts, IDs, phone lists, etc.)
  const longDigitsRegex = /\b\d{10,}\b/g;
  redacted = redacted.replace(longDigitsRegex, "[redacted]");

  // 4. API Keys and Sensitive Tokens (OpenAI, Stripe, Github, AWS, or standard headers)
  // Edit or add patterns here:
  const tokenPatterns = [
    /sk-(proj-)?[a-zA-Z0-9]{48,}/g,                        // OpenAI API Keys
    /rk_live_[a-zA-Z0-9]{24}/g,                             // Stripe restricted keys
    /sk_live_[a-zA-Z0-9]{24}/g,                             // Stripe secret keys
    /ghp_[a-zA-Z0-9]{36,}/g,                                // GitHub Personal Access Tokens
    /AKIA[0-9A-Z]{16}/g,                                    // AWS Access Key ID
    /\b(?:bearer|token|password|secret|passwd|auth[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9_\-\.]{16,}["']?/gi // General tokens/passwords in headers
  ];

  for (const pattern of tokenPatterns) {
    redacted = redacted.replace(pattern, "[redacted]");
  }

  return redacted;
}

function isLuhnValid(str: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = str.length - 1; i >= 0; i--) {
    let digit = parseInt(str.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

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

  async getRedactionEnabled(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'redaction_enabled'");
    if (rows.length > 0) {
      return rows[0].value === "true";
    }
    return true; // default ON
  },

  async setRedactionEnabled(enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('redaction_enabled', $1)",
      [String(enabled)]
    );
  },

  async getRetentionDays(): Promise<string> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'retention_days'");
    if (rows.length > 0) {
      return rows[0].value;
    }
    return "30"; // default 30
  },

  async setRetentionDays(days: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('retention_days', $1)",
      [days]
    );
  },

  async deleteTodaysCaptures(): Promise<void> {
    const db = await getDb();
    const startOfDayMs = new Date().setHours(0, 0, 0, 0);
    await db.execute("DELETE FROM captures WHERE captured_at >= $1", [startOfDayMs]);
  },

  async deleteAllCaptures(): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM captures");
  },

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

  async getEmbeddingModel(): Promise<string> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'embedding_model'");
    if (rows.length > 0) {
      return rows[0].value;
    }
    return "nomic-embed-text";
  },

  async setEmbeddingModel(model: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('embedding_model', $1)",
      [model]
    );
  },

  // --- AI Engine (local Ollama by default, optional bring-your-own-key cloud) ---
  // The cloud API key itself is saved and read ONLY in Rust; it is never
  // selected from the frontend.

  async getAiEngine(): Promise<"local" | "cloud"> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'ai_engine'");
    if (rows.length > 0 && rows[0].value === "cloud") {
      return "cloud";
    }
    return "local";
  },

  async setAiEngine(engine: "local" | "cloud"): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_engine', $1)",
      [engine]
    );
  },

  async getCloudProvider(): Promise<"anthropic" | "openai"> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'cloud_provider'");
    if (rows.length > 0 && rows[0].value === "openai") {
      return "openai";
    }
    return "anthropic";
  },

  async setCloudProvider(provider: "anthropic" | "openai"): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_provider', $1)",
      [provider]
    );
  },

  async getCloudModel(provider: "anthropic" | "openai"): Promise<string> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = $1",
      [`cloud_model_${provider}`]
    );
    if (rows.length > 0 && rows[0].value.trim()) {
      return rows[0].value;
    }
    return provider === "openai" ? "gpt-4o" : "claude-sonnet-4-6";
  },

  async setCloudModel(provider: "anthropic" | "openai", model: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
      [`cloud_model_${provider}`, model]
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

  // App lock: only the on/off preference lives here — authentication itself
  // is fully delegated to macOS LocalAuthentication (no app-managed secret).
  async getAppLockEnabled(): Promise<boolean> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'app_lock_enabled'"
    );
    return rows.length > 0 && rows[0].value === "true";
  },

  async setAppLockEnabled(enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_lock_enabled', $1)",
      [enabled ? "true" : "false"]
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

  // Last known cloud reachability ("ok" | "failed" | ""), used by the engine badge
  async getCloudLastStatus(): Promise<string> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'cloud_last_status'");
    return rows.length > 0 ? rows[0].value : "";
  },

  async setCloudLastStatus(status: "ok" | "failed" | ""): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_last_status', $1)",
      [status]
    );
  }
};

// --- Seeding Logic ---

export async function seedDatabaseIfEmpty() {
  const db = await getDb();

  const rows = await db.select<any[]>(
    "SELECT value FROM settings WHERE key = 'db_seeded'"
  );
  if (rows.length > 0 && rows[0].value === "true") {
    return; // DB already seeded
  }

  // Set Seeded Flag
  await db.execute("INSERT INTO settings (key, value) VALUES ('db_seeded', 'true')");

  const now = Date.now();

  // 1. Seed Quick Notes
  await db.execute(
    "INSERT INTO notes (title, body, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    ["Project brainstorm", "", now - 2 * 60 * 1000, now - 2 * 60 * 1000]
  );
  await db.execute(
    "INSERT INTO notes (title, body, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    ["Ideas for newsletter", "", now - 60 * 60 * 1000, now - 60 * 60 * 1000]
  );
  await db.execute(
    "INSERT INTO notes (title, body, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    ["Book recommendations", "", now - 3 * 60 * 60 * 1000, now - 3 * 60 * 60 * 1000]
  );

  // 2. Seed Daily Goal
  await db.execute(
    "INSERT INTO goals (title, target_minutes, created_at) VALUES ($1, $2, $3)",
    ["Daily Focus", 480, now]
  );

  // Verify counts
  try {
    const notesCount = await db.select<any[]>("SELECT COUNT(*) as cnt FROM notes");
    const goalsCount = await db.select<any[]>("SELECT COUNT(*) as cnt FROM goals");
    console.log(`[Vera DB Seeder] Seeding completed successfully. Row counts: notes=${notesCount[0].cnt}, goals=${goalsCount[0].cnt}`);
  } catch (e) {
    console.error("[Vera DB Seeder] Failed to verify seeded row counts:", e);
  }
}

export async function initializeDefaultSettings() {
  const db = await getDb();

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
  await checkAndSeed("excluded_apps", JSON.stringify(defaultApps));
  await checkAndSeed("excluded_domains", "[]");
  await checkAndSeed("redaction_enabled", "true");
  await checkAndSeed("retention_days", "30");
  await checkAndSeed("chat_model", "llama3.2:3b");
  await checkAndSeed("embedding_model", "nomic-embed-text");
  await checkAndSeed("ai_engine", "local"); // local stays the default engine
  await checkAndSeed("cloud_provider", "anthropic");
  await checkAndSeed("cloud_model_anthropic", "claude-sonnet-4-6");
  await checkAndSeed("cloud_model_openai", "gpt-4o");
  await checkAndSeed("cloud_last_status", "");
  await checkAndSeed("user_name", "");
  await checkAndSeed("onboarding_complete", "false");
  await checkAndSeed("app_lock_enabled", "false");

  // Delete existing mislabeled 'loginwindow' captures
  try {
    await db.execute(
      "DELETE FROM captures WHERE app_name = 'loginwindow' OR app_name = 'loginwindow.app' OR app_name LIKE '%loginwindow%'"
    );
    console.log("[Vera DB] Purged any existing mislabeled 'loginwindow' captures.");
  } catch (err) {
    console.error("Failed to delete loginwindow captures:", err);
  }

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

export async function pruneOldCaptures() {
  try {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'retention_days'"
    );
    let days = 30; // default 30 days
    if (rows.length > 0) {
      if (rows[0].value === "forever") {
        console.log("[Vera DB] Retention set to 'forever'. No pruning needed.");
        return;
      }
      const val = parseInt(rows[0].value, 10);
      if (!isNaN(val)) {
        days = val;
      }
    }

    const pruneBeforeMs = Date.now() - days * 24 * 3600 * 1000;
    await db.execute(
      "DELETE FROM captures WHERE captured_at < $1",
      [pruneBeforeMs]
    );
    console.log(`[Vera DB] Auto-pruned captures older than ${days} days (before ${new Date(pruneBeforeMs).toISOString()})`);
  } catch (err) {
    console.error("[Vera DB] Failed to prune old captures:", err);
  }
}

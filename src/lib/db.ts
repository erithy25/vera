import Database from "@tauri-apps/plugin-sql";
import { mergeEvidence, pairByOverlap, parseEvidenceJson } from "./segmentation";

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

  // All activity events whose interval overlaps [startMs, endMs) — catches
  // events that started before the window (e.g. spanning midnight) without
  // fetching a whole extra day.
  async eventsOverlapping(startMs: number, endMs: number): Promise<DbActivityEvent[]> {
    const db = await getDb();
    return db.select<DbActivityEvent[]>(
      "SELECT * FROM activity_events WHERE started_at < $2 AND (started_at + duration_seconds * 1000) > $1 ORDER BY started_at ASC",
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

// --- Billing data model (clients, projects, work blocks) ---

export interface DbClient {
  id: number;
  name: string;
  color: string | null;
  hourly_rate_cents: number | null;
  currency: string;
  archived: number;
  created_at: number;
}

export interface DbProject {
  id: number;
  client_id: number;
  name: string;
  billable: number;
  hourly_rate_cents: number | null;
  archived: number;
  created_at: number;
  rounding_increment: number | null; // per-project override; null = global setting
}

// Project joined with its client, for pickers and rate resolution.
export interface DbProjectWithClient extends DbProject {
  client_name: string;
  client_color: string | null;
  client_rate_cents: number | null;
  client_archived: number;
}

export type BlockStatus = "open" | "confirmed" | "discarded";

export interface DbWorkBlock {
  id: number;
  started_at: number;
  ended_at: number;
  app_summary: string | null;
  title_summary: string | null;
  evidence: string | null; // JSON: { apps, titles, domains, terms }
  project_id: number | null;
  assignment_source: string | null; // 'manual' | 'rule' | 'llm'
  confidence: number | null;
  status: BlockStatus;
  user_edited: number;
}

// A block whose assignment came from the engine (rule/LLM) and is still open
// — what "confirm all suggestions" acts on. ONE definition for every view.
export const isEngineSuggestion = (b: DbWorkBlock) =>
  b.status === "open" &&
  (b.assignment_source === "rule" || b.assignment_source === "llm") &&
  b.project_id !== null;

// The canonical "Client — Project" label, shared by views and LLM prompts so
// what the model reads matches what the user sees.
export const projectLabel = (p: DbProjectWithClient) => `${p.client_name} — ${p.name}`;

export const clientsRepo = {
  async list(includeArchived = false): Promise<DbClient[]> {
    const db = await getDb();
    return db.select<DbClient[]>(
      `SELECT * FROM clients ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY name COLLATE NOCASE ASC`
    );
  },

  async add(name: string, color: string | null, hourlyRateCents: number | null): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO clients (name, color, hourly_rate_cents, currency, archived, created_at) VALUES ($1, $2, $3, 'EUR', 0, $4)",
      [name, color, hourlyRateCents, Date.now()]
    );
    return result.lastInsertId!;
  },

  async update(id: number, name: string, color: string | null, hourlyRateCents: number | null): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE clients SET name = $1, color = $2, hourly_rate_cents = $3 WHERE id = $4",
      [name, color, hourlyRateCents, id]
    );
  },

  async setArchived(id: number, archived: boolean): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE clients SET archived = $1 WHERE id = $2", [archived ? 1 : 0, id]);
  },
};

export const projectsRepo = {
  async listWithClients(includeArchived = false): Promise<DbProjectWithClient[]> {
    const db = await getDb();
    return db.select<DbProjectWithClient[]>(
      `SELECT p.*, c.name AS client_name, c.color AS client_color, c.hourly_rate_cents AS client_rate_cents, c.archived AS client_archived
       FROM projects p JOIN clients c ON c.id = p.client_id
       ${includeArchived ? "" : "WHERE p.archived = 0 AND c.archived = 0"}
       ORDER BY c.name COLLATE NOCASE ASC, p.name COLLATE NOCASE ASC`
    );
  },

  async add(clientId: number, name: string, billable: boolean, hourlyRateCents: number | null): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO projects (client_id, name, billable, hourly_rate_cents, archived, created_at) VALUES ($1, $2, $3, $4, 0, $5)",
      [clientId, name, billable ? 1 : 0, hourlyRateCents, Date.now()]
    );
    return result.lastInsertId!;
  },

  async setArchived(id: number, archived: boolean): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE projects SET archived = $1 WHERE id = $2", [archived ? 1 : 0, id]);
  },

  // Per-project rounding override (null = use the global setting).
  async setRounding(id: number, increment: number | null): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE projects SET rounding_increment = $1 WHERE id = $2", [increment, id]);
  },
};

// --- Billing entries (the daily close) ---

export type EntryStatus = "draft" | "confirmed" | "exported";

export interface DbTimeEntry {
  id: number;
  project_id: number;
  entry_date: string; // 'YYYY-MM-DD' (local)
  minutes: number;
  rounded_minutes: number;
  narrative: string;
  status: EntryStatus;
  source_block_ids: string; // JSON array of work_blocks ids
  user_edited: number;
  created_at: number;
}

export const entriesRepo = {
  async create(entry: {
    project_id: number;
    entry_date: string;
    minutes: number;
    rounded_minutes: number;
    narrative: string;
    source_block_ids: number[];
  }): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO time_entries (project_id, entry_date, minutes, rounded_minutes, narrative, status, source_block_ids, user_edited, created_at) VALUES ($1, $2, $3, $4, $5, 'draft', $6, 0, $7)",
      [
        entry.project_id,
        entry.entry_date,
        entry.minutes,
        entry.rounded_minutes,
        entry.narrative,
        JSON.stringify(entry.source_block_ids),
        Date.now(),
      ]
    );
    return result.lastInsertId!;
  },

  async forDate(entryDate: string): Promise<DbTimeEntry[]> {
    const db = await getDb();
    return db.select<DbTimeEntry[]>(
      "SELECT * FROM time_entries WHERE entry_date = $1 ORDER BY project_id ASC, id ASC",
      [entryDate]
    );
  },

  async forRange(fromDate: string, toDate: string): Promise<DbTimeEntry[]> {
    const db = await getDb();
    return db.select<DbTimeEntry[]>(
      "SELECT * FROM time_entries WHERE entry_date >= $1 AND entry_date <= $2 ORDER BY entry_date ASC, project_id ASC",
      [fromDate, toDate]
    );
  },

  // A user rewrite makes the narrative a style example for future prompts.
  // Guarded to drafts: confirmed/exported entries are part of the billing
  // record and are never silently rewritten.
  async updateNarrative(id: number, narrative: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE time_entries SET narrative = $1, user_edited = 1 WHERE id = $2 AND status = 'draft'",
      [narrative, id]
    );
  },

  // Machine writes (the ↻ regenerate button): replace the text WITHOUT
  // claiming a user edit — LLM output must never enter the style examples
  // or freeze the entry against future regeneration.
  async setNarrative(id: number, narrative: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE time_entries SET narrative = $1 WHERE id = $2 AND status = 'draft'",
      [narrative, id]
    );
  },

  // Refresh a kept (user-edited) draft's amounts when its blocks changed —
  // the narrative stays, the minutes must never go stale (silent
  // under-billing). Only drafts: closed entries keep their booked minutes.
  async updateAmounts(
    id: number,
    minutes: number,
    roundedMinutes: number,
    sourceBlockIds: number[]
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE time_entries SET minutes = $1, rounded_minutes = $2, source_block_ids = $3 WHERE id = $4 AND status = 'draft'",
      [minutes, roundedMinutes, JSON.stringify(sourceBlockIds), id]
    );
  },

  // O(1) status line for the TopBar anchor — no need to ship whole rows.
  async confirmedMinutesForDate(entryDate: string): Promise<number> {
    const db = await getDb();
    const rows = await db.select<{ m: number | null }[]>(
      "SELECT SUM(rounded_minutes) AS m FROM time_entries WHERE entry_date = $1 AND status != 'draft'",
      [entryDate]
    );
    return rows[0]?.m ?? 0;
  },

  async setStatusForDate(entryDate: string, from: EntryStatus, to: EntryStatus): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE time_entries SET status = $1 WHERE entry_date = $2 AND status = $3",
      [to, entryDate, from]
    );
  },

  async markExported(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(
      `UPDATE time_entries SET status = 'exported' WHERE id IN (${placeholders}) AND status = 'confirmed'`,
      ids
    );
  },

  // Draft regeneration replaces only what the engine owns: untouched drafts.
  // User-edited drafts and confirmed/exported entries are never deleted.
  async deleteUntouchedDrafts(entryDate: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "DELETE FROM time_entries WHERE entry_date = $1 AND status = 'draft' AND user_edited = 0",
      [entryDate]
    );
  },

  // Recent narratives the user rewrote — style few-shots for generation
  // (same-project examples first, then most recent).
  async recentEditedNarratives(projectId: number, limit = 5): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<{ narrative: string }[]>(
      `SELECT narrative FROM time_entries WHERE user_edited = 1
       ORDER BY (project_id = $1) DESC, created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    return rows.map((r) => r.narrative);
  },
};

// The engine-ownership invariant, in ONE place: the segmentation engine owns
// exactly the blocks that are open and untouched by the user. preservedForDay
// is its negation; the recompute DELETE and the overlap repair both use it.
const engineOwned = (prefix = "") =>
  `(${prefix}status = 'open' AND ${prefix}user_edited = 0)`;
const ENGINE_OWNED = engineOwned();

// Write-time check that a project (given as a bound placeholder) is active.
const PROJECT_ACTIVE = (placeholder: string) =>
  `EXISTS (SELECT 1 FROM projects pr JOIN clients cl ON cl.id = pr.client_id
           WHERE pr.id = ${placeholder} AND pr.archived = 0 AND cl.archived = 0)`;

/** Assignable = neither the project nor its client is archived. */
export function isActiveProject(p: DbProjectWithClient): boolean {
  return p.archived === 0 && p.client_archived === 0;
}

export const blocksRepo = {
  // All blocks whose start lies within [startMs, endMs), chronological.
  async forDay(startMs: number, endMs: number): Promise<DbWorkBlock[]> {
    const db = await getDb();
    return db.select<DbWorkBlock[]>(
      "SELECT * FROM work_blocks WHERE started_at >= $1 AND started_at < $2 ORDER BY started_at ASC",
      [startMs, endMs]
    );
  },

  // Blocks the segmentation engine must never touch: anything the user acted
  // on (confirmed/discarded) or structurally edited.
  async preservedForDay(startMs: number, endMs: number): Promise<DbWorkBlock[]> {
    const db = await getDb();
    return db.select<DbWorkBlock[]>(
      `SELECT * FROM work_blocks WHERE started_at >= $1 AND started_at < $2 AND NOT ${ENGINE_OWNED} ORDER BY started_at ASC`,
      [startMs, endMs]
    );
  },

  // Idempotent, RECONCILING recompute: a computed block that substantially
  // overlaps an existing engine-owned block updates it in place (stable id,
  // assignment/source/confidence survive — required since the assignment
  // engine writes onto open blocks); unmatched old blocks are deleted,
  // unmatched new ones inserted. Preserved (confirmed/user-edited) blocks are
  // never touched. A final repair pass removes any engine-owned block that
  // overlaps a preserved one — this makes a user edit racing the recompute
  // self-healing instead of double-counting the time.
  async reconcileComputedForDay(
    startMs: number,
    endMs: number,
    blocks: {
      started_at: number;
      ended_at: number;
      app_summary: string;
      title_summary: string;
      evidence: string;
    }[]
  ): Promise<void> {
    const db = await getDb();
    const existing = await blocksRepo.engineOwnedForDay(startMs, endMs);
    const { pairs, unmatchedExisting, unmatchedComputed } = pairByOverlap(
      existing.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at, row: e })),
      blocks.map((b) => ({ startedAt: b.started_at, endedAt: b.ended_at, block: b }))
    );

    // Phase order matters for crash safety: deleting stale rows FIRST means a
    // crash mid-reconcile can only undercount (self-healing on the next run),
    // never leave overlapping duplicates. Every write re-checks ENGINE_OWNED
    // so a block the user confirms/edits between the snapshot and the write
    // is never touched (same convention as assignAuto).
    if (unmatchedExisting.length > 0) {
      const ids = unmatchedExisting.map((e) => e.row.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
      await db.execute(
        `DELETE FROM work_blocks WHERE id IN (${placeholders}) AND ${ENGINE_OWNED}`,
        ids
      );
    }

    for (const { existing: e, computed: c } of pairs) {
      const b = c.block;
      const identical =
        e.row.started_at === b.started_at &&
        e.row.ended_at === b.ended_at &&
        e.row.app_summary === b.app_summary &&
        e.row.title_summary === b.title_summary &&
        e.row.evidence === b.evidence;
      if (identical) continue; // settled block — skip the pointless rewrite

      // An LLM verdict is only as good as the evidence it judged. When the
      // paired block's duration changes substantially (an in-progress block
      // growing, or absorption reshuffles), an 'llm' assignment is cleared so
      // the next assignment pass re-classifies with the fresh evidence.
      // 'manual' can't occur here (user_edited=1 is not engine-owned) and
      // 'rule' re-applies deterministically anyway.
      const oldDur = e.row.ended_at - e.row.started_at;
      const newDur = b.ended_at - b.started_at;
      const materialChange = newDur > oldDur * 1.33 || newDur < oldDur * 0.67;
      const dropLlmVerdict = materialChange && e.row.assignment_source === "llm";
      await db.execute(
        `UPDATE work_blocks SET started_at = $1, ended_at = $2, app_summary = $3, title_summary = $4, evidence = $5
         ${dropLlmVerdict ? ", project_id = NULL, assignment_source = NULL, confidence = NULL" : ""}
         WHERE id = $6 AND ${ENGINE_OWNED}`,
        [b.started_at, b.ended_at, b.app_summary, b.title_summary, b.evidence, e.row.id]
      );
    }

    // Batched multi-row inserts: one statement per chunk instead of one IPC
    // round trip + fsync per block.
    const CHUNK = 40;
    const inserts = unmatchedComputed.map((c) => c.block);
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const chunk = inserts.slice(i, i + CHUNK);
      const values: string[] = [];
      const params: any[] = [];
      let p = 1;
      for (const b of chunk) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, 'open', 0)`);
        params.push(b.started_at, b.ended_at, b.app_summary, b.title_summary, b.evidence);
      }
      await db.execute(
        `INSERT INTO work_blocks (started_at, ended_at, app_summary, title_summary, evidence, status, user_edited) VALUES ${values.join(", ")}`,
        params
      );
    }

    await db.execute(
      `DELETE FROM work_blocks WHERE started_at >= $1 AND started_at < $2 AND ${ENGINE_OWNED}
       AND EXISTS (
         SELECT 1 FROM work_blocks p
         WHERE p.id != work_blocks.id AND NOT ${engineOwned("p.")}
           AND p.started_at < work_blocks.ended_at AND p.ended_at > work_blocks.started_at
           AND p.started_at >= $1 AND p.started_at < $2
       )`,
      [startMs, endMs]
    );
  },

  // Engine-side assignment write (rules / local LLM). Unlike assignProject
  // (a manual user action), this keeps user_edited = 0 — the block stays
  // engine-owned and its assignment survives recomputes via reconciliation.
  // The EXISTS guard re-checks at write time that the target project is
  // still active (it may have been archived during a minutes-long LLM pass).
  async assignAuto(
    id: number,
    projectId: number,
    source: "rule" | "llm",
    confidence: number
  ): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE work_blocks SET project_id = $1, assignment_source = $2, confidence = $3
       WHERE id = $4 AND ${ENGINE_OWNED} AND ${PROJECT_ACTIVE("$1")}`,
      [projectId, source, confidence, id]
    );
  },

  // Batched variant for the deterministic rules pass (one statement per
  // project instead of one per block).
  async assignAutoBatch(ids: number[], projectId: number, source: "rule" | "llm", confidence: number): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 4}`).join(", ");
    await db.execute(
      `UPDATE work_blocks SET project_id = $1, assignment_source = $2, confidence = $3
       WHERE id IN (${placeholders}) AND ${ENGINE_OWNED} AND ${PROJECT_ACTIVE("$1")}`,
      [projectId, source, confidence, ...ids]
    );
  },

  // Remember a below-threshold / unparseable LLM verdict so the identical
  // block is not re-sent to the model on every run (temperature 0 would
  // reproduce the same rejection forever). Reconciliation clears the marker
  // when the block's evidence changes materially.
  async markLlmAttempt(id: number, confidence: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE work_blocks SET project_id = NULL, assignment_source = 'llm', confidence = $1 WHERE id = $2 AND ${ENGINE_OWNED}`,
      [confidence, id]
    );
  },

  // Open engine-owned blocks of a day — the assignment engine's work list.
  async engineOwnedForDay(startMs: number, endMs: number): Promise<DbWorkBlock[]> {
    const db = await getDb();
    return db.select<DbWorkBlock[]>(
      `SELECT * FROM work_blocks WHERE started_at >= $1 AND started_at < $2 AND ${ENGINE_OWNED} ORDER BY started_at ASC`,
      [startMs, endMs]
    );
  },

  async setStatus(id: number, status: BlockStatus): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE work_blocks SET status = $1 WHERE id = $2", [status, id]);
  },

  // One UPDATE for bulk confirms — a heavy day would otherwise pay one IPC
  // round-trip per block.
  async setStatusMany(ids: number[], status: BlockStatus): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
    await db.execute(
      `UPDATE work_blocks SET status = $1 WHERE id IN (${placeholders})`,
      [status, ...ids]
    );
  },

  async countOpenForDay(startMs: number, endMs: number): Promise<number> {
    const db = await getDb();
    const rows = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM work_blocks WHERE started_at >= $1 AND started_at < $2 AND status = 'open'",
      [startMs, endMs]
    );
    return rows[0]?.n ?? 0;
  },

  // Returns false when the row no longer exists (e.g. replaced by a recompute
  // while the picker was open) — callers must not record feedback then.
  async assignProject(id: number, projectId: number | null): Promise<boolean> {
    const db = await getDb();
    const result = await db.execute(
      "UPDATE work_blocks SET project_id = $1, assignment_source = $2, confidence = NULL, user_edited = 1 WHERE id = $3",
      [projectId, projectId === null ? null : "manual", id]
    );
    return (result.rowsAffected ?? 0) > 0;
  },

  // Merge several blocks into one spanning block (user action). Evidence
  // lists are unioned via the shared evidence contract; the project survives
  // only if every block agrees.
  async merge(ids: number[]): Promise<void> {
    if (ids.length < 2) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<DbWorkBlock[]>(
      `SELECT * FROM work_blocks WHERE id IN (${placeholders})`,
      ids
    );
    if (rows.length < 2) return;
    const startedAt = Math.min(...rows.map((r) => r.started_at));
    const endedAt = Math.max(...rows.map((r) => r.ended_at));
    const merged = mergeEvidence(rows.map((r) => parseEvidenceJson(r.evidence)));
    const projectIds = new Set(rows.map((r) => r.project_id));
    const projectId = projectIds.size === 1 ? rows[0].project_id : null;
    await db.execute(
      "INSERT INTO work_blocks (started_at, ended_at, app_summary, title_summary, evidence, project_id, assignment_source, status, user_edited) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', 1)",
      [
        startedAt,
        endedAt,
        merged.apps.join(" · "),
        rows[0].title_summary,
        JSON.stringify(merged),
        projectId,
        projectId === null ? null : "manual",
      ]
    );
    await db.execute(`DELETE FROM work_blocks WHERE id IN (${placeholders})`, ids);
  },

  // Split a block at a point in time (user action). Both halves inherit the
  // evidence and assignment and are marked user-edited.
  async split(id: number, atMs: number): Promise<void> {
    const db = await getDb();
    const rows = await db.select<DbWorkBlock[]>("SELECT * FROM work_blocks WHERE id = $1", [id]);
    const b = rows[0];
    if (!b || atMs <= b.started_at || atMs >= b.ended_at) return;
    await db.execute(
      "UPDATE work_blocks SET ended_at = $1, user_edited = 1 WHERE id = $2",
      [atMs, id]
    );
    await db.execute(
      "INSERT INTO work_blocks (started_at, ended_at, app_summary, title_summary, evidence, project_id, assignment_source, confidence, status, user_edited) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)",
      [atMs, b.ended_at, b.app_summary, b.title_summary, b.evidence, b.project_id, b.assignment_source, b.confidence, b.status]
    );
  },
};

// --- Assignment rules & learning-loop feedback ---

// The matcher taxonomy is owned by the pure assignment module.
export type { RuleMatcherType } from "./assignment-core";
import type { RuleMatcherType } from "./assignment-core";

export interface DbAssignmentRule {
  id: number;
  matcher_type: RuleMatcherType;
  pattern: string;
  project_id: number;
  created_from: string | null; // 'user' | 'suggestion'
  created_at: number;
}

export interface DbAssignmentFeedback {
  id: number;
  block_evidence: string; // JSON snapshot of the corrected block's evidence
  correct_project_id: number;
  created_at: number;
}

export const rulesRepo = {
  async list(): Promise<DbAssignmentRule[]> {
    const db = await getDb();
    return db.select<DbAssignmentRule[]>(
      "SELECT * FROM assignment_rules ORDER BY created_at DESC"
    );
  },

  async add(
    matcherType: RuleMatcherType,
    pattern: string,
    projectId: number,
    createdFrom: "user" | "suggestion"
  ): Promise<number> {
    const db = await getDb();
    const result = await db.execute(
      "INSERT INTO assignment_rules (matcher_type, pattern, project_id, created_from, created_at) VALUES ($1, $2, $3, $4, $5)",
      [matcherType, pattern, projectId, createdFrom, Date.now()]
    );
    return result.lastInsertId!;
  },

  async remove(id: number): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM assignment_rules WHERE id = $1", [id]);
  },
};

export const feedbackRepo = {
  async add(blockEvidence: string, correctProjectId: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO assignment_feedback (block_evidence, correct_project_id, created_at) VALUES ($1, $2, $3)",
      [blockEvidence, correctProjectId, Date.now()]
    );
  },

  async recent(limit = 50): Promise<DbAssignmentFeedback[]> {
    const db = await getDb();
    return db.select<DbAssignmentFeedback[]>(
      "SELECT * FROM assignment_feedback ORDER BY created_at DESC LIMIT $1",
      [limit]
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

  // --- Billing-entry generation preferences ---

  async getEntryLanguage(): Promise<"en" | "de"> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'entry_language'");
    return rows.length > 0 && rows[0].value === "de" ? "de" : "en";
  },

  async setEntryLanguage(lang: "en" | "de"): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('entry_language', $1)", [lang]);
  },

  async getEntryTone(): Promise<"concise" | "detailed"> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'entry_tone'");
    return rows.length > 0 && rows[0].value === "detailed" ? "detailed" : "concise";
  },

  async setEntryTone(tone: "concise" | "detailed"): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('entry_tone', $1)", [tone]);
  },

  async getEntryTemplate(): Promise<"agency" | "consulting" | "law"> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'entry_template'");
    const v = rows.length > 0 ? rows[0].value : "";
    return v === "consulting" || v === "law" ? v : "agency";
  },

  async setEntryTemplate(template: "agency" | "consulting" | "law"): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('entry_template', $1)", [template]);
  },

  // Global rounding: increment 0 (exact) / 6 / 15 minutes.
  async getRoundingIncrement(): Promise<number> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'rounding_increment'");
    if (rows.length > 0) {
      const n = parseInt(rows[0].value, 10);
      if (n === 0 || n === 6 || n === 15) return n;
    }
    return 0;
  },

  async setRoundingIncrement(inc: number): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('rounding_increment', $1)", [String(inc)]);
  },

  async getRoundingMode(): Promise<"nearest" | "up" | "down"> {
    const db = await getDb();
    const rows = await db.select<any[]>("SELECT value FROM settings WHERE key = 'rounding_mode'");
    const v = rows.length > 0 ? rows[0].value : "";
    return v === "up" || v === "down" ? v : "nearest";
  },

  async setRoundingMode(mode: "nearest" | "up" | "down"): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('rounding_mode', $1)", [mode]);
  },

  // Rule suggestions the user dismissed — never re-nag for the same
  // domain/app→project combination.
  async getDismissedSuggestions(): Promise<string[]> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'dismissed_rule_suggestions'"
    );
    if (rows.length > 0) {
      try {
        const parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string");
      } catch {
        // fall through to empty
      }
    }
    return [];
  },

  async addDismissedSuggestion(key: string): Promise<void> {
    const db = await getDb();
    const current = await settingsRepo.getDismissedSuggestions();
    if (current.includes(key)) return;
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('dismissed_rule_suggestions', $1)",
      [JSON.stringify([...current, key].slice(-100))]
    );
  },

  // Local-midnight timestamp (ms) of the last day fully covered by the block
  // engine. Used to backfill days captured while the app was not running.
  async getBlocksWatermark(): Promise<number | null> {
    const db = await getDb();
    const rows = await db.select<any[]>(
      "SELECT value FROM settings WHERE key = 'blocks_watermark_day'"
    );
    if (rows.length > 0) {
      const n = parseInt(rows[0].value, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return null;
  },

  async setBlocksWatermark(dayStartMs: number): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('blocks_watermark_day', $1)",
      [String(dayStartMs)]
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

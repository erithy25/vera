//! Database schema — **the single source of truth**.
//!
//! ## Why this module exists
//!
//! Before the rebuild, the schema was created in three places:
//!
//! 1. The SQL plugin's migration list in `lib.rs`
//! 2. `ensure_frames_schema()` in `lib.rs` — `CREATE TABLE IF NOT EXISTS` plus
//!    a manual column reconciliation via `PRAGMA table_info`
//! 3. `src/lib/db.ts` — `CREATE TABLE IF NOT EXISTS` again, plus `checkAndSeed`
//!    defaults
//!
//! The comment in `lib.rs` admitted it outright: *"Idempotent: … so it never
//! collides with the sql-plugin migration."* You only write a comment like that
//! when you know the structure is wrong.
//!
//! Practical consequence: adding a column meant remembering three places in two
//! languages — with no test to remind you.
//!
//! Every table is declared exactly once here. The Rust side applies them; the
//! frontend no longer creates any schema.

/// A schema change. Applied in order; `version` is the running number the SQL
/// plugin also uses.
pub struct Migration {
    pub version: i64,
    pub description: &'static str,
    pub sql: &'static str,
}

/// All migrations, in application order.
///
/// **Rules that keep this from drifting apart again:**
/// * Never modify an existing migration — always append a new one.
/// * Every migration must be re-applicable (`IF NOT EXISTS`), because older
///   installs already created tables through the old paths.
/// * `version` is strictly ascending with no gaps (enforced by a test).
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "activity_events",
        sql: "CREATE TABLE IF NOT EXISTS activity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                window_title TEXT,
                started_at INTEGER NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                category TEXT
              );",
    },
    Migration {
        version: 2,
        description: "settings",
        sql: "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
              );",
    },
    Migration {
        version: 3,
        description: "notes_and_goals",
        sql: "CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                body TEXT,
                created_at INTEGER NOT NULL
              );
              CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
              );",
    },
    Migration {
        version: 4,
        description: "captures_legacy",
        sql: "CREATE TABLE IF NOT EXISTS captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                captured_at INTEGER NOT NULL,
                app_name TEXT,
                window_title TEXT,
                ocr_text TEXT,
                char_count INTEGER,
                embedding TEXT
              );",
    },
    Migration {
        version: 5,
        description: "frames_and_segments",
        sql: "CREATE TABLE IF NOT EXISTS frames (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                app TEXT,
                window_title TEXT,
                url TEXT,
                ocr_text TEXT,
                image_path TEXT,
                perceptual_hash TEXT,
                segment_id TEXT,
                frame_index INTEGER,
                thumbnail_path TEXT,
                embedding TEXT
              );
              CREATE TABLE IF NOT EXISTS segments (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                frame_count INTEGER NOT NULL DEFAULT 0,
                size_bytes INTEGER NOT NULL DEFAULT 0
              );",
    },
    Migration {
        version: 6,
        description: "indexes_for_retrieval",
        // The audit found that retrieval queries run over `LIKE '%…%'` and
        // `timestamp` ranges without a single index existing — a full table
        // scan per query as the frame count grows.
        sql: "CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp DESC);
              CREATE INDEX IF NOT EXISTS idx_frames_app ON frames(app);
              CREATE INDEX IF NOT EXISTS idx_frames_segment ON frames(segment_id);
              CREATE INDEX IF NOT EXISTS idx_activity_started ON activity_events(started_at DESC);
              CREATE INDEX IF NOT EXISTS idx_segments_started ON segments(started_at DESC);",
    },
];

/// Columns of the `frames` table in the order they are read.
/// Frontend and backend share this list.
pub const FRAME_COLUMNS: &[&str] = &[
    "id",
    "timestamp",
    "app",
    "window_title",
    "url",
    "ocr_text",
    "segment_id",
    "frame_index",
    "thumbnail_path",
    "embedding",
];

/// Defaults written on first launch.
///
/// Deliberately **without** `cloud_api_key_*`: since the rebuild, API keys live
/// in the Keychain, not in the database (audit finding F-1).
pub const DEFAULT_SETTINGS: &[(&str, &str)] = &[
    ("chat_model", "llama3.2:3b"),
    ("embedding_model", "nomic-embed-text"),
    ("cloud_provider", "anthropic"),
    ("cloud_model_anthropic", "claude-sonnet-4-6"),
    ("cloud_model_openai", "gpt-4o"),
    ("frames_capture_enabled", "false"),
    ("frames_retention_days", "30"),
    ("capture_paused", "false"),
];

/// Setting keys that must never appear in a data export.
pub const EXPORT_BLOCKLIST_PREFIXES: &[&str] = &["cloud_api_key_"];

pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

/// May this setting key be exported?
pub fn is_exportable_setting(key: &str) -> bool {
    !EXPORT_BLOCKLIST_PREFIXES
        .iter()
        .any(|p| key.starts_with(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_contiguous_and_ascending() {
        for (i, m) in MIGRATIONS.iter().enumerate() {
            assert_eq!(
                m.version,
                (i + 1) as i64,
                "migration '{}' has version {}, expected {}",
                m.description,
                m.version,
                i + 1
            );
        }
    }

    #[test]
    fn descriptions_are_unique() {
        let mut d: Vec<&str> = MIGRATIONS.iter().map(|m| m.description).collect();
        let n = d.len();
        d.sort_unstable();
        d.dedup();
        assert_eq!(d.len(), n, "duplicate migration description");
    }

    #[test]
    fn every_migration_is_idempotent() {
        // Older installs already created tables through the old paths. A
        // migration without IF NOT EXISTS would fail there.
        for m in MIGRATIONS {
            for stmt in m.sql.split(';').filter(|s| !s.trim().is_empty()) {
                let s = stmt.trim().to_uppercase();
                if s.starts_with("CREATE TABLE") || s.starts_with("CREATE INDEX") {
                    assert!(
                        s.contains("IF NOT EXISTS"),
                        "migration '{}' is not idempotent:\n{stmt}",
                        m.description
                    );
                }
            }
        }
    }

    #[test]
    fn no_migration_drops_or_deletes() {
        // A DROP inside a migration would destroy user data on rollback. That
        // must never slip in by accident.
        for m in MIGRATIONS {
            let s = m.sql.to_uppercase();
            assert!(!s.contains("DROP TABLE"), "'{}' contains DROP TABLE", m.description);
            assert!(!s.contains("DELETE FROM"), "'{}' contains DELETE FROM", m.description);
        }
    }

    #[test]
    fn latest_version_matches_list() {
        assert_eq!(latest_version(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn frames_migration_declares_every_read_column() {
        let sql = MIGRATIONS
            .iter()
            .find(|m| m.description == "frames_and_segments")
            .expect("frames migration missing")
            .sql;
        for col in FRAME_COLUMNS {
            assert!(
                sql.contains(col),
                "column '{col}' is read but never created"
            );
        }
    }

    #[test]
    fn api_keys_are_not_seeded_into_the_database() {
        // Regression guard for audit finding F-1.
        for (k, _) in DEFAULT_SETTINGS {
            assert!(
                !k.contains("api_key"),
                "API key '{k}' belongs in the Keychain, not the database"
            );
        }
    }

    #[test]
    fn api_keys_can_never_be_exported() {
        assert!(!is_exportable_setting("cloud_api_key_anthropic"));
        assert!(!is_exportable_setting("cloud_api_key_openai"));
        assert!(is_exportable_setting("chat_model"));
        assert!(is_exportable_setting("frames_retention_days"));
    }

    #[test]
    fn retrieval_columns_are_indexed() {
        // The audit flagged the missing index as the 10x-load problem.
        let idx = MIGRATIONS
            .iter()
            .find(|m| m.description == "indexes_for_retrieval")
            .expect("index migration missing")
            .sql;
        for needed in ["frames(timestamp", "frames(app", "activity_events(started_at"] {
            assert!(idx.contains(needed), "index on {needed} missing");
        }
    }
}

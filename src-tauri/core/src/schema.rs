//! Database schema — **the single source of truth**.
//!
//! ## Why this module exists
//!
//! Before the rebuild the schema was created in three places: the SQL plugin's
//! migration list, a second `CREATE TABLE` pass in `lib.rs` that reconciled
//! columns by hand through `PRAGMA table_info`, and a third in `src/lib/db.ts`.
//! The comment on the second one admitted it outright — *"Idempotent: … so it
//! never collides with the sql-plugin migration."* You only write that when you
//! know the structure is wrong. Adding a column meant remembering three places
//! in two languages, with no test to remind you.
//!
//! Every table is declared exactly once here.
//!
//! ## What Vera stores now
//!
//! Preferences. That is the entire list. The scanner keeps no recordings, no
//! frames, no OCR text and no findings, so `settings` is the only table it
//! writes to.
//!
//! Migrations 1–5 are the old product's tables and are kept because history is
//! append-only: an existing install has already applied them, and renumbering
//! would re-run the wrong statements. Migration 7 removes the ones that held
//! captured screen content.

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
/// * Every migration must be re-applicable, because older installs already
///   created tables through the old paths.
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
        sql: "CREATE INDEX IF NOT EXISTS idx_activity_started ON activity_events(started_at DESC);",
    },
    Migration {
        version: 7,
        description: "drop_capture_tables",
        // The only migration that destroys data, and it does so on purpose.
        //
        // These four tables held recorded screen content: OCR'd text of
        // everything that was on screen, frame rows pointing at encrypted video
        // segments, and an app-by-app history of what was in front. Vera does
        // not record any of that any more and offers no way to look at it, so
        // an upgrading user would be left with a permanent, invisible archive
        // of their own screen inside an app that now promises to store nothing.
        //
        // Deleting it is the only honest option. `notes` and `goals` are left
        // alone: unlike the rest, the user typed those themselves.
        sql: "DROP TABLE IF EXISTS frames;
              DROP TABLE IF EXISTS segments;
              DROP TABLE IF EXISTS captures;
              DROP TABLE IF EXISTS activity_events;",
    },
];

/// Defaults written on first launch.
///
/// The old list seeded model names, cloud providers, capture toggles and
/// retention windows. None of those exist any more.
pub const DEFAULT_SETTINGS: &[(&str, &str)] = &[("scan_fps", "1")];

/// Settings written by versions of Vera that no longer exist. Removed at
/// startup so an old install does not keep a cloud API key — which earlier
/// releases stored in plaintext here — in a product that makes no network
/// requests at all.
pub const OBSOLETE_SETTING_PREFIXES: &[&str] = &[
    "cloud_api_key_",
    "cloud_model_",
    "cloud_provider",
    "cloud_last_status",
    "chat_model",
    "embedding_model",
    "ai_engine",
    "frames_",
    "capture_paused",
    "excluded_",
];

pub fn latest_version() -> i64 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

/// Should this setting be deleted on startup?
pub fn is_obsolete_setting(key: &str) -> bool {
    OBSOLETE_SETTING_PREFIXES.iter().any(|p| key.starts_with(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Migrations that are allowed to contain destructive statements, with the
    /// reason recorded next to the exception.
    const DESTRUCTIVE_BY_DESIGN: &[&str] = &["drop_capture_tables"];

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
                if s.starts_with("DROP TABLE") {
                    assert!(
                        s.contains("IF EXISTS"),
                        "migration '{}' would fail on a fresh install:\n{stmt}",
                        m.description
                    );
                }
            }
        }
    }

    #[test]
    fn only_the_declared_migration_destroys_data() {
        // A DROP that slips in unannounced destroys someone's data on upgrade.
        // One migration is allowed to, and it is named here explicitly.
        for m in MIGRATIONS {
            if DESTRUCTIVE_BY_DESIGN.contains(&m.description) {
                continue;
            }
            let s = m.sql.to_uppercase();
            assert!(!s.contains("DROP TABLE"), "'{}' contains DROP TABLE", m.description);
            assert!(!s.contains("DELETE FROM"), "'{}' contains DELETE FROM", m.description);
        }
    }

    #[test]
    fn the_cleanup_migration_keeps_what_the_user_wrote() {
        // notes and goals were typed by a person. Capture data was not.
        let sql = MIGRATIONS
            .iter()
            .find(|m| m.description == "drop_capture_tables")
            .expect("cleanup migration missing")
            .sql
            .to_uppercase();
        for kept in ["NOTES", "GOALS"] {
            assert!(
                !sql.contains(&format!("DROP TABLE IF EXISTS {kept}")),
                "the cleanup migration would delete the user's {kept}"
            );
        }
        for dropped in ["FRAMES", "SEGMENTS", "CAPTURES", "ACTIVITY_EVENTS"] {
            assert!(
                sql.contains(&format!("DROP TABLE IF EXISTS {dropped}")),
                "recorded screen data in {dropped} would survive the upgrade"
            );
        }
    }

    #[test]
    fn settings_table_survives_the_cleanup() {
        // It is the only table the product still uses.
        let sql = MIGRATIONS
            .iter()
            .find(|m| m.description == "drop_capture_tables")
            .unwrap()
            .sql
            .to_uppercase();
        assert!(!sql.contains("DROP TABLE IF EXISTS SETTINGS"));
    }

    #[test]
    fn latest_version_matches_list() {
        assert_eq!(latest_version(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn api_keys_are_not_seeded_and_are_cleaned_up() {
        for (k, _) in DEFAULT_SETTINGS {
            assert!(!k.contains("api_key"), "'{k}' must not be seeded");
        }
        // Earlier releases wrote cloud keys into this table in plaintext.
        assert!(is_obsolete_setting("cloud_api_key_anthropic"));
        assert!(is_obsolete_setting("cloud_api_key_openai"));
    }

    #[test]
    fn cleanup_does_not_touch_current_settings() {
        assert!(!is_obsolete_setting("scan_fps"));
        assert!(!is_obsolete_setting("user_name"));
    }

    #[test]
    fn defaults_are_settings_the_app_actually_reads() {
        // The old defaults named models and providers that no longer exist.
        for (k, _) in DEFAULT_SETTINGS {
            assert!(
                !is_obsolete_setting(k),
                "'{k}' is seeded and then immediately deleted as obsolete"
            );
        }
    }
}

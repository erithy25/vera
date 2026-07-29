//! Secret storage — audit finding F-1.
//!
//! ## What was wrong
//!
//! Cloud API keys were written to the SQLite `settings` table as an ordinary
//! row, in plaintext:
//!
//! ```text
//! conn.execute(
//!     "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
//!     params![format!("cloud_api_key_{provider}"), trimmed],
//! )
//! ```
//!
//! A live, billable Anthropic or OpenAI credential sat unencrypted in
//! `~/Library/Application Support/app.vera.desktop/vera.db`. Reachable by any
//! process running as the user, by any Time Machine backup, and by any folder
//! sync that covers Application Support.
//!
//! What makes it worse: the same codebase already contained a full
//! Keychain/Secure-Enclave vault (`vault.m`) — used only for the media key. The
//! correct mechanism was already built and simply not used for the more
//! sensitive secret.
//!
//! That the author knew is visible in `exportData.ts`, which filtered the key
//! out of exports. The risk was understood; the key stayed in plaintext anyway.
//!
//! ## What holds now
//!
//! Keys live in the macOS Keychain. The database never sees them again, and
//! [`migrate_plaintext_keys`] moves any key from an existing install into the
//! Keychain and deletes the row.

use serde::{Deserialize, Serialize};

/// Providers Vera can talk to. A closed set on purpose: a free-form provider
/// string would become a free-form Keychain account name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    OpenAi,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Provider> {
        match s.trim().to_ascii_lowercase().as_str() {
            "anthropic" => Some(Provider::Anthropic),
            "openai" => Some(Provider::OpenAi),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::Anthropic => "anthropic",
            Provider::OpenAi => "openai",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Provider::Anthropic => "Anthropic",
            Provider::OpenAi => "OpenAI",
        }
    }

    /// Keychain account name. Stable — changing it would orphan stored keys.
    pub fn keychain_account(&self) -> String {
        format!("cloud-api-key-{}", self.as_str())
    }

    /// The legacy settings row this key used to live in. Only used to find and
    /// delete leftovers from older installs.
    pub fn legacy_settings_key(&self) -> String {
        format!("cloud_api_key_{}", self.as_str())
    }

    pub fn all() -> [Provider; 2] {
        [Provider::Anthropic, Provider::OpenAi]
    }
}

/// Rejects values that are obviously not a key, before they reach the Keychain.
///
/// Not a security control — a determined caller can still store nonsense. It
/// exists so a user who pastes the wrong thing gets a clear error instead of a
/// confusing 401 later.
pub fn looks_like_api_key(value: &str) -> bool {
    let v = value.trim();
    v.len() >= 16
        && v.len() <= 512
        && !v.contains(char::is_whitespace)
        && v.chars().all(|c| c.is_ascii_graphic())
}

/// What a migration run did. Reported so the outcome is visible rather than
/// silent.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct MigrationReport {
    /// Providers whose key was moved from the database into the Keychain.
    pub migrated: Vec<String>,
    /// Rows that were deleted without a usable key (empty or malformed).
    pub discarded: Vec<String>,
    /// Providers whose key could not be stored — the row is kept so nothing is
    /// lost, and the user can retry.
    pub failed: Vec<String>,
}

impl MigrationReport {
    pub fn is_empty(&self) -> bool {
        self.migrated.is_empty() && self.discarded.is_empty() && self.failed.is_empty()
    }
}

/// Abstraction over the platform keychain, so the migration logic can be tested
/// without macOS.
pub trait SecretStore {
    fn set(&mut self, account: &str, value: &str) -> Result<(), String>;
    fn get(&self, account: &str) -> Option<String>;
    fn delete(&mut self, account: &str) -> Result<(), String>;
}

/// Reads and clears the legacy plaintext rows.
pub trait LegacySettings {
    fn read(&self, key: &str) -> Option<String>;
    fn delete(&mut self, key: &str) -> Result<(), String>;
}

/// Moves any plaintext key from the settings table into the secret store.
///
/// Order matters and is deliberate: **store first, delete second.** If the
/// process dies in between, the key exists in both places — recoverable. The
/// reverse order could destroy the only copy of a key the user pasted once and
/// never wrote down.
pub fn migrate_plaintext_keys(
    store: &mut impl SecretStore,
    settings: &mut impl LegacySettings,
) -> MigrationReport {
    let mut report = MigrationReport::default();

    for provider in Provider::all() {
        let legacy_key = provider.legacy_settings_key();
        let Some(raw) = settings.read(&legacy_key) else {
            continue;
        };
        let value = raw.trim().to_string();

        if value.is_empty() || !looks_like_api_key(&value) {
            // Nothing worth keeping — remove the row so it cannot leak.
            if settings.delete(&legacy_key).is_ok() {
                report.discarded.push(provider.as_str().to_string());
            }
            continue;
        }

        match store.set(&provider.keychain_account(), &value) {
            Ok(()) => {
                if settings.delete(&legacy_key).is_ok() {
                    report.migrated.push(provider.as_str().to_string());
                } else {
                    // Stored but not removed. The key is safe; the row is not.
                    report.failed.push(provider.as_str().to_string());
                }
            }
            Err(_) => {
                // Keep the row: losing the user's key would be worse than
                // leaving it where it already was.
                report.failed.push(provider.as_str().to_string());
            }
        }
    }

    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[derive(Default)]
    struct FakeStore {
        items: HashMap<String, String>,
        fail_on_set: bool,
    }
    impl SecretStore for FakeStore {
        fn set(&mut self, account: &str, value: &str) -> Result<(), String> {
            if self.fail_on_set {
                return Err("keychain unavailable".into());
            }
            self.items.insert(account.into(), value.into());
            Ok(())
        }
        fn get(&self, account: &str) -> Option<String> {
            self.items.get(account).cloned()
        }
        fn delete(&mut self, account: &str) -> Result<(), String> {
            self.items.remove(account);
            Ok(())
        }
    }

    #[derive(Default)]
    struct FakeSettings {
        rows: HashMap<String, String>,
    }
    impl LegacySettings for FakeSettings {
        fn read(&self, key: &str) -> Option<String> {
            self.rows.get(key).cloned()
        }
        fn delete(&mut self, key: &str) -> Result<(), String> {
            self.rows.remove(key);
            Ok(())
        }
    }

    const REAL_KEY: &str = "sk-ant-api03-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4v";

    #[test]
    fn providers_round_trip() {
        for p in Provider::all() {
            assert_eq!(Provider::parse(p.as_str()), Some(p));
        }
        assert_eq!(Provider::parse("ANTHROPIC"), Some(Provider::Anthropic));
        assert_eq!(Provider::parse("  openai "), Some(Provider::OpenAi));
        assert_eq!(Provider::parse("gemini"), None);
        assert_eq!(Provider::parse(""), None);
    }

    #[test]
    fn keychain_accounts_are_distinct_and_stable() {
        assert_eq!(Provider::Anthropic.keychain_account(), "cloud-api-key-anthropic");
        assert_eq!(Provider::OpenAi.keychain_account(), "cloud-api-key-openai");
        assert_ne!(
            Provider::Anthropic.keychain_account(),
            Provider::OpenAi.keychain_account()
        );
    }

    #[test]
    fn key_shape_check_is_reasonable() {
        assert!(looks_like_api_key(REAL_KEY));
        assert!(looks_like_api_key("sk-proj-T3xK9mPq2LvR8wZa"));
        assert!(!looks_like_api_key(""));
        assert!(!looks_like_api_key("short"));
        assert!(!looks_like_api_key("has spaces in it somewhere"));
        assert!(!looks_like_api_key(&"x".repeat(600)));
    }

    // ---- The migration, which is what actually fixes F-1 -------------------

    #[test]
    fn plaintext_key_moves_to_the_keychain_and_leaves_the_database() {
        let mut store = FakeStore::default();
        let mut settings = FakeSettings::default();
        settings
            .rows
            .insert("cloud_api_key_anthropic".into(), REAL_KEY.into());

        let report = migrate_plaintext_keys(&mut store, &mut settings);

        assert_eq!(report.migrated, vec!["anthropic"]);
        assert_eq!(store.get("cloud-api-key-anthropic").as_deref(), Some(REAL_KEY));
        assert!(
            settings.rows.get("cloud_api_key_anthropic").is_none(),
            "plaintext row survived the migration"
        );
    }

    #[test]
    fn both_providers_migrate_independently() {
        let mut store = FakeStore::default();
        let mut settings = FakeSettings::default();
        settings.rows.insert("cloud_api_key_anthropic".into(), REAL_KEY.into());
        settings
            .rows
            .insert("cloud_api_key_openai".into(), "sk-proj-T3xK9mPq2LvR8wZa5Nb".into());

        let report = migrate_plaintext_keys(&mut store, &mut settings);

        assert_eq!(report.migrated.len(), 2);
        assert!(settings.rows.is_empty(), "plaintext rows survived");
        assert!(store.get("cloud-api-key-anthropic").is_some());
        assert!(store.get("cloud-api-key-openai").is_some());
    }

    #[test]
    fn a_failing_keychain_never_destroys_the_users_key() {
        // Deleting the row before the store succeeds would lose a key the user
        // may have pasted once and never written down.
        let mut store = FakeStore { fail_on_set: true, ..Default::default() };
        let mut settings = FakeSettings::default();
        settings.rows.insert("cloud_api_key_anthropic".into(), REAL_KEY.into());

        let report = migrate_plaintext_keys(&mut store, &mut settings);

        assert_eq!(report.failed, vec!["anthropic"]);
        assert!(report.migrated.is_empty());
        assert_eq!(
            settings.rows.get("cloud_api_key_anthropic").map(String::as_str),
            Some(REAL_KEY),
            "key was lost when the keychain failed"
        );
    }

    #[test]
    fn empty_and_malformed_rows_are_discarded_not_migrated() {
        let mut store = FakeStore::default();
        let mut settings = FakeSettings::default();
        settings.rows.insert("cloud_api_key_anthropic".into(), "   ".into());
        settings.rows.insert("cloud_api_key_openai".into(), "nope".into());

        let report = migrate_plaintext_keys(&mut store, &mut settings);

        assert_eq!(report.discarded.len(), 2);
        assert!(report.migrated.is_empty());
        assert!(settings.rows.is_empty(), "junk rows should still be removed");
        assert!(store.items.is_empty(), "junk should not reach the keychain");
    }

    #[test]
    fn migration_is_idempotent() {
        let mut store = FakeStore::default();
        let mut settings = FakeSettings::default();
        settings.rows.insert("cloud_api_key_anthropic".into(), REAL_KEY.into());

        let first = migrate_plaintext_keys(&mut store, &mut settings);
        let second = migrate_plaintext_keys(&mut store, &mut settings);

        assert_eq!(first.migrated, vec!["anthropic"]);
        assert!(second.is_empty(), "second run should have nothing to do");
        assert_eq!(store.get("cloud-api-key-anthropic").as_deref(), Some(REAL_KEY));
    }

    #[test]
    fn nothing_happens_on_a_clean_install() {
        let mut store = FakeStore::default();
        let mut settings = FakeSettings::default();
        let report = migrate_plaintext_keys(&mut store, &mut settings);
        assert!(report.is_empty());
        assert!(store.items.is_empty());
    }

    #[test]
    fn the_legacy_key_name_matches_what_the_old_code_wrote() {
        // If this drifts, migration silently finds nothing and old plaintext
        // keys stay in the database forever.
        assert_eq!(
            Provider::Anthropic.legacy_settings_key(),
            "cloud_api_key_anthropic"
        );
        assert_eq!(Provider::OpenAi.legacy_settings_key(), "cloud_api_key_openai");
    }
}

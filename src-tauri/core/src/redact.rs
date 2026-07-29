//! Redaction — **the single implementation**.
//!
//! ## Why this module exists
//!
//! Before the rebuild, redaction existed three times, in three languages:
//!
//! | Location | Language |
//! |---|---|
//! | `src-tauri/src/lib.rs::redact_sensitive_data` | Rust |
//! | `src/lib/db.ts::redactSensitiveData` | TypeScript |
//! | `src-tauri/src/frame-capture.swift::redactText` | Swift |
//!
//! They were not identical, and the differences were security-relevant:
//!
//! | Pattern | Rust (old) | TypeScript (old) | Swift (old) |
//! |---|---|---|---|
//! | OpenAI key | `sk-…{48,}` | `sk-…{48,}` | `sk-…{20,}` |
//! | Stripe restricted | exactly `{24}` | exactly `{24}` | `{16,}` |
//! | Google `AIza…` | missing | missing | present |
//! | JWT `eyJ….….…` | missing | missing | present |
//! | Entropy heuristic | missing | missing | present |
//!
//! In practice: an OpenAI key of 30 characters was redacted by the Swift path
//! and written **in plaintext to the database** by the Rust path. Which path
//! ran depended on whether the text came from frame capture or from the
//! activity tracker.
//!
//! ## What holds now
//!
//! This module is the **union of all three**, each with the strictest (most
//! redacting) threshold. It is therefore strictly safer than any of the three
//! predecessors.
//!
//! The TypeScript copy is removed outright — persistence runs in the backend
//! anyway. The Swift copy stays, because it runs inside the sidecar before data
//! ever leaves that process, but `tests/swift_parity.rs` reads the Swift source
//! and fails the build as soon as the two pattern lists drift apart.

use regex::Regex;
use std::sync::OnceLock;

/// Replacement text for redacted spans. Must match the Swift sidecar.
pub const REDACTED: &str = "[redacted]";

/// A named pattern. The name appears in tests and diagnostics, never in user data.
pub struct SecretPattern {
    pub name: &'static str,
    pub regex: &'static str,
}

/// The canonical pattern list.
///
/// **Changes here must be mirrored in `frame-capture.swift`** —
/// `tests/swift_parity.rs` enforces that.
pub const SECRET_PATTERNS: &[SecretPattern] = &[
    // --- Provider keys ------------------------------------------------------
    SecretPattern {
        name: "openai",
        // Threshold 20 instead of 48: the old Rust/TS threshold let every
        // OpenAI key shorter than 48 characters through unredacted.
        regex: r"sk-(proj-)?[A-Za-z0-9_\-]{20,}",
    },
    SecretPattern {
        name: "anthropic",
        regex: r"sk-ant-(api03-)?[A-Za-z0-9_\-]{20,}",
    },
    SecretPattern {
        name: "stripe_restricted",
        // {16,} instead of exactly {24}: Stripe key lengths are not guaranteed.
        regex: r"rk_(live|test)_[A-Za-z0-9]{16,}",
    },
    SecretPattern {
        name: "stripe_secret",
        regex: r"sk_(live|test)_[A-Za-z0-9]{16,}",
    },
    SecretPattern {
        name: "github",
        regex: r"gh[pousr]_[A-Za-z0-9]{36,}",
    },
    SecretPattern {
        name: "github_fine_grained",
        regex: r"github_pat_[A-Za-z0-9_]{40,}",
    },
    SecretPattern {
        name: "aws_access_key",
        regex: r"(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}",
    },
    SecretPattern {
        name: "google_api",
        // Missing entirely from Rust and TypeScript.
        regex: r"AIza[0-9A-Za-z\-_]{20,}",
    },
    SecretPattern {
        name: "slack",
        regex: r"xox[baprs]-[A-Za-z0-9\-]{10,}",
    },
    SecretPattern {
        name: "sendgrid",
        regex: r"SG\.[A-Za-z0-9_\-]{20,}",
    },
    SecretPattern {
        name: "gitlab",
        regex: r"glpat-[A-Za-z0-9_\-]{16,}",
    },
    SecretPattern {
        name: "npm",
        regex: r"npm_[A-Za-z0-9]{30,}",
    },
    SecretPattern {
        name: "jwt",
        // Missing entirely from Rust and TypeScript.
        regex: r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]*",
    },
    // --- Banking ------------------------------------------------------------
    SecretPattern {
        name: "iban",
        regex: r"\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b",
    },
    // --- Private keys -------------------------------------------------------
    SecretPattern {
        name: "pem_header",
        regex: r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    },
];

/// Assigned secrets: `password: …`, `API_KEY=…`
///
/// Deliberately requires `:` or `=` after the keyword. Without that condition,
/// every prose sentence containing the word "password" would be redacted.
const ASSIGNMENT_PATTERN: &str =
    r#"(?i)\b(token|password|passwd|pwd|secret|api[_\-]?key|auth[_\-]?token|client[_\-]?secret|access[_\-]?token)\s*[:=]\s*["']?[A-Za-z0-9_\-\.\+/=]{12,}["']?"#;

/// `Authorization: Bearer <token>` — the standard HTTP case.
///
/// Needs separate handling because a **space** follows `Bearer`, not a colon.
/// This is exactly where all three predecessor implementations failed: they all
/// required `\s*[:=]\s*` and therefore missed the single most common way a
/// token appears on a developer's screen.
const BEARER_PATTERN: &str = r#"(?i)\bbearer\s+["']?[A-Za-z0-9_\-\.\+/=]{12,}["']?"#;

/// Long runs of digits (account numbers, IDs, phone lists).
const LONG_DIGITS_PATTERN: &str = r"\b\d{10,}\b";

/// Credit card numbers — 13–16 digits with optional separators.
const CARD_PATTERN: &str = r"\b(?:\d[ \-]?){13,16}\b";

/// Compiled patterns. Built once, because regex compilation is expensive and
/// this function runs per captured frame.
struct Compiled {
    secrets: Vec<(&'static str, Regex)>,
    assignment: Option<Regex>,
    bearer: Option<Regex>,
    long_digits: Option<Regex>,
    card: Option<Regex>,
}

fn compiled() -> &'static Compiled {
    static CELL: OnceLock<Compiled> = OnceLock::new();
    CELL.get_or_init(|| Compiled {
        secrets: SECRET_PATTERNS
            .iter()
            .filter_map(|p| Regex::new(p.regex).ok().map(|r| (p.name, r)))
            .collect(),
        assignment: Regex::new(ASSIGNMENT_PATTERN).ok(),
        bearer: Regex::new(BEARER_PATTERN).ok(),
        long_digits: Regex::new(LONG_DIGITS_PATTERN).ok(),
        card: Regex::new(CARD_PATTERN).ok(),
    })
}

/// Luhn checksum. Prevents every 16-digit number from counting as a card.
pub fn is_luhn_valid(s: &str) -> bool {
    let digits: Vec<u32> = s.chars().filter_map(|c| c.to_digit(10)).collect();
    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }
    let mut sum = 0u32;
    let mut double = false;
    for d in digits.iter().rev() {
        let mut d = *d;
        if double {
            d *= 2;
            if d > 9 {
                d -= 9;
            }
        }
        sum += d;
        double = !double;
    }
    sum % 10 == 0
}

/// Shannon entropy in bits per character.
pub fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let mut counts = [0usize; 256];
    let mut total = 0usize;
    for b in s.bytes() {
        counts[b as usize] += 1;
        total += 1;
    }
    let total_f = total as f64;
    -counts
        .iter()
        .filter(|&&n| n > 0)
        .map(|&n| {
            let p = n as f64 / total_f;
            p * p.log2()
        })
        .sum::<f64>()
}

/// Entropy threshold for "looks like a random key". Taken from the Swift
/// implementation, which was the only one that had one.
const ENTROPY_THRESHOLD: f64 = 3.6;
const ENTROPY_MIN_LEN: usize = 24;

/// Does a single token look like a random key?
///
/// Deliberately only applies from 24 characters up and requires a base64-like
/// character set — otherwise every longer word would be redacted.
pub fn looks_like_random_secret(token: &str) -> bool {
    if token.chars().count() < ENTROPY_MIN_LEN {
        return false;
    }
    let allowed = token
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=' | '_' | '-' | '.'));
    if !allowed {
        return false;
    }
    // At least two character classes — all lowercase is language, not a key.
    let has_lower = token.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = token.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = token.chars().any(|c| c.is_ascii_digit());
    let classes = [has_lower, has_upper, has_digit].iter().filter(|b| **b).count();
    if classes < 2 {
        return false;
    }
    shannon_entropy(token) >= ENTROPY_THRESHOLD
}

/// Redacts every detected secret in `text`.
///
/// Order matters: specific provider patterns first, generic rules after.
/// Otherwise an `sk-…` key would only be partially matched by the digit rule
/// and the result would be a half-visible key — worse than no redaction at all.
pub fn redact(text: &str) -> String {
    let c = compiled();
    let mut out = text.to_string();

    // 1) Provider patterns and private keys
    for (_, re) in &c.secrets {
        out = re.replace_all(&out, REDACTED).into_owned();
    }

    // 2) Assigned secrets and bearer headers
    if let Some(re) = &c.assignment {
        out = re.replace_all(&out, REDACTED).into_owned();
    }
    if let Some(re) = &c.bearer {
        out = re.replace_all(&out, REDACTED).into_owned();
    }

    // 3) Credit cards (only with a valid Luhn checksum)
    if let Some(re) = &c.card {
        out = re
            .replace_all(&out, |caps: &regex::Captures| {
                let m = caps.get(0).map(|x| x.as_str()).unwrap_or("");
                if is_luhn_valid(m) {
                    REDACTED.to_string()
                } else {
                    m.to_string()
                }
            })
            .into_owned();
    }

    // 4) Long digit runs
    if let Some(re) = &c.long_digits {
        out = re.replace_all(&out, REDACTED).into_owned();
    }

    // 5) Per-token entropy heuristic — catches keys from unknown providers
    out = out
        .split_inclusive(char::is_whitespace)
        .map(|chunk| {
            let trimmed = chunk.trim_end();
            let ws = &chunk[trimmed.len()..];
            if looks_like_random_secret(trimmed) {
                format!("{REDACTED}{ws}")
            } else {
                chunk.to_string()
            }
        })
        .collect();

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_clean(s: &str) -> bool {
        !redact(s).contains(REDACTED)
    }

    #[test]
    fn luhn_accepts_valid_and_rejects_invalid() {
        assert!(is_luhn_valid("4539578763621486"));
        assert!(is_luhn_valid("4539 5787 6362 1486"));
        assert!(!is_luhn_valid("4539578763621487"));
        assert!(!is_luhn_valid("1234"));
    }

    #[test]
    fn entropy_separates_random_from_language() {
        assert!(shannon_entropy("aaaaaaaaaaaaaaaaaaaaaaaa") < 1.0);
        assert!(shannon_entropy("T3xK9mPq2LvR8wZa5NbYc7Hd") > 3.6);
    }

    // ---- The regressions that triggered this rebuild -----------------------

    #[test]
    fn openai_key_shorter_than_48_is_now_redacted() {
        // Exactly the case the old Rust and TS implementations let through,
        // because both required {48,}.
        let text = "export OPENAI_API_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbY";
        assert!(redact(text).contains(REDACTED), "30-character key not redacted");
        assert!(!redact(text).contains("T3xK9mPq2LvR8wZa5NbY"));
    }

    #[test]
    fn google_key_is_now_redacted() {
        // Missing from Rust and TypeScript entirely.
        let text = "AIzaSyD3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4v";
        assert!(redact(text).contains(REDACTED), "Google key not redacted");
    }

    #[test]
    fn jwt_is_now_redacted() {
        let text = "Cookie: session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92";
        assert!(redact(text).contains(REDACTED), "JWT not redacted");
    }

    #[test]
    fn stripe_key_of_unusual_length_is_redacted() {
        // Old: exactly {24}. A 20-character key slipped through.
        assert!(redact("rk_live_T3xK9mPq2LvR8wZa").contains(REDACTED));
        assert!(redact("sk_live_T3xK9mPq2LvR8wZa5NbYc7Hd").contains(REDACTED));
    }

    #[test]
    fn bearer_header_is_now_redacted() {
        // A new capability, not a preserved one: none of the three predecessor
        // implementations caught this, because a space follows `Bearer` while
        // all three required `[:=]`.
        for s in [
            "Authorization: Bearer abc123def456ghi789jkl",
            "curl -H 'Authorization: Bearer T3xK9mPq2LvR8wZa5NbYc7Hd'",
            "bearer abc123def456ghi789jkl",
        ] {
            assert!(redact(s).contains(REDACTED), "bearer token not redacted: {s}");
            assert!(!redact(s).contains("abc123def456ghi789jkl"));
        }
    }

    // ---- Everything the predecessors caught must still be caught -----------

    #[test]
    fn keeps_everything_the_old_rust_caught() {
        for s in [
            "sk-proj-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xYzA1bC2dE3fG4hI5jK",
            "rk_live_T3xK9mPq2LvR8wZa5Nb",
            "sk_live_T3xK9mPq2LvR8wZa5Nb",
            "ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY",
            "AKIAT3XK9MPQ2LVR8WZA",
            "password: Hunter2PassPhrase9x",
            "DE89370400440532013000",
            "4539578763621486",
            "12345678901234",
        ] {
            assert!(redact(s).contains(REDACTED), "no longer redacted: {s}");
        }
    }

    #[test]
    fn keeps_everything_the_old_swift_caught() {
        for s in [
            "AIzaSyD3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4v",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefgh",
            "-----BEGIN RSA PRIVATE KEY-----",
            "-----BEGIN OPENSSH PRIVATE KEY-----",
            // Entropy heuristic: a key from an unknown provider
            "T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4v",
        ] {
            assert!(redact(s).contains(REDACTED), "not redacted: {s}");
        }
    }

    // ---- What must NOT be redacted ----------------------------------------

    #[test]
    fn ordinary_screen_text_survives() {
        for s in [
            "Welcome to this tutorial about APIs",
            "npm install --save-dev typescript",
            "git commit -m 'fix: handle empty response'",
            "const configuration = loadConfiguration()",
            "Latency p50: 42ms p95: 118ms",
            "Vera 0.5.2 on macOS 13",
            "erik@macbook ~/dev/vera %",
            "1.2.3 v2.11.2 ^4.6.0",
        ] {
            assert!(is_clean(s), "falsely redacted: {s}\n -> {}", redact(s));
        }
    }

    #[test]
    fn prose_is_not_mistaken_for_a_secret() {
        let text = "The collaboration worked out remarkably well and everyone involved \
                    was thoroughly satisfied with the outcome of the discussion.";
        assert!(is_clean(text), "prose redacted: {}", redact(text));
    }

    #[test]
    fn redaction_is_idempotent() {
        let once = redact("sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd");
        assert_eq!(redact(&once), once, "second pass changed the result");
    }

    #[test]
    fn no_secret_survives_partially() {
        // A half-visible key would be worse than no redaction at all.
        let key = "sk-proj-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4v";
        let out = redact(&format!("KEY={key} END"));
        for window_len in [8usize, 12, 16] {
            let chars: Vec<char> = key.chars().collect();
            for w in chars.windows(window_len) {
                let frag: String = w.iter().collect();
                assert!(!out.contains(&frag), "fragment '{frag}' survived: {out}");
            }
        }
    }

    #[test]
    fn empty_and_whitespace_are_safe() {
        assert_eq!(redact(""), "");
        assert_eq!(redact("   "), "   ");
        assert_eq!(redact("\n\n"), "\n\n");
    }

    #[test]
    fn all_patterns_compile() {
        for p in SECRET_PATTERNS {
            assert!(Regex::new(p.regex).is_ok(), "pattern '{}' does not compile", p.name);
        }
        assert!(Regex::new(ASSIGNMENT_PATTERN).is_ok());
        assert!(Regex::new(BEARER_PATTERN).is_ok());
        assert!(Regex::new(LONG_DIGITS_PATTERN).is_ok());
        assert!(Regex::new(CARD_PATTERN).is_ok());
    }

    #[test]
    fn pattern_names_are_unique() {
        let mut names: Vec<&str> = SECRET_PATTERNS.iter().map(|p| p.name).collect();
        let n = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), n, "duplicate pattern name");
    }
}

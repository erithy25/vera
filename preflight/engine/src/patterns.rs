//! Anbieter-Muster.
//!
//! Anders als bei einem dateibasierten Scanner ist das Muster hier **nicht** ein
//! Regex über den vollen Token. Es ist zerlegt in:
//!   1. Präfix  -> wird OCR-tolerant unscharf gematcht (`ocr::fuzzy_prefix_match`)
//!   2. Körper  -> wird nur über Länge und Zeichensatz geprüft, nie exakt
//!
//! Diese Zerlegung ist der Grund, warum ein durch OCR beschädigter Key gefunden
//! wird: Ein einzelner Zeichenfehler im Körper ändert weder Länge noch
//! Zeichensatz, und im Präfix wird er toleriert.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Öffentlich unkritisch (publishable keys). Wird gemeldet, aber ohne Alarm.
    Info,
    /// Sensibel, aber begrenzt (z. B. Test-Keys).
    Medium,
    /// Echtes Zugangsdatum mit Missbrauchspotenzial.
    High,
    /// Sofortige Rotation nötig — direkter Zugriff oder Abrechnungswirkung.
    Critical,
}

impl Severity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Severity::Info => "info",
            Severity::Medium => "medium",
            Severity::High => "high",
            Severity::Critical => "critical",
        }
    }
}

/// Welche Zeichen darf der Körper enthalten?
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BodyCharset {
    /// A-Za-z0-9
    Base62,
    /// A-Za-z0-9 plus - und _
    Base64Url,
    /// A-Za-z0-9 plus + / =
    Base64Std,
    /// 0-9a-fA-F
    Hex,
    /// Nur Großbuchstaben und Ziffern (AWS Access Key IDs)
    UpperAlnum,
}

impl BodyCharset {
    pub fn accepts(&self, c: char) -> bool {
        match self {
            BodyCharset::Base62 => c.is_ascii_alphanumeric(),
            BodyCharset::Base64Url => c.is_ascii_alphanumeric() || c == '-' || c == '_',
            BodyCharset::Base64Std => {
                c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '='
            }
            BodyCharset::Hex => c.is_ascii_hexdigit(),
            BodyCharset::UpperAlnum => c.is_ascii_uppercase() || c.is_ascii_digit(),
        }
    }

    /// Anteil der Zeichen, die zum Zeichensatz passen. OCR kann einzelne Zeichen
    /// verfälschen, deshalb wird nie 100 % verlangt.
    pub fn ratio(&self, s: &str) -> f64 {
        if s.is_empty() {
            return 0.0;
        }
        let ok = s.chars().filter(|c| self.accepts(*c)).count();
        ok as f64 / s.chars().count() as f64
    }
}

#[derive(Debug, Clone)]
pub struct Pattern {
    pub id: &'static str,
    pub label: &'static str,
    pub provider: &'static str,
    /// Kanonische Präfixe. Das erste ist das bevorzugte für die Anzeige.
    pub prefixes: &'static [&'static str],
    pub body_min: usize,
    pub body_max: usize,
    pub charset: BodyCharset,
    pub severity: Severity,
    /// Wie viele OCR-Fehler im Präfix werden toleriert. Kurze/generische
    /// Präfixe bekommen 0 oder 1, damit sie nicht auf normalen Text passen.
    pub prefix_tolerance: usize,
    /// Mindest-Zufälligkeit des Körpers. Anbieter mit sehr langen, eindeutigen
    /// Präfixen brauchen wenig; generische Präfixe brauchen viel.
    pub min_randomness: f64,
}

/// Die Musterliste. Bewusst kuratiert statt vollständig: jedes Muster hier ist
/// eines, das auf einem Entwickler-Bildschirm realistisch sichtbar wird.
pub const PATTERNS: &[Pattern] = &[
    // ---- OpenAI ----
    Pattern {
        id: "openai_project",
        label: "OpenAI Project Key",
        provider: "OpenAI",
        prefixes: &["sk-proj-"],
        body_min: 20,
        body_max: 200,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        prefix_tolerance: 2,
        min_randomness: 0.42,
    },
    Pattern {
        id: "openai_legacy",
        label: "OpenAI API Key",
        provider: "OpenAI",
        prefixes: &["sk-"],
        body_min: 32,
        body_max: 200,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        // Sehr kurzes Präfix -> keine Toleranz, sonst trifft es auf beliebigen Text
        prefix_tolerance: 0,
        min_randomness: 0.55,
    },
    // ---- Anthropic ----
    Pattern {
        id: "anthropic",
        label: "Anthropic API Key",
        provider: "Anthropic",
        prefixes: &["sk-ant-api03-", "sk-ant-"],
        body_min: 20,
        body_max: 200,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        prefix_tolerance: 2,
        min_randomness: 0.42,
    },
    // ---- GitHub ----
    Pattern {
        id: "github_pat",
        label: "GitHub Personal Access Token",
        provider: "GitHub",
        prefixes: &["ghp_", "gho_", "ghu_", "ghs_", "ghr_"],
        body_min: 30,
        body_max: 100,
        charset: BodyCharset::Base62,
        severity: Severity::Critical,
        prefix_tolerance: 1,
        min_randomness: 0.45,
    },
    Pattern {
        id: "github_fine_grained",
        label: "GitHub Fine-Grained Token",
        provider: "GitHub",
        prefixes: &["github_pat_"],
        body_min: 40,
        body_max: 120,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        prefix_tolerance: 2,
        min_randomness: 0.42,
    },
    // ---- AWS ----
    Pattern {
        id: "aws_access_key",
        label: "AWS Access Key ID",
        provider: "AWS",
        prefixes: &["AKIA", "ASIA", "ABIA", "ACCA"],
        body_min: 16,
        body_max: 16,
        charset: BodyCharset::UpperAlnum,
        severity: Severity::Critical,
        prefix_tolerance: 1,
        min_randomness: 0.40,
    },
    // ---- Google ----
    Pattern {
        id: "google_api",
        label: "Google API Key",
        provider: "Google",
        prefixes: &["AIza"],
        body_min: 35,
        body_max: 35,
        charset: BodyCharset::Base64Url,
        severity: Severity::High,
        prefix_tolerance: 1,
        min_randomness: 0.45,
    },
    // ---- Stripe ----
    Pattern {
        id: "stripe_secret",
        label: "Stripe Secret Key (live)",
        provider: "Stripe",
        prefixes: &["sk_live_", "rk_live_"],
        body_min: 20,
        body_max: 120,
        charset: BodyCharset::Base62,
        severity: Severity::Critical,
        prefix_tolerance: 2,
        min_randomness: 0.42,
    },
    Pattern {
        id: "stripe_test",
        label: "Stripe Secret Key (test)",
        provider: "Stripe",
        prefixes: &["sk_test_", "rk_test_"],
        body_min: 20,
        body_max: 120,
        charset: BodyCharset::Base62,
        severity: Severity::Medium,
        prefix_tolerance: 2,
        min_randomness: 0.42,
    },
    Pattern {
        id: "stripe_publishable",
        label: "Stripe Publishable Key",
        provider: "Stripe",
        prefixes: &["pk_live_", "pk_test_"],
        body_min: 20,
        body_max: 120,
        charset: BodyCharset::Base62,
        severity: Severity::Info,
        prefix_tolerance: 2,
        min_randomness: 0.42,
    },
    // ---- Slack ----
    Pattern {
        id: "slack_token",
        label: "Slack Token",
        provider: "Slack",
        prefixes: &["xoxb-", "xoxp-", "xoxa-", "xoxs-", "xoxr-", "xapp-"],
        body_min: 20,
        body_max: 120,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        prefix_tolerance: 1,
        min_randomness: 0.38,
    },
    // ---- SendGrid ----
    Pattern {
        id: "sendgrid",
        label: "SendGrid API Key",
        provider: "SendGrid",
        prefixes: &["SG."],
        body_min: 30,
        body_max: 120,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        prefix_tolerance: 0,
        min_randomness: 0.45,
    },
    // ---- GitLab ----
    Pattern {
        id: "gitlab_pat",
        label: "GitLab Personal Access Token",
        provider: "GitLab",
        prefixes: &["glpat-"],
        body_min: 18,
        body_max: 60,
        charset: BodyCharset::Base64Url,
        severity: Severity::Critical,
        prefix_tolerance: 1,
        min_randomness: 0.45,
    },
    // ---- npm ----
    Pattern {
        id: "npm_token",
        label: "npm Access Token",
        provider: "npm",
        prefixes: &["npm_"],
        body_min: 30,
        body_max: 60,
        charset: BodyCharset::Base62,
        severity: Severity::Critical,
        prefix_tolerance: 1,
        min_randomness: 0.45,
    },
    // ---- Hugging Face ----
    Pattern {
        id: "huggingface",
        label: "Hugging Face Token",
        provider: "Hugging Face",
        prefixes: &["hf_"],
        body_min: 30,
        body_max: 50,
        charset: BodyCharset::Base62,
        severity: Severity::High,
        prefix_tolerance: 0,
        min_randomness: 0.48,
    },
    // ---- Linear / Figma ----
    Pattern {
        id: "linear",
        label: "Linear API Key",
        provider: "Linear",
        prefixes: &["lin_api_"],
        body_min: 30,
        body_max: 60,
        charset: BodyCharset::Base62,
        severity: Severity::High,
        prefix_tolerance: 2,
        min_randomness: 0.45,
    },
    Pattern {
        id: "figma",
        label: "Figma Access Token",
        provider: "Figma",
        prefixes: &["figd_"],
        body_min: 30,
        body_max: 60,
        charset: BodyCharset::Base64Url,
        severity: Severity::High,
        prefix_tolerance: 1,
        min_randomness: 0.45,
    },
    // ---- Twilio ----
    Pattern {
        id: "twilio_sid",
        label: "Twilio Account SID",
        provider: "Twilio",
        prefixes: &["AC"],
        body_min: 32,
        body_max: 32,
        charset: BodyCharset::Hex,
        severity: Severity::Medium,
        prefix_tolerance: 0,
        min_randomness: 0.35,
    },
    // ---- Supabase / Vercel ----
    Pattern {
        id: "supabase_service",
        label: "Supabase Service Role Key",
        provider: "Supabase",
        prefixes: &["sbp_"],
        body_min: 30,
        body_max: 80,
        charset: BodyCharset::Base62,
        severity: Severity::Critical,
        prefix_tolerance: 1,
        min_randomness: 0.45,
    },
];

/// Muster ohne Präfix, die über den Kontext erkannt werden müssen.
/// Werden in `detect.rs` gesondert behandelt.
pub const PRIVATE_KEY_HEADERS: &[&str] = &[
    "-----BEGIN RSA PRIVATE KEY-----",
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----BEGIN DSA PRIVATE KEY-----",
    "-----BEGIN EC PRIVATE KEY-----",
    "-----BEGIN PGP PRIVATE KEY BLOCK-----",
    "-----BEGIN PRIVATE KEY-----",
    "-----BEGIN ENCRYPTED PRIVATE KEY-----",
];

/// Schlüsselwörter für zugewiesene Geheimnisse: `PASSWORD=…`, `api_key: …`
pub const ASSIGNMENT_KEYWORDS: &[&str] = &[
    "password", "passwd", "pwd", "secret", "api_key", "apikey", "api-key",
    "access_token", "accesstoken", "auth_token", "authtoken", "bearer",
    "client_secret", "clientsecret", "private_key", "privatekey", "session_token",
    "refresh_token", "db_password", "database_password", "aws_secret_access_key",
    "secret_key", "secretkey", "encryption_key", "signing_key", "master_key",
];

/// Datenbank-Verbindungsstrings, in denen ein Passwort stehen kann.
pub const DB_URI_SCHEMES: &[&str] = &[
    "postgres://", "postgresql://", "mysql://", "mongodb://", "mongodb+srv://",
    "redis://", "rediss://", "amqp://", "amqps://", "mssql://", "clickhouse://",
];

pub fn pattern_by_id(id: &str) -> Option<&'static Pattern> {
    PATTERNS.iter().find(|p| p.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_pattern_ids_unique() {
        let mut ids: Vec<&str> = PATTERNS.iter().map(|p| p.id).collect();
        let n = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), n, "doppelte Pattern-ID gefunden");
    }

    #[test]
    fn all_patterns_have_sane_bounds() {
        for p in PATTERNS {
            assert!(!p.prefixes.is_empty(), "{} hat kein Präfix", p.id);
            assert!(p.body_min <= p.body_max, "{} hat body_min > body_max", p.id);
            assert!(p.body_min >= 16 || p.charset == BodyCharset::UpperAlnum,
                "{} erlaubt sehr kurze Körper", p.id);
            assert!(p.min_randomness >= 0.0 && p.min_randomness <= 1.0);
            assert!(p.prefix_tolerance <= 2);
        }
    }

    #[test]
    fn short_prefixes_have_zero_tolerance() {
        // Ein 3-Zeichen-Präfix mit Toleranz 2 würde auf beliebigen Text passen.
        for p in PATTERNS {
            let shortest = p.prefixes.iter().map(|s| s.len()).min().unwrap();
            assert!(
                p.prefix_tolerance < shortest,
                "{}: Toleranz {} >= kürzestes Präfix {}",
                p.id, p.prefix_tolerance, shortest
            );
            if shortest <= 4 {
                assert!(p.prefix_tolerance <= 1, "{} braucht strengere Toleranz", p.id);
            }
        }
    }

    #[test]
    fn charset_ratio_works() {
        assert!((BodyCharset::Base62.ratio("abcDEF123") - 1.0).abs() < 1e-9);
        assert!(BodyCharset::Base62.ratio("abc-DEF") < 1.0);
        assert!((BodyCharset::Base64Url.ratio("abc-DEF_123") - 1.0).abs() < 1e-9);
        assert!((BodyCharset::Hex.ratio("deadBEEF00") - 1.0).abs() < 1e-9);
    }

    #[test]
    fn lookup_by_id() {
        assert!(pattern_by_id("openai_project").is_some());
        assert!(pattern_by_id("does_not_exist").is_none());
    }
}

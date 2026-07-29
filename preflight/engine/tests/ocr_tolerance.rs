//! Der Kern des Produkts: Werden Secrets gefunden, die die OCR **falsch gelesen
//! hat**?
//!
//! Das ist der Unterschied zu gitleaks/trufflehog. Diese Tests simulieren die
//! Fehler, die Vision und Tesseract auf Bildschirmtext tatsächlich machen.
//! Fällt einer davon, ist Preflight nur ein langsamerer gitleaks.

use preflight_engine::{detect_in_text, Severity};

/// Wendet eine typische OCR-Verwechslung an.
fn corrupt(s: &str, from: char, to: char, nth: usize) -> String {
    let mut count = 0;
    s.chars()
        .map(|c| {
            if c == from {
                count += 1;
                if count == nth {
                    return to;
                }
            }
            c
        })
        .collect()
}

fn found(text: &str) -> bool {
    !detect_in_text(text).is_empty()
}

fn pattern_of(text: &str) -> Option<String> {
    detect_in_text(text).first().map(|f| f.pattern_id.clone())
}

// ---------------------------------------------------------------------------
// Einzelzeichen-Verwechslungen im Präfix
// ---------------------------------------------------------------------------

#[test]
fn openai_key_with_o_read_as_zero() {
    // "proj" -> "pr0j": die häufigste OCR-Verwechslung überhaupt
    let damaged = "sk-pr0j-T3xK9mPq2LvR8wZa5NbYc7Hd";
    assert!(found(damaged), "sk-pr0j- wurde nicht erkannt");
    assert_eq!(pattern_of(damaged).as_deref(), Some("openai_project"));
}

#[test]
fn openai_key_with_s_read_as_five() {
    let damaged = "5k-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
    assert!(found(damaged), "5k-proj- wurde nicht erkannt");
}

#[test]
fn github_token_with_h_read_as_b() {
    let damaged = "gbp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY";
    assert!(found(damaged), "gbp_ wurde nicht erkannt");
}

#[test]
fn anthropic_key_with_zero_read_as_o() {
    // "api03" -> "apiO3"
    let damaged = "sk-ant-apiO3-T3xK9mPq2LvR8wZa5NbYc7HdQ2";
    assert!(found(damaged), "sk-ant-apiO3- wurde nicht erkannt");
}

#[test]
fn aws_key_with_i_read_as_one() {
    // AKIA -> AK1A
    let damaged = "AK1AT3XK9MPQ2LVR8WZA";
    assert!(found(damaged), "AK1A wurde nicht erkannt");
}

// ---------------------------------------------------------------------------
// Unicode-Artefakte aus Terminal-Rendering
// ---------------------------------------------------------------------------

#[test]
fn en_dash_instead_of_hyphen() {
    // Terminals und OCR liefern gerne einen Halbgeviertstrich
    let damaged = "sk\u{2013}proj\u{2013}T3xK9mPq2LvR8wZa5NbYc7Hd";
    assert!(found(damaged), "En-Dash-Variante wurde nicht erkannt");
}

#[test]
fn non_breaking_hyphen() {
    let damaged = "sk\u{2011}proj\u{2011}T3xK9mPq2LvR8wZa5NbYc7Hd";
    assert!(found(damaged), "Non-breaking hyphen wurde nicht erkannt");
}

#[test]
fn zero_width_space_inside_token() {
    let damaged = "sk-proj-T3xK9mPq\u{200B}2LvR8wZa5NbYc7Hd";
    assert!(found(damaged), "Zero-width space wurde nicht entfernt");
}

// ---------------------------------------------------------------------------
// Fehler im Körper — dürfen die Erkennung nie verhindern
// ---------------------------------------------------------------------------

#[test]
fn body_corruption_does_not_prevent_detection() {
    let clean = "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
    assert!(found(clean));

    // Jede einzelne Verwechslung im Körper muss überlebt werden
    for (from, to) in [
        ('0', 'O'), ('O', '0'), ('1', 'l'), ('l', '1'), ('5', 'S'),
        ('S', '5'), ('8', 'B'), ('B', '8'), ('2', 'Z'), ('9', 'g'),
    ] {
        let damaged = corrupt(clean, from, to, 1);
        assert!(
            found(&damaged),
            "Körper-Verwechslung {from}->{to} verhinderte die Erkennung: {damaged}"
        );
    }
}

#[test]
fn multiple_body_errors_still_detected() {
    // Drei Fehler gleichzeitig im Körper
    let damaged = "sk-proj-T3xK9mPqZLvR8wSa5NbYc7Hd";
    assert!(found(damaged), "Mehrfachfehler im Körper verhinderten die Erkennung");
}

// ---------------------------------------------------------------------------
// Der wichtigste Negativtest: Toleranz darf nicht in Beliebigkeit umschlagen
// ---------------------------------------------------------------------------

#[test]
fn tolerance_does_not_match_arbitrary_text() {
    for text in [
        "Willkommen zu diesem Tutorial über APIs",
        "npm install --save-dev typescript",
        "git commit -m 'fix: handle empty response'",
        "const configuration = loadConfiguration()",
        "https://api.example.com/v1/users?limit=100",
        "docker run -p 8080:8080 myimage:latest",
    ] {
        let f = detect_in_text(text);
        assert!(f.is_empty(), "Fehlalarm bei '{text}': {f:#?}");
    }
}

#[test]
fn publishable_key_never_reported_as_critical() {
    // Regression: pk_live_ hat im Verwechslungsraum Distanz 1 zu sk_live_.
    // Ohne den Anker auf dem ersten Zeichen würde ein harmloser öffentlicher
    // Key als kritisches Secret gemeldet.
    let f = detect_in_text("pk_live_T3xK9mPq2LvR8wZa5NbYc7Hd");
    assert_eq!(f.len(), 1, "erwartete genau einen Fund");
    assert_eq!(f[0].severity, Severity::Info, "publishable key darf nicht kritisch sein");
    assert_eq!(f[0].pattern_id, "stripe_publishable");
}

#[test]
fn secret_key_still_reported_as_critical() {
    let f = detect_in_text("sk_live_T3xK9mPq2LvR8wZa5NbYc7Hd");
    assert_eq!(f.len(), 1);
    assert_eq!(f[0].severity, Severity::Critical);
    assert_eq!(f[0].pattern_id, "stripe_secret");
}

// ---------------------------------------------------------------------------
// Regression: Muster mit mehreren Präfixen
// ---------------------------------------------------------------------------

#[test]
fn every_prefix_of_multi_prefix_patterns_matches() {
    // Regression gegen den `?`-Bug: ein `?` in der Präfix-Schleife führte dazu,
    // dass nur das jeweils erste Präfix eines Musters je gefunden wurde.
    let cases: &[(&str, &str)] = &[
        ("ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY", "github_pat"),
        ("gho_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY", "github_pat"),
        ("ghu_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY", "github_pat"),
        ("ghs_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY", "github_pat"),
        ("ghr_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY", "github_pat"),
        ("AKIAT3XK9MPQ2LVR8WZA", "aws_access_key"),
        ("ASIAT3XK9MPQ2LVR8WZA", "aws_access_key"),
        ("xoxb-T3xK9mPq2LvR8wZa5NbYc7Hd", "slack_token"),
        ("xoxp-T3xK9mPq2LvR8wZa5NbYc7Hd", "slack_token"),
        ("xapp-T3xK9mPq2LvR8wZa5NbYc7Hd", "slack_token"),
    ];

    for (token, expected) in cases {
        let f = detect_in_text(token);
        assert!(!f.is_empty(), "{token} wurde gar nicht erkannt");
        assert_eq!(
            f[0].pattern_id, *expected,
            "{token} wurde als {} statt {expected} erkannt",
            f[0].pattern_id
        );
    }
}

// ---------------------------------------------------------------------------
// Kontext: Keys stehen selten allein
// ---------------------------------------------------------------------------

#[test]
fn key_inside_assignment_is_found() {
    for text in [
        "export OPENAI_API_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd",
        "OPENAI_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd",
        r#"{"apiKey":"sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd"}"#,
        "curl -H 'Authorization: Bearer sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd'",
        "--token=ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY",
    ] {
        assert!(found(text), "Key im Kontext nicht gefunden: {text}");
    }
}

#[test]
fn key_in_realistic_terminal_output() {
    let screen = r#"
erik@macbook ~/dev/myapp % cat .env
NODE_ENV=development
PORT=3000
OPENAI_API_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd
DATABASE_URL=postgres://localhost:5432/myapp
erik@macbook ~/dev/myapp %
"#;
    let f = detect_in_text(screen);
    assert!(!f.is_empty(), "Key in Terminal-Ausgabe nicht gefunden");
    assert!(f.iter().any(|x| x.pattern_id == "openai_project"));
}

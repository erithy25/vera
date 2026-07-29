//! Die Datenschutz-Invariante.
//!
//! Preflight verspricht: **Das gefundene Secret wird nie gespeichert.**
//! Das ist kein Marketing, sondern die Grundlage dafür, dass jemand ein
//! Sicherheitswerkzeug überhaupt auf sein Material loslässt. Ein Werkzeug, das
//! Secrets findet und sie dann in seiner eigenen Datenbank ablegt, hat das
//! Problem nur verschoben.
//!
//! Diese Tests sichern die Zusage ab — inklusive der serialisierten Form, die
//! tatsächlich auf die Platte geht.

use preflight_engine::{aggregate, detect_in_text, FrameText};

/// Die Körper der Test-Secrets. Keiner davon darf je in einer Ausgabe stehen.
const BODIES: &[&str] = &[
    "T3xK9mPq2LvR8wZa5NbYc7Hd",
    "T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY",
    "Hunter2PassPhrase9x",
];

const SECRETS: &[&str] = &[
    "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd",
    "ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY",
    "sk_live_T3xK9mPq2LvR8wZa5NbYc7Hd",
    "xoxb-T3xK9mPq2LvR8wZa5NbYc7Hd",
    "postgres://admin:Hunter2PassPhrase9x@db.example.com:5432/app",
    "DB_PASSWORD=Hunter2PassPhrase9x",
];

#[test]
fn finding_preview_never_contains_the_secret_body() {
    for secret in SECRETS {
        for f in detect_in_text(secret) {
            for body in BODIES {
                assert!(
                    !f.preview.contains(body),
                    "Vorschau '{}' enthält den Secret-Körper '{}'",
                    f.preview,
                    body
                );
            }
            // Auch nennenswerte Teilstücke dürfen nicht durchrutschen.
            for body in BODIES {
                for window_len in [12usize, 16] {
                    let chars: Vec<char> = body.chars().collect();
                    if chars.len() < window_len {
                        continue;
                    }
                    for w in chars.windows(window_len) {
                        let frag: String = w.iter().collect();
                        assert!(
                            !f.preview.contains(&frag),
                            "Vorschau '{}' enthält das Fragment '{}'",
                            f.preview,
                            frag
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn serialized_finding_contains_no_secret() {
    for secret in SECRETS {
        let findings = detect_in_text(secret);
        let json = serde_json::to_string(&findings).expect("Serialisierung");
        for body in BODIES {
            assert!(
                !json.contains(body),
                "Serialisierter Fund enthält '{body}':\n{json}"
            );
        }
    }
}

#[test]
fn serialized_scan_summary_contains_no_secret() {
    let frames: Vec<FrameText> = SECRETS
        .iter()
        .enumerate()
        .map(|(i, s)| FrameText {
            timestamp_ms: (i as u64) * 1000,
            frame_index: i as u64,
            text: format!("erik@macbook ~ % echo {s}"),
        })
        .collect();

    let summary = aggregate(&frames, 4000);
    assert!(!summary.is_clean(), "Kontrolle: es hätte Funde geben müssen");

    let json = serde_json::to_string_pretty(&summary).expect("Serialisierung");
    for body in BODIES {
        assert!(
            !json.contains(body),
            "Scan-Zusammenfassung enthält '{body}':\n{json}"
        );
    }
}

#[test]
fn preview_is_still_useful_for_locating_the_finding() {
    // Die Invariante darf nicht dadurch erfüllt werden, dass die Vorschau leer
    // ist — der Nutzer muss den Fund im Video wiedererkennen können.
    let f = &detect_in_text("sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd")[0];
    assert!(f.preview.starts_with("sk-proj-"), "Präfix fehlt: {}", f.preview);
    assert!(f.preview.contains('•'), "Maskierung fehlt: {}", f.preview);
    assert!(f.token_len > 0, "Länge fehlt");
}

#[test]
fn debug_output_of_summary_contains_no_secret() {
    // Auch ein versehentliches `dbg!`/`{:?}` in einem Logpfad darf nicht leaken.
    let frames = vec![FrameText {
        timestamp_ms: 0,
        frame_index: 0,
        text: "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd".into(),
    }];
    let dbg = format!("{:?}", aggregate(&frames, 4000));
    for body in BODIES {
        assert!(!dbg.contains(body), "Debug-Ausgabe enthält '{body}'");
    }
}

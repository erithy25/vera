//! Recall-Messung — die Metrik R1 aus Kill-Gate 1.
//!
//! Zielwert im 90-Tage-Plan: **≥ 90 % der gepflanzten Secrets werden gefunden.**
//! Unter 75 % ist das Produkt physikalisch nicht baubar.
//!
//! Der echte Test in Woche 1 läuft mit Vision-OCR auf einem echten Screencast.
//! Hier wird die OCR-Stufe simuliert: Die Secrets werden mit den Verwechslungen
//! beschädigt, die Vision auf Monospace-Text nachweislich macht. Das misst
//! nicht, ob Vision gut liest — das misst, ob die **Engine** übersteht, was
//! Vision falsch liest. Genau das ist der Teil, den wir hier prüfen können.

use preflight_engine::detect_in_text;

/// Realistische Secrets in korrekter Länge und Form pro Anbieter.
const PLANTED: &[(&str, &str)] = &[
    ("openai_project", "sk-proj-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xYzA1bC"),
    ("openai_legacy",  "sk-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xYzA1bC2dE"),
    ("anthropic",      "sk-ant-api03-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY"),
    ("github_pat",     "ghp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY"),
    ("github_fine_grained", "github_pat_11ABCDEFG0T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY"),
    ("aws_access_key", "AKIAT3XK9MPQ2LVR8WZA"),
    ("google_api",     "AIzaT3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6x"),
    ("stripe_secret",  "sk_live_T3xK9mPq2LvR8wZa5NbYc7HdQ2rSt"),
    ("stripe_test",    "sk_test_T3xK9mPq2LvR8wZa5NbYc7HdQ2rSt"),
    ("slack_token",    "xoxb-T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4"),
    ("sendgrid",       "SG.T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW6xY"),
    ("gitlab_pat",     "glpat-T3xK9mPq2LvR8wZa5N"),
    ("npm_token",      "npm_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW"),
    ("huggingface",    "hf_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW"),
    ("linear",         "lin_api_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4"),
    ("figma",          "figd_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW"),
    ("supabase_service", "sbp_T3xK9mPq2LvR8wZa5NbYc7HdQ2rStU4vW"),
    ("private_key",    "-----BEGIN RSA PRIVATE KEY-----"),
    ("db_uri",         "postgres://admin:Hunter2PassPhrase9x@db.example.com:5432/app"),
    ("jwt",            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
];

/// Kontexte, in denen ein Secret auf einem Bildschirm auftaucht.
const CONTEXTS: &[&str] = &[
    "{}",
    "export API_KEY={}",
    "erik@macbook ~/dev % echo {}",
    "  \"apiKey\": \"{}\",",
    "curl -H 'Authorization: Bearer {}' https://api.example.com",
    "const key = \"{}\";",
    "KEY={}  # in .env",
];

/// Verwechslungspaare, die Vision auf Monospace-Text tatsächlich produziert.
const CONFUSIONS: &[(char, char)] = &[
    ('0', 'O'), ('O', '0'), ('1', 'l'), ('l', '1'), ('I', '1'),
    ('5', 'S'), ('S', '5'), ('8', 'B'), ('B', '8'), ('2', 'Z'),
    ('9', 'g'), ('6', 'G'), ('7', 'T'), ('u', 'v'), ('c', 'C'),
];

/// Beschädigt jedes `step`-te verwechselbare Zeichen — deterministisch, damit
/// der Test reproduzierbar bleibt (kein Zufall, siehe Workflow-Regeln).
fn damage(s: &str, step: usize) -> String {
    if step == 0 {
        return s.to_string();
    }
    let mut n = 0usize;
    s.chars()
        .map(|c| {
            if let Some((_, to)) = CONFUSIONS.iter().find(|(from, _)| *from == c) {
                n += 1;
                if n % step == 0 {
                    return *to;
                }
            }
            c
        })
        .collect()
}

fn detected(text: &str) -> bool {
    !detect_in_text(text).is_empty()
}

#[test]
fn recall_on_undamaged_secrets_is_total() {
    let mut misses = Vec::new();
    for (id, secret) in PLANTED {
        for ctx in CONTEXTS {
            let text = ctx.replace("{}", secret);
            if !detected(&text) {
                misses.push(format!("{id} in '{ctx}'"));
            }
        }
    }
    assert!(
        misses.is_empty(),
        "Unbeschädigte Secrets müssen zu 100 % gefunden werden. Verfehlt:\n  {}",
        misses.join("\n  ")
    );
}

#[test]
fn recall_under_ocr_damage_meets_kill_gate_1() {
    // step = 1 -> jedes verwechselbare Zeichen falsch (extrem)
    // step = 3 -> jedes dritte  (realistisch schlecht)
    // step = 5 -> jedes fünfte  (realistisch typisch)
    let mut rows: Vec<(usize, usize, usize)> = Vec::new();

    for step in [5usize, 3, 2] {
        let mut total = 0usize;
        let mut hits = 0usize;
        let mut misses: Vec<String> = Vec::new();

        for (id, secret) in PLANTED {
            for ctx in CONTEXTS {
                let damaged = damage(secret, step);
                let text = ctx.replace("{}", &damaged);
                total += 1;
                if detected(&text) {
                    hits += 1;
                } else {
                    misses.push(format!("{id} (step {step}) in '{ctx}' -> {damaged}"));
                }
            }
        }

        let recall = hits as f64 / total as f64;
        println!(
            "OCR-Schaden 1/{step}: Recall {:.1} % ({hits}/{total})",
            recall * 100.0
        );
        if !misses.is_empty() && misses.len() <= 8 {
            for m in &misses {
                println!("    verfehlt: {m}");
            }
        }
        rows.push((step, hits, total));
    }

    // Der Zielwert gilt für den realistisch typischen Fall (jedes fünfte Zeichen).
    let (_, hits, total) = rows[0];
    let recall = hits as f64 / total as f64;
    assert!(
        recall >= 0.90,
        "Recall {:.1} % bei realistischem OCR-Schaden verfehlt Kill-Gate 1 (Ziel ≥ 90 %)",
        recall * 100.0
    );

    // Auch im schlechten Fall darf die Engine nicht unter die Abbruchgrenze fallen.
    let (_, hits3, total3) = rows[1];
    let recall3 = hits3 as f64 / total3 as f64;
    assert!(
        recall3 >= 0.75,
        "Recall {:.1} % bei starkem OCR-Schaden unter der Abbruchgrenze (75 %)",
        recall3 * 100.0
    );
}

#[test]
fn every_planted_pattern_is_reachable() {
    // Kontrolle, dass jedes Muster in der Liste überhaupt von der Engine
    // erkannt werden kann — ein Muster, das nie greift, ist toter Code.
    for (expected_id, secret) in PLANTED {
        let f = detect_in_text(secret);
        assert!(!f.is_empty(), "{expected_id}: '{secret}' wurde nicht erkannt");
        let ids: Vec<&str> = f.iter().map(|x| x.pattern_id.as_str()).collect();
        assert!(
            ids.contains(expected_id),
            "{expected_id}: erkannt als {ids:?} statt als erwartetes Muster"
        );
    }
}

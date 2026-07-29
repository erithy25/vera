//! Fehlalarm-Test — die Metrik R2 aus Kill-Gate 1.
//!
//! Zielwert im 90-Tage-Plan: **< 1 Fehlalarm pro 10 Minuten Video.**
//! Bei 1 fps sind 10 Minuten = 600 Frames. Der Zielwert entspricht also
//! < 1 Fund auf 600 saubere Frames, also einer Fehlalarmrate < 0,17 %.
//!
//! Der Korpus unten ist echter Entwickler-Bildschirminhalt: Terminal, Editor,
//! DevTools, Git, npm, Docker, Kubernetes — und vor allem **Tutorial-Inhalte
//! mit Beispiel-Keys**, weil genau das unsere Zielgruppe aufnimmt.
//!
//! Ein Fehlalarm hier ist teurer als ein verpasster Fund: Wer beim ersten Scan
//! zwanzig Fehlalarme sieht, deinstalliert das Werkzeug und kommt nie zurück.

use preflight_engine::{detect_in_text, Severity};

/// Realistischer Bildschirminhalt ohne echte Secrets.
/// Jeder Eintrag entspricht dem OCR-Text eines Frames.
const CLEAN_FRAMES: &[&str] = &[
    // ---- Terminal: git ----
    "erik@macbook ~/dev/preflight % git status\nOn branch main\nnothing to commit, working tree clean",
    "commit 9649cf4d3fce1f15937e62994509a074f80ab12c\nAuthor: Erik <erik@example.com>\nDate: Wed Jul 29 12:04:11 2026 +0200",
    "* 3c198ac Revise README\n* 2d1daca Deploy current site\n* a300220 Add reset script",
    "git rebase --exec 'cargo test' origin/main",
    "To github.com:erithy25/preflight.git\n   9649cf4..15937e6  main -> main",
    "git diff --stat\n src/lib.rs | 42 +++++++++++++++++++-----\n 1 file changed, 34 insertions(+), 8 deletions(-)",

    // ---- Terminal: npm / node ----
    "npm install\nadded 284 packages, and audited 285 packages in 6s\nfound 0 vulnerabilities",
    "\"integrity\": \"sha512-QaGbBLWnaJSLnLBFzWnHQVfQzKPjJT2Zt3iNlvHVdLmM9YVfhKQKUjxqLmxAJdKzKQ==\"",
    "\"resolved\": \"https://registry.npmjs.org/react/-/react-19.1.0.tgz\"",
    "vite v7.0.4 building for production...\n✓ 342 modules transformed.\ndist/assets/index-a3f9b2c1.js   184.32 kB │ gzip: 58.11 kB",
    "dist/assets/index-4F2A9B7C.css    12.04 kB │ gzip:  3.21 kB",
    "> preflight@0.1.0 build\n> tsc --noEmit && vite build",
    "npm WARN deprecated inflight@1.0.6: This module is not supported",

    // ---- Terminal: cargo / rust ----
    "   Compiling preflight-engine v0.1.0 (/home/user/preflight/engine)\n    Finished dev profile in 0.19s",
    "test result: ok. 47 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out",
    "error[E0308]: mismatched types\n  --> src/detect.rs:214:31\n   |\n214 |     let body: String = token",
    "warning: unused variable: `consumed`\n  --> src/detect.rs:180:13",

    // ---- Terminal: docker / k8s ----
    "docker run -d -p 8080:8080 --name api myorg/api:v2.11.2",
    "REPOSITORY   TAG       IMAGE ID       CREATED        SIZE\nmyorg/api    v2.11.2   a3f9b2c1d4e5   2 hours ago    142MB",
    "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "kubectl get pods -n production\nNAME                    READY   STATUS    RESTARTS   AGE\napi-7d9f8c6b5-x2klm     1/1     Running   0          4d",
    "Successfully built a3f9b2c1d4e5\nSuccessfully tagged myorg/api:latest",

    // ---- DevTools / Netzwerk ----
    "GET https://api.example.com/v1/users?limit=100&offset=0 200 OK",
    "content-type: application/json; charset=utf-8\ncontent-encoding: gzip\ncache-control: max-age=3600",
    "Request URL: https://cdn.example.com/assets/main.a3f9b2c1.js\nStatus Code: 200",
    "x-request-id: 550e8400-e29b-41d4-a716-446655440000",
    "set-cookie: session=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
    "{\"id\":\"550e8400-e29b-41d4-a716-446655440000\",\"createdAt\":\"2026-07-29T12:04:11.482Z\"}",
    "Failed to load resource: net::ERR_CONNECTION_REFUSED http://localhost:3000/api",

    // ---- Editor: normaler Code ----
    "import { useState, useEffect } from \"react\";\nimport { invoke } from \"@tauri-apps/api/core\";",
    "const [isScanning, setIsScanning] = useState(false);\nconst configuration = loadConfiguration();",
    "export function formatTimestamp(ms: number): string {\n  const total = Math.floor(ms / 1000);",
    "pub fn randomness_score(s: &str) -> f64 {\n    let comp = Composition::of(s);",
    "background: #a3f9b2; color: #1c1c1a; border: 1px solid #e6e4dd;",
    "className=\"flex items-center justify-between gap-4 py-5 text-left\"",
    "@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; } }",

    // ---- Konfiguration ohne Geheimnisse ----
    "NODE_ENV=development\nPORT=3000\nHOST=0.0.0.0\nLOG_LEVEL=debug",
    "DATABASE_URL=postgres://localhost:5432/myapp",
    "REDIS_URL=redis://127.0.0.1:6379",
    "VITE_API_BASE=https://api.example.com",
    "[dependencies]\nserde = { version = \"1.0\", features = [\"derive\"] }\ntauri = \"2.11.2\"",
    "\"typescript\": \"~5.8.3\",\n\"vite\": \"^7.0.4\",\n\"react\": \"^19.1.0\"",

    // ---- Tutorial-Inhalte: der kritischste Fall ----
    "In diesem Video zeige ich euch, wie ihr euren OPENAI_API_KEY einrichtet.",
    "export OPENAI_API_KEY=sk-your-api-key-here",
    "OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXX",
    "GITHUB_TOKEN=ghp_REPLACE_WITH_YOUR_TOKEN",
    "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
    "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY_HERE",
    "api_key: <your-api-key>",
    "const apiKey = process.env.OPENAI_API_KEY; // niemals hart kodieren!",
    "Authorization: Bearer YOUR_TOKEN_HERE",
    "curl -H \"Authorization: Bearer $TOKEN\" https://api.example.com/v1/me",
    "DATABASE_PASSWORD=changeme",
    "password: ********",
    "token: •••••••••••••••••",
    "SECRET_KEY=todo-generate-a-real-one",

    // ---- Prosa / Slides ----
    "Willkommen zurück zu Teil 3 der Serie über lokale KI-Werkzeuge",
    "Kapitel 4: Authentifizierung und Autorisierung im Detail",
    "Heute bauen wir zusammen einen Secret-Scanner in Rust",
    "Fragen? Schreibt sie in die Kommentare — ich antworte auf alle.",

    // ---- Zahlen, IDs, Zeitstempel ----
    "Build #4821 succeeded in 2m 14s at 2026-07-29T10:22:41Z",
    "1753776000  1753776060  1753776120",
    "Latenz p50: 42ms  p95: 118ms  p99: 340ms",
    "192.168.1.100:5432  10.0.0.14:6379  127.0.0.1:3000",
    "v0.5.2 -> v0.6.0 (minor)  |  ^4.6.0  ~5.8.3  >=1.77.2",
];

#[test]
fn zero_false_positives_on_clean_developer_screens() {
    let mut alarms: Vec<(usize, String, String, Severity)> = Vec::new();

    for (i, frame) in CLEAN_FRAMES.iter().enumerate() {
        for f in detect_in_text(frame) {
            alarms.push((i, f.pattern_id.clone(), f.preview.clone(), f.severity));
        }
    }

    if !alarms.is_empty() {
        let mut msg = format!(
            "\n{} Fehlalarm(e) auf {} sauberen Frames:\n",
            alarms.len(),
            CLEAN_FRAMES.len()
        );
        for (i, id, preview, sev) in &alarms {
            msg.push_str(&format!(
                "  Frame {i:>2} [{}] {id:<22} {preview}\n      Quelle: {}\n",
                sev.as_str(),
                CLEAN_FRAMES[*i].lines().next().unwrap_or("")
            ));
        }
        panic!("{msg}");
    }
}

/// Explizite Prüfung der Kill-Gate-1-Metrik in ihrer eigenen Einheit.
#[test]
fn false_positive_rate_meets_kill_gate_1() {
    let alarms: usize = CLEAN_FRAMES
        .iter()
        .map(|f| detect_in_text(f).len())
        .sum();

    let rate = alarms as f64 / CLEAN_FRAMES.len() as f64;
    // Zielwert: < 1 Fehlalarm pro 600 Frames (10 Min bei 1 fps) = 0,00167
    let target = 1.0 / 600.0;

    println!(
        "Fehlalarme: {alarms} auf {} Frames = {:.5} (Ziel < {:.5})",
        CLEAN_FRAMES.len(),
        rate,
        target
    );
    assert!(
        rate < target,
        "Fehlalarmrate {rate:.5} verfehlt Kill-Gate 1 (Ziel < {target:.5})"
    );
}

/// Tutorial-Platzhalter einzeln, damit ein Regressionsfehler sofort zeigt,
/// welcher Platzhalter durchgerutscht ist.
#[test]
fn every_tutorial_placeholder_is_silent() {
    const PLACEHOLDERS: &[&str] = &[
        "sk-your-api-key-here",
        "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXX",
        "ghp_REPLACE_WITH_YOUR_TOKEN",
        "AKIAIOSFODNN7EXAMPLE",
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "sk_test_YOUR_TEST_KEY_HERE",
        "<your-api-key>",
        "{API_KEY}",
        "[your-token]",
        "YOUR_TOKEN_HERE",
        "sk-1234567890abcdef1234567890abcdef",
        "ghp_000000000000000000000000000000000000",
        "sk-proj-abcdefghijklmnopqrstuvwxyz",
        "password: ********",
        "changeme",
    ];

    for p in PLACEHOLDERS {
        let f = detect_in_text(p);
        assert!(f.is_empty(), "Platzhalter '{p}' erzeugte einen Alarm: {f:#?}");
    }
}

/// Build-Artefakte und Hashes, die auf jedem Entwicklerbildschirm stehen.
#[test]
fn build_artifacts_never_alarm() {
    const ARTIFACTS: &[&str] = &[
        "9649cf4d3fce1f15937e62994509a074f80ab12c",
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "sha512-QaGbBLWnaJSLnLBFzWnHQVfQzKPjJT2Zt3iNlvHVdLmM9YVfhKQKUjxq==",
        "550e8400-e29b-41d4-a716-446655440000",
        "index-a3f9b2c1.js",
        "chunk-4F2A9B7C.mjs",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
        "#a3f9b2c1",
        "2026-07-29T12:04:11.482Z",
        "1753776000000",
        "192.168.1.100",
    ];

    for a in ARTIFACTS {
        let f = detect_in_text(a);
        assert!(f.is_empty(), "Build-Artefakt '{a}' erzeugte einen Alarm: {f:#?}");
    }
}

/// Gegenprobe: Der Korpus darf nicht dadurch sauber sein, dass die Engine
/// generell nichts findet. Ein echtes Secret im selben Kontext muss anschlagen.
#[test]
fn corpus_is_not_silent_because_engine_is_broken() {
    let real = "erik@macbook ~/dev % export OPENAI_API_KEY=sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
    let f = detect_in_text(real);
    assert!(
        !f.is_empty(),
        "Kontrolle fehlgeschlagen: echtes Secret im Terminal-Kontext nicht gefunden"
    );
}

//! Haupt-Erkennung: aus OCR-Text werden Funde.
//!
//! Grundregel des gesamten Produkts, hier durchgesetzt: **Das gefundene Secret
//! wird niemals gespeichert.** Ein `Finding` trägt nur Typ, Position und eine
//! maskierte Vorschau. Wer Preflights Datenbank stiehlt, erbeutet nichts.

use serde::{Deserialize, Serialize};

use crate::entropy::{randomness_score, Composition};
use crate::negative::{structural_rejection, Rejection};
use crate::ocr::{fuzzy_prefix_match, normalize_unicode, secret_charset_ratio};
use crate::patterns::{
    Pattern, ASSIGNMENT_KEYWORDS, DB_URI_SCHEMES, PATTERNS, PRIVATE_KEY_HEADERS, Severity,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Finding {
    /// Muster-ID, z. B. `openai_project`. Bei kontextbasierten Funden
    /// `assignment`, `private_key` oder `db_uri`.
    pub pattern_id: String,
    pub label: String,
    pub provider: String,
    pub severity: Severity,
    /// Zeichen-Offset im normalisierten Text (nicht Byte-Offset — die UI
    /// arbeitet mit Zeichen).
    pub start: usize,
    pub end: usize,
    /// Maskierte Vorschau. Enthält nie den Körper des Secrets.
    pub preview: String,
    /// 0..1. Kombiniert Präfix-Genauigkeit, Zeichensatz-Treue und Zufälligkeit.
    pub confidence: f64,
    /// Länge des erkannten Tokens — hilft dem Nutzer beim Wiederfinden.
    pub token_len: usize,
}

/// Verworfener Kandidat. Wird nur im Diagnosemodus zurückgegeben und speist den
/// Falsch-Positiv-Korpus.
#[derive(Debug, Clone, PartialEq)]
pub struct Rejected {
    pub token: String,
    pub reason: Rejection,
}

#[derive(Debug, Clone, Default)]
pub struct DetectionReport {
    pub findings: Vec<Finding>,
    pub rejected: Vec<Rejected>,
}

/// Maskiert einen Treffer für die Anzeige: Präfix bleibt lesbar, der Rest wird
/// zu Punkten. Die letzten zwei Zeichen bleiben stehen, damit der Nutzer den
/// Fund im Video zweifelsfrei wiedererkennt.
pub fn mask(token: &str, prefix_len: usize) -> String {
    let chars: Vec<char> = token.chars().collect();
    let n = chars.len();
    if n <= 4 {
        return "•".repeat(n);
    }
    let head = prefix_len.min(n.saturating_sub(3));
    let tail = 2usize;
    let dots = n.saturating_sub(head + tail).min(12);
    let mut out: String = chars[..head].iter().collect();
    out.push_str(&"•".repeat(dots.max(3)));
    out.extend(chars[n - tail..].iter());
    out
}

/// Zerlegt Text in Kandidaten-Tokens mit ihren Zeichen-Offsets.
///
/// Trennt an Whitespace und an Zeichen, die in Secrets nicht vorkommen
/// (Anführungszeichen, Klammern, Komma, Semikolon). Bindestrich, Unterstrich,
/// Punkt, Slash, Plus und Gleichheitszeichen bleiben Teil des Tokens.
pub fn tokenize(text: &str) -> Vec<(usize, usize, String)> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0usize;

    let is_boundary = |c: char| {
        c.is_whitespace()
            || matches!(
                c,
                // '@' ist bewusst KEINE Grenze: es ist Bestandteil von
                // Verbindungsstrings (postgres://user:pass@host).
                '"' | '\'' | '`' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';' | '<' | '>'
                    | '|' | '\\' | '!' | '?' | '*' | '&' | '^' | '%' | '#' | '~'
            )
    };

    while i < chars.len() {
        while i < chars.len() && is_boundary(chars[i]) {
            i += 1;
        }
        let start = i;
        while i < chars.len() && !is_boundary(chars[i]) {
            i += 1;
        }
        if i > start {
            let mut end = i;
            // Satzzeichen am Ende abschneiden — ein Key endet nie auf . oder :
            while end > start && matches!(chars[end - 1], '.' | ':' | ',' | '-') {
                end -= 1;
            }
            if end > start {
                let tok: String = chars[start..end].iter().collect();
                out.push((start, end, tok));
            }
        }
    }
    out
}

/// Erzeugt aus einem Token zusätzliche Kandidaten.
///
/// Auf einem Bildschirm steht ein Key fast nie allein. Er steht in
/// `OPENAI_KEY=sk-proj-…`, in `"apiKey":"sk-…"`, hinter `Authorization: Bearer `
/// oder in `--token=ghp_…`. Ein Tokenizer, der an `=` und `:` trennt, würde
/// dafür Base64-Padding (`…==`) und Verbindungsstrings (`postgres://`) zerreißen.
///
/// Stattdessen bleibt das Token intakt und es werden zusätzlich die Suffixe nach
/// jedem `=` und `:` als Kandidaten angeboten. Die Offsets werden mitgeführt,
/// damit die gemeldete Position im Text stimmt.
fn candidates(token: &str, base: usize) -> Vec<(usize, String)> {
    let mut out = vec![(base, token.to_string())];
    let chars: Vec<char> = token.chars().collect();

    for (i, c) in chars.iter().enumerate() {
        if !matches!(c, '=' | ':') {
            continue;
        }
        let rest: String = chars[i + 1..].iter().collect();
        // Base64-Padding am Ende ist kein Trenner.
        if rest.is_empty() || rest.chars().all(|c| c == '=') {
            continue;
        }
        if rest.chars().count() >= 12 {
            out.push((base + i + 1, rest));
        }
    }

    // `Bearer <token>` wird vom Tokenizer bereits getrennt, weil dort ein
    // Leerzeichen steht — hier ist nichts weiter zu tun.
    out
}

/// Alle Kandidaten eines Textes: jedes Token plus dessen Suffixe nach `=`/`:`.
///
/// Muss von **allen** Detektoren benutzt werden. Ein Detektor, der nur über
/// `tokenize()` läuft, findet `postgres://…` und `eyJ…` nicht mehr, sobald sie
/// hinter einer Zuweisung stehen (`DATABASE_URL=postgres://…`) — und genau so
/// stehen sie auf einem echten Bildschirm.
fn all_candidates(text: &str) -> Vec<(usize, usize, String)> {
    let mut out = Vec::new();
    for (start, _end, tok) in tokenize(text) {
        for (cand_start, cand) in candidates(&tok, start) {
            let end = cand_start + cand.chars().count();
            out.push((cand_start, end, cand));
        }
    }
    out
}

/// Versucht, ein Token gegen ein Muster zu matchen.
/// Rückgabe: `(confidence, prefix_len)` bei Erfolg.
fn match_pattern(token: &str, p: &Pattern) -> Option<(f64, usize)> {
    let mut best: Option<(f64, usize)> = None;

    for prefix in p.prefixes {
        // `continue`, nicht `?`. Ein `?` würde beim ersten nicht passenden
        // Präfix die ganze Funktion verlassen und einen bereits gefundenen
        // Treffer verwerfen — Muster mit mehreren Präfixen (GitHub, AWS, Slack,
        // Stripe) wären damit blind für alles außer ihrem ersten Präfix.
        let Some(consumed) = fuzzy_prefix_match(token, prefix, p.prefix_tolerance) else {
            continue;
        };
        let body: String = token.chars().skip(consumed).collect();
        let body_len = body.chars().count();

        if body_len < p.body_min || body_len > p.body_max {
            continue;
        }

        // Zeichensatz-Treue: OCR darf einzelne Zeichen verfälschen, deshalb
        // reicht 85 % statt 100 %.
        let cs_ratio = p.charset.ratio(&body);
        if cs_ratio < 0.85 {
            continue;
        }

        let rand = randomness_score(&body);
        if rand < p.min_randomness {
            continue;
        }

        // Exakter Präfix-Treffer wiegt mehr als ein unscharfer.
        let exact = token.starts_with(prefix);
        let prefix_score = if exact { 1.0 } else { 0.75 };

        let confidence = (0.45 * prefix_score + 0.30 * cs_ratio + 0.25 * rand).clamp(0.0, 1.0);

        let better = match best {
            None => true,
            Some((bc, _)) => confidence > bc,
        };
        if better {
            best = Some((confidence, consumed));
        }
    }

    best
}

/// Sucht zugewiesene Geheimnisse: `PASSWORD=hunter2`, `api_key: "abc123"`.
/// Arbeitet zeilenweise, weil die Zuweisung ein Zeilenkonstrukt ist.
fn detect_assignments(text: &str, out: &mut Vec<Finding>) {
    let chars: Vec<char> = text.chars().collect();
    let mut line_start = 0usize;

    for (idx, ch) in chars.iter().enumerate().chain(std::iter::once((chars.len(), &'\n'))) {
        if *ch != '\n' && idx != chars.len() {
            continue;
        }
        let line: String = chars[line_start..idx.min(chars.len())].iter().collect();
        let lower = line.to_ascii_lowercase();

        for kw in ASSIGNMENT_KEYWORDS {
            let Some(kw_pos) = lower.find(kw) else { continue };

            // Nach dem Schlüsselwort muss ein Zuweisungszeichen kommen.
            let after: String = line.chars().skip(kw_pos + kw.chars().count()).collect();
            let trimmed = after.trim_start();
            let sep_len = after.chars().count() - trimmed.chars().count();
            let Some(first) = trimmed.chars().next() else { continue };
            if !matches!(first, '=' | ':') {
                continue;
            }

            let value_raw: String = trimmed.chars().skip(1).collect();
            let value_trimmed = value_raw.trim_start();
            let lead = value_raw.chars().count() - value_trimmed.chars().count();
            let value: String = value_trimmed
                .trim_matches(|c: char| matches!(c, '"' | '\'' | '`'))
                .split_whitespace()
                .next()
                .unwrap_or("")
                // Satzzeichen am Ende gehören nie zum Wert (`...KEY;`, `...KEY,`)
                .trim_end_matches(|c: char| matches!(c, ';' | ',' | '.' | ')' | '"' | '\'' | '`'))
                .to_string();

            if value.chars().count() < 8 {
                continue;
            }
            if structural_rejection(&value).is_some() {
                continue;
            }
            // `const apiKey = process.env.OPENAI_API_KEY` ist die korrekte
            // Handhabung, kein Leak.
            if crate::negative::is_code_reference(&value) {
                continue;
            }
            if secret_charset_ratio(&value) < 0.85 {
                continue;
            }
            let comp = Composition::of(&value);
            if comp.is_wordlike() {
                continue;
            }
            let rand = randomness_score(&value);
            if rand < 0.50 {
                continue;
            }

            let value_offset = line_start
                + kw_pos
                + kw.chars().count()
                + sep_len
                + 1
                + lead;

            out.push(Finding {
                pattern_id: "assignment".into(),
                label: format!("Zugewiesenes Geheimnis ({kw})"),
                provider: "Generic".into(),
                severity: Severity::High,
                start: value_offset,
                end: value_offset + value.chars().count(),
                preview: mask(&value, 2),
                confidence: (0.55 + 0.45 * rand).clamp(0.0, 1.0),
                token_len: value.chars().count(),
            });
            break; // pro Zeile nur ein Zuweisungsfund
        }

        line_start = idx + 1;
    }
}

/// Private-Key-Blöcke. Der Header allein genügt — wer den im Video hat, hat ein
/// Problem, unabhängig davon, ob der Body lesbar war.
fn detect_private_keys(text: &str, out: &mut Vec<Finding>) {
    // Im Verwechslungsraum suchen, nicht exakt: OCR liest `RSA` gerne als `R5A`,
    // `BEGIN` als `8EG1N`. Ein exakter Vergleich würde den ganzen Fund verlieren
    // — und ein privater Schlüssel im Video ist der schwerwiegendste Fall
    // überhaupt.
    for header in PRIVATE_KEY_HEADERS {
        for start in crate::ocr::find_all_confusable(text, header) {
            out.push(Finding {
                pattern_id: "private_key".into(),
                label: "Privater Schlüssel".into(),
                provider: "PEM".into(),
                severity: Severity::Critical,
                start,
                end: start + header.chars().count(),
                preview: "-----BEGIN •••••• PRIVATE KEY-----".into(),
                confidence: 0.98,
                token_len: header.chars().count(),
            });
        }
    }
}

/// Verbindungsstrings mit eingebettetem Passwort.
fn detect_db_uris(text: &str, out: &mut Vec<Finding>) {
    for (start, end, tok) in all_candidates(text) {
        let lower = tok.to_ascii_lowercase();
        let Some(scheme) = DB_URI_SCHEMES.iter().find(|s| lower.starts_with(**s)) else {
            continue;
        };
        let rest: String = tok.chars().skip(scheme.chars().count()).collect();
        let Some(at_pos) = rest.find('@') else { continue };
        let authority: String = rest.chars().take(at_pos).collect();
        let Some(colon) = authority.find(':') else { continue };
        let password: String = authority.chars().skip(colon + 1).collect();
        if password.chars().count() < 4 {
            continue;
        }
        if crate::negative::is_placeholder(&password) {
            continue;
        }

        out.push(Finding {
            pattern_id: "db_uri".into(),
            label: "Verbindungsstring mit Passwort".into(),
            provider: scheme.trim_end_matches("://").into(),
            severity: Severity::Critical,
            start,
            end,
            preview: format!("{}•••••••@…", scheme),
            confidence: 0.92,
            token_len: tok.chars().count(),
        });
    }
}

/// JWTs. Nur gemeldet, wenn drei Base64URL-Segmente vorliegen und der Header
/// plausibel ist (`eyJ` = `{"` in Base64).
fn detect_jwt(text: &str, out: &mut Vec<Finding>) {
    for (start, end, tok) in all_candidates(text) {
        if !tok.starts_with("eyJ") {
            continue;
        }
        let parts: Vec<&str> = tok.split('.').collect();
        if parts.len() != 3 {
            continue;
        }
        if parts.iter().any(|p| p.chars().count() < 8) {
            continue;
        }
        if parts
            .iter()
            .any(|p| crate::patterns::BodyCharset::Base64Url.ratio(p) < 0.9)
        {
            continue;
        }
        if crate::negative::is_placeholder(&tok) {
            continue;
        }

        out.push(Finding {
            pattern_id: "jwt".into(),
            label: "JSON Web Token".into(),
            provider: "JWT".into(),
            severity: Severity::High,
            start,
            end,
            preview: mask(&tok, 6),
            confidence: 0.88,
            token_len: tok.chars().count(),
        });
    }
}

/// Entfernt überlappende Funde. Bei Überlappung gewinnt der Fund mit der
/// höheren Schwere, bei Gleichstand der mit der höheren Konfidenz.
fn dedupe_overlaps(mut findings: Vec<Finding>) -> Vec<Finding> {
    findings.sort_by(|a, b| {
        b.severity
            .cmp(&a.severity)
            .then(b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.start.cmp(&b.start))
    });

    let mut kept: Vec<Finding> = Vec::new();
    for f in findings {
        let overlaps = kept
            .iter()
            .any(|k| f.start < k.end && k.start < f.end);
        if !overlaps {
            kept.push(f);
        }
    }
    kept.sort_by_key(|f| f.start);
    kept
}

/// Vollständige Erkennung über einen Textblock (typischerweise das OCR-Ergebnis
/// eines Frames).
pub fn detect_in_text(raw: &str) -> Vec<Finding> {
    detect_with_report(raw).findings
}

/// Wie `detect_in_text`, liefert zusätzlich die verworfenen Kandidaten.
pub fn detect_with_report(raw: &str) -> DetectionReport {
    let text = normalize_unicode(raw);
    let mut findings: Vec<Finding> = Vec::new();
    let mut rejected: Vec<Rejected> = Vec::new();

    // 1) Kontextbasierte Muster zuerst — sie liefern die verlässlichsten Funde.
    detect_private_keys(&text, &mut findings);
    detect_db_uris(&text, &mut findings);
    detect_jwt(&text, &mut findings);
    detect_assignments(&text, &mut findings);

    // 2) Präfix-basierte Anbieter-Muster über alle Tokens und deren Suffixe.
    for (start, end, tok) in all_candidates(&text) {
        if tok.chars().count() < 12 {
            continue;
        }

        if let Some(reason) = structural_rejection(&tok) {
            rejected.push(Rejected { token: tok.clone(), reason });
            continue;
        }

        let mut best: Option<(f64, usize, &Pattern)> = None;
        for p in PATTERNS {
            if let Some((conf, prefix_len)) = match_pattern(&tok, p) {
                let better = match best {
                    None => true,
                    Some((bc, _, bp)) => {
                        // Längeres Präfix gewinnt bei ähnlicher Konfidenz
                        // (sk-ant-api03- schlägt sk-).
                        let blen = bp.prefixes.iter().map(|s| s.len()).max().unwrap_or(0);
                        let plen = p.prefixes.iter().map(|s| s.len()).max().unwrap_or(0);
                        conf > bc + 0.05 || (plen > blen && conf + 0.05 >= bc)
                    }
                };
                if better {
                    best = Some((conf, prefix_len, p));
                }
            }
        }

        if let Some((conf, prefix_len, p)) = best {
            findings.push(Finding {
                pattern_id: p.id.to_string(),
                label: p.label.to_string(),
                provider: p.provider.to_string(),
                severity: p.severity,
                start,
                end,
                preview: mask(&tok, prefix_len),
                confidence: conf,
                token_len: tok.chars().count(),
            });
        } else {
            rejected.push(Rejected { token: tok, reason: Rejection::LowRandomness });
        }
    }

    DetectionReport {
        findings: dedupe_overlaps(findings),
        rejected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(text: &str) -> Vec<String> {
        detect_in_text(text).into_iter().map(|f| f.pattern_id).collect()
    }

    #[test]
    fn masks_never_leak_the_body() {
        let secret = "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd";
        let f = &detect_in_text(secret)[0];
        assert!(!f.preview.contains("T3xK9mPq2LvR8wZa5NbYc7"));
        assert!(f.preview.contains('•'));
    }

    #[test]
    fn tokenize_splits_on_quotes_and_brackets() {
        let toks = tokenize(r#"key="abc123def456" other"#);
        let strs: Vec<&str> = toks.iter().map(|t| t.2.as_str()).collect();
        assert!(strs.contains(&"abc123def456"));
        assert!(strs.contains(&"other"));
    }

    #[test]
    fn tokenize_strips_trailing_punctuation() {
        let toks = tokenize("value: abc123def456.");
        let strs: Vec<&str> = toks.iter().map(|t| t.2.as_str()).collect();
        assert!(strs.contains(&"abc123def456"));
    }

    #[test]
    fn detects_private_key_header() {
        let v = ids("-----BEGIN RSA PRIVATE KEY-----");
        assert!(v.contains(&"private_key".to_string()));
    }

    #[test]
    fn detects_db_uri_with_password() {
        let v = ids("postgres://admin:Hunter2Pass9x@db.example.com:5432/app");
        assert!(v.contains(&"db_uri".to_string()));
    }

    #[test]
    fn ignores_db_uri_without_password() {
        let v = ids("postgres://localhost:5432/app");
        assert!(!v.contains(&"db_uri".to_string()));
    }

    #[test]
    fn detects_jwt() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert!(ids(jwt).contains(&"jwt".to_string()));
    }

    #[test]
    fn detects_assignment() {
        let v = ids("DB_PASSWORD=Xk9mP2qLvR8wZa5N");
        assert!(v.contains(&"assignment".to_string()));
    }

    #[test]
    fn assignment_ignores_wordlike_values() {
        let v = ids("password: correcthorsebatterystaple");
        assert!(!v.contains(&"assignment".to_string()));
    }

    #[test]
    fn overlaps_are_deduped() {
        // sk-ant-api03- und sk- könnten beide greifen; nur einer darf übrig bleiben.
        let f = detect_in_text("sk-ant-api03-T3xK9mPq2LvR8wZa5NbYc7HdQ2");
        assert_eq!(f.len(), 1, "erwartete genau einen Fund, bekam {f:#?}");
        assert_eq!(f[0].pattern_id, "anthropic");
    }

    #[test]
    fn empty_and_plain_text_yield_nothing() {
        assert!(detect_in_text("").is_empty());
        assert!(detect_in_text("Hallo Welt, das ist ein normaler Satz.").is_empty());
    }
}

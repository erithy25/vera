//! Main detection: OCR text in, findings out.
//!
//! The product's core rule, enforced here: **the secret that was found is never
//! stored.** A `Finding` carries only the type, the position and a masked
//! preview. Steal the database and you get nothing.

use serde::{Deserialize, Serialize};

use crate::entropy::{randomness_score, Composition};
use crate::negative::{structural_rejection, Rejection};
use crate::ocr::{fuzzy_prefix_match, normalize_unicode, secret_charset_ratio};
use crate::patterns::{
    Pattern, ASSIGNMENT_KEYWORDS, DB_URI_SCHEMES, PATTERNS, PRIVATE_KEY_HEADERS, Severity,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Finding {
    /// Pattern id, e.g. `openai_project`. For context-based findings
    /// `assignment`, `private_key` or `db_uri`.
    pub pattern_id: String,
    pub label: String,
    pub provider: String,
    pub severity: Severity,
    /// Character offset in the normalised text (not a byte offset — the UI
    /// works in characters).
    pub start: usize,
    pub end: usize,
    /// Masked preview. Never contains the body of the secret.
    pub preview: String,
    /// 0..1. Combines prefix accuracy, character-set fidelity and randomness.
    pub confidence: f64,
    /// Length of the detected token — helps the user find it again.
    pub token_len: usize,
}

/// A discarded candidate. Returned only in diagnostic mode; feeds the
/// false-positive corpus.
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

/// Masks a hit for display: the prefix stays readable, the rest becomes dots.
/// The last two characters stay visible so the user can identify the finding in
/// the video beyond doubt.
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

/// Splits text into candidate tokens with their character offsets.
///
/// Breaks on whitespace and on characters that never occur inside secrets
/// (quotes, brackets, comma, semicolon). Hyphen, underscore, period, slash,
/// plus and equals stay part of the token.
pub fn tokenize(text: &str) -> Vec<(usize, usize, String)> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0usize;

    let is_boundary = |c: char| {
        c.is_whitespace()
            || matches!(
                c,
                // '@' is deliberately NOT a boundary: it is part of connection
                // strings (postgres://user:pass@host).
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
            // Trim trailing punctuation — a key never ends in . or :
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

/// Derives additional candidates from a token.
///
/// On a screen a key almost never stands alone. It sits in
/// `OPENAI_KEY=sk-proj-…`, in `"apiKey":"sk-…"`, behind `Authorization: Bearer `
/// or in `--token=ghp_…`. A tokenizer that split on `=` and `:` would tear
/// apart base64 padding (`…==`) and connection strings (`postgres://`).
///
/// Instead the token stays intact and the suffixes after each `=` and `:` are
/// offered as extra candidates. Offsets are carried along so the reported
/// position in the text stays correct.
fn candidates(token: &str, base: usize) -> Vec<(usize, String)> {
    let mut out = vec![(base, token.to_string())];
    let chars: Vec<char> = token.chars().collect();

    for (i, c) in chars.iter().enumerate() {
        if !matches!(c, '=' | ':') {
            continue;
        }
        let rest: String = chars[i + 1..].iter().collect();
        // Trailing base64 padding is not a separator.
        if rest.is_empty() || rest.chars().all(|c| c == '=') {
            continue;
        }
        if rest.chars().count() >= 12 {
            out.push((base + i + 1, rest));
        }
    }

    // `Bearer <token>` is already split by the tokenizer, because there is a
    // space there — nothing more to do here.
    out
}

/// Characters that can legitimately sit inside a key or a connection string.
fn is_secretish(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':' | '/' | '+' | '=' | '@')
}

/// How many space-separated fragments may be glued back into one candidate.
const MAX_GLUE_SPAN: usize = 6;

/// Rebuilds tokens that OCR tore apart with spaces.
///
/// ## Why this exists
///
/// Every other part of this engine assumes OCR damages *characters* — `o` read
/// as `0`, `S` as `5`. It also inserts whitespace, and that is far more
/// destructive, because whitespace is what the tokenizer splits on. Observed on
/// a real recording:
///
/// ```text
///   OPENAI_API_KEY=sk- proj - T3xK9mPq2LvR8wZa5NbY c7Hd
///   DATABASE_URL=postgres: //admin: Hunter2Pass9x@db. internal. acme. dev :5432/orders
/// ```
///
/// Both were missed completely — every fragment on its own is too short and too
/// unremarkable to match anything. The failure mode is the dangerous one: the
/// scan finishes, reports frames read, and says the recording is clean.
///
/// So runs of adjacent fragments separated by a *single* space, where every
/// fragment is made only of characters a secret can contain, are offered back
/// as extra candidates with the spaces removed. They then face exactly the same
/// prefix, character-set, randomness and negative-filter checks as any other
/// candidate — gluing widens what is *looked at*, never what is accepted. An
/// English phrase survives the glue and dies at the randomness check.
fn glued_candidates(text: &str) -> Vec<(usize, usize, String)> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();

    // Fragments of secret-ish characters, with the gap that follows each.
    let mut frags: Vec<(usize, usize)> = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if is_secretish(chars[i]) {
            let start = i;
            while i < chars.len() && is_secretish(chars[i]) {
                i += 1;
            }
            frags.push((start, i));
        } else {
            // A newline ends the line; anything else just breaks the fragment.
            if chars[i] == '\n' {
                emit_runs(&chars, &frags, &mut out);
                frags.clear();
            }
            i += 1;
        }
    }
    emit_runs(&chars, &frags, &mut out);
    out
}

/// Joins neighbouring fragments that are separated by exactly one space.
fn emit_runs(chars: &[char], frags: &[(usize, usize)], out: &mut Vec<(usize, usize, String)>) {
    for a in 0..frags.len() {
        let mut joined: String = chars[frags[a].0..frags[a].1].iter().collect();
        let mut b = a;
        while b + 1 < frags.len() && b - a + 1 < MAX_GLUE_SPAN {
            let gap_start = frags[b].1;
            let gap_end = frags[b + 1].0;
            // Exactly one space between them, nothing else.
            if gap_end - gap_start != 1 || chars[gap_start] != ' ' {
                break;
            }
            b += 1;
            joined.extend(chars[frags[b].0..frags[b].1].iter());
            // The span covers the original text, so overlap de-duplication
            // still lines up with the un-glued findings.
            out.push((frags[a].0, frags[b].1, joined.clone()));
        }
    }
}

/// Every candidate in a text: each token, its suffixes after `=`/`:`, and the
/// space-separated runs glued back together.
///
/// Must be used by **all** detectors. A detector that only walks `tokenize()`
/// stops finding `postgres://…` and `eyJ…` as soon as they sit behind an
/// assignment (`DATABASE_URL=postgres://…`) — and that is exactly how they
/// appear on a real screen.
fn all_candidates(text: &str) -> Vec<(usize, usize, String)> {
    let mut out = Vec::new();
    for (start, _end, tok) in tokenize(text) {
        for (cand_start, cand) in candidates(&tok, start) {
            let end = cand_start + cand.chars().count();
            out.push((cand_start, end, cand));
        }
    }
    // Glued runs are shorter than the text they came from, so offsets derived
    // inside them are approximate. They stay within the original span, which is
    // all the overlap de-duplication needs.
    for (start, end, glued) in glued_candidates(text) {
        out.push((start, end, glued.clone()));
        for (cand_start, cand) in candidates(&glued, start) {
            if cand_start != start {
                out.push((cand_start.min(end), end, cand));
            }
        }
    }
    out
}

/// Tries to match a token against a pattern.
/// Returns `(confidence, prefix_len)` on success.
fn match_pattern(token: &str, p: &Pattern) -> Option<(f64, usize)> {
    let mut best: Option<(f64, usize)> = None;

    for prefix in p.prefixes {
        // `continue`, not `?`. A `?` would leave the whole function on the
        // first prefix that does not fit and discard a match already found —
        // patterns with several prefixes (GitHub, AWS, Slack, Stripe) would be
        // blind to everything but their first prefix.
        let Some(consumed) = fuzzy_prefix_match(token, prefix, p.prefix_tolerance) else {
            continue;
        };
        let body: String = token.chars().skip(consumed).collect();
        let body_len = body.chars().count();

        if body_len < p.body_min || body_len > p.body_max {
            continue;
        }

        // Character-set fidelity: OCR may corrupt individual characters, so
        // 85 % is enough instead of 100 %.
        let cs_ratio = p.charset.ratio(&body);
        if cs_ratio < 0.85 {
            continue;
        }

        let rand = randomness_score(&body);
        if rand < p.min_randomness {
            continue;
        }

        // An exact prefix hit counts for more than a fuzzy one.
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

/// Finds assigned secrets: `PASSWORD=hunter2`, `api_key: "abc123"`.
/// Works line by line, because an assignment is a line-level construct.
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

            // An assignment character has to follow the keyword.
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
                // Trailing punctuation is never part of the value (`...KEY;`)
                .trim_end_matches(|c: char| matches!(c, ';' | ',' | '.' | ')' | '"' | '\'' | '`'))
                .to_string();

            if value.chars().count() < 8 {
                continue;
            }
            if structural_rejection(&value).is_some() {
                continue;
            }
            // `const apiKey = process.env.OPENAI_API_KEY` is correct handling,
            // not a leak.
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
                label: format!("Assigned secret ({kw})"),
                provider: "Generic".into(),
                severity: Severity::High,
                start: value_offset,
                end: value_offset + value.chars().count(),
                preview: mask(&value, 2),
                confidence: (0.55 + 0.45 * rand).clamp(0.0, 1.0),
                token_len: value.chars().count(),
            });
            break; // at most one assignment finding per line
        }

        line_start = idx + 1;
    }
}

/// Private key blocks. The header alone is enough — if that is in your video
/// you have a problem, whether or not the body was legible.
fn detect_private_keys(text: &str, out: &mut Vec<Finding>) {
    // Searched in confusion space, not exactly: OCR happily reads `RSA` as
    // `R5A` and `BEGIN` as `8EG1N`. An exact comparison would lose the finding
    // entirely — and a private key in a video is the single worst case there
    // is.
    for header in PRIVATE_KEY_HEADERS {
        for start in crate::ocr::find_all_confusable(text, header) {
            out.push(Finding {
                pattern_id: "private_key".into(),
                label: "Private key".into(),
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

/// Connection strings with an embedded password.
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
            label: "Connection string with password".into(),
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

/// JWTs. Reported only when there are three base64url segments and the header
/// is plausible (`eyJ` = `{"` in base64).
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

/// Removes overlapping findings. On overlap the higher severity wins, and on a
/// tie the higher confidence.
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

/// Full detection over a block of text (typically one frame's OCR result).
pub fn detect_in_text(raw: &str) -> Vec<Finding> {
    detect_with_report(raw).findings
}

/// Like `detect_in_text`, but also returns the discarded candidates.
pub fn detect_with_report(raw: &str) -> DetectionReport {
    let text = normalize_unicode(raw);
    let mut findings: Vec<Finding> = Vec::new();
    let mut rejected: Vec<Rejected> = Vec::new();

    // 1) Context-based patterns first — they give the most reliable findings.
    detect_private_keys(&text, &mut findings);
    detect_db_uris(&text, &mut findings);
    detect_jwt(&text, &mut findings);
    detect_assignments(&text, &mut findings);

    // 2) Prefix-based provider patterns over all tokens and their suffixes.
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
                        // The longer prefix wins at similar confidence
                        // (sk-ant-api03- beats sk-).
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
        // sk-ant-api03- and sk- could both fire; only one may survive.
        let f = detect_in_text("sk-ant-api03-T3xK9mPq2LvR8wZa5NbYc7HdQ2");
        assert_eq!(f.len(), 1, "expected exactly one finding, got {f:#?}");
        assert_eq!(f[0].pattern_id, "anthropic");
    }

    #[test]
    fn empty_and_plain_text_yield_nothing() {
        assert!(detect_in_text("").is_empty());
        assert!(detect_in_text("Hello world, this is an ordinary sentence.").is_empty());
    }

    // ---- Whitespace inserted by OCR ----
    //
    // These two strings are verbatim OCR output from a rendered test recording.
    // Before the glue pass both were missed entirely, which is the worst
    // failure this product can have: a scan that finishes and says "clean".

    #[test]
    fn a_key_that_ocr_split_with_spaces_is_still_found() {
        let ocr = "OPENAT_API_KEY=sk- proj - T3xK9mPq2LvR8wZa5NbY c7Hd";
        let ids = ids(ocr);
        assert!(
            ids.contains(&"openai_project".to_string()),
            "OCR-inserted spaces hid the key: {ids:?}"
        );
    }

    #[test]
    fn a_connection_string_that_ocr_split_with_spaces_is_still_found() {
        let ocr = "DATABASE_URL=postgres: //admin: Hunter2Pass9x@db. internal. acme. dev :5432/orders";
        let ids = ids(ocr);
        assert!(ids.contains(&"db_uri".to_string()), "got {ids:?}");
    }

    #[test]
    fn gluing_does_not_invent_findings_in_ordinary_text() {
        // Gluing widens what is looked at, never what is accepted. Prose,
        // prompts and file listings must stay silent.
        for line in [
            "the quick brown fox jumps over the lazy dog",
            "Welcome to this tutorial about building an API client",
            "~/dev/acme-api $ npm run build && npm test",
            "dist/assets/index-Dz8mcTBK.js 259.84 kB gzip: 78.19 kB",
            "commit a074f80ab12cd34ef56789012345678901234567 (HEAD -> main)",
            "vite v7.0.4 ready in 412 ms Local: http://127.0.0.1:5173/",
            "1. Copy the example file: cp .env.example .env",
            "OPENAI_API_KEY=sk-your-api-key-here",
            "AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE",
            "const apiKey = process.env.OPENAI_API_KEY;",
        ] {
            let found = detect_in_text(line);
            assert!(found.is_empty(), "false alarm on {line:?}: {found:#?}");
        }
    }

    #[test]
    fn gluing_stops_at_a_line_break() {
        // Halves on separate lines must never become one token. Glued across
        // the newline these two would read as sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd
        // and report a critical OpenAI key that is not on screen anywhere.
        let found = detect_in_text("prefix sk-\nproj-T3xK9mPq2LvR8wZa5NbYc7Hd extra");
        assert!(
            found.is_empty(),
            "glued a key across a line break: {found:#?}"
        );
    }

    #[test]
    fn gluing_needs_a_single_space_not_a_gap() {
        // Two columns of a table are not one token.
        let found = detect_in_text("sk-     proj-     T3xK9mPq2LvR8wZa5NbYc7Hd");
        assert!(
            found.iter().all(|f| f.pattern_id != "openai_project"),
            "glued across a column gap: {found:#?}"
        );
    }
}

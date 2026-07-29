//! OCR error tolerance.
//!
//! The problem this module solves — and that no file-based secret scanner has:
//! the text we inspect was never read correctly. For a real key
//! `sk-proj-AbC1...`, Vision or Tesseract return `sk-pr0j-AbCl...`,
//! `5k-proj-A6C1...` or `sk‑proj–AbC1…` depending on font and resolution.
//!
//! An exact regex (gitleaks, trufflehog) finds none of those.
//!
//! The strategy is deliberately asymmetric:
//!   * On the **prefix** we normalise aggressively. Prefixes are short and
//!     known; a fuzzy hit is cheap, because the rest of the token still has to
//!     look structurally like a secret afterwards.
//!   * On the **body** we do NOT normalise. There, length, character set and
//!     entropy decide. Normalising there would raise the false-positive rate
//!     sharply, because it artificially lowers entropy.

/// Unicode characters that OCR engines and terminal renderers substitute for
/// ASCII. Must run before any further processing, or even word boundaries fail
/// (a `‑` is not a `-`).
pub fn normalize_unicode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            // Hyphen variants (en/em dash, minus sign, non-breaking hyphen,
            // figure dash, horizontal bar) -> ASCII hyphen
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
            | '\u{2212}' | '\u{FE58}' | '\u{FE63}' | '\u{FF0D}' => '-',
            // Underscore variants
            '\u{FF3F}' | '\u{FE4D}' | '\u{FE4E}' | '\u{FE4F}' => '_',
            // Quotation marks
            '\u{2018}' | '\u{2019}' | '\u{201B}' | '\u{2032}' | '\u{FF07}' => '\'',
            '\u{201C}' | '\u{201D}' | '\u{201F}' | '\u{2033}' | '\u{FF02}' => '"',
            // Full-width colon / equals / period
            '\u{FF1A}' => ':',
            '\u{FF1D}' => '=',
            '\u{FF0E}' => '.',
            // Assorted spaces -> ordinary space
            '\u{00A0}' | '\u{2007}' | '\u{202F}' | '\u{2009}' | '\u{200A}' | '\u{2002}'
            | '\u{2003}' | '\u{3000}' => ' ',
            // Zero-width characters are removed (see the filter below)
            other => other,
        })
        // Zero-width joiner / non-joiner / space, BOM, soft hyphen: OCR artefacts
        .filter(|c| !matches!(c, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | '\u{00AD}'))
        .collect()
}

/// Maps a character to its confusion class.
///
/// The classes come from glyph collisions that actually occur in monospace
/// fonts (SF Mono, Menlo, JetBrains Mono, Fira Code, Consolas). Deliberately
/// conservative: every extra pair raises the prefix hit rate, but also the risk
/// that a harmless word matches a prefix.
pub fn confusion_class(c: char) -> char {
    match c {
        // Zero / O / o / Q — by far the most common confusion
        '0' | 'O' | 'o' | 'Q' | 'D' => '0',
        // One / lowercase L / uppercase I / pipe / exclamation mark
        '1' | 'l' | 'I' | 'i' | '|' | '!' | 'j' | 'L' => '1',
        // Five / S
        '5' | 'S' | 's' | '$' => '5',
        // Eight / B
        '8' | 'B' => '8',
        // Two / Z
        '2' | 'Z' | 'z' => '2',
        // Six / G / b
        '6' | 'G' | 'b' => '6',
        // Nine / g / q
        '9' | 'g' | 'q' => '9',
        // Seven / T (in narrow fonts)
        '7' | 'T' | 't' => '7',
        // U / V
        'U' | 'u' | 'V' | 'v' => 'u',
        // C / c (and ( at very small sizes)
        'C' | 'c' | '(' => 'c',
        // Hyphen, underscore and period are NOT collapsed together — they
        // separate prefixes and carry structural meaning.
        other => other.to_ascii_lowercase(),
    }
}

/// Normalises a string into confusion space.
/// Multi-character confusions are resolved as well (`rn` -> `m`, `vv` -> `w`,
/// `cl` -> `d`), which do occur at small font sizes.
pub fn normalize_confusable(s: &str) -> String {
    let pre = s
        .replace("rn", "m")
        .replace("RN", "m")
        .replace("vv", "w")
        .replace("VV", "w")
        .replace("cl", "d");
    pre.chars().map(confusion_class).collect()
}

/// Like [`normalize_confusable`], but **length-preserving**: 1:1 mappings only,
/// no multi-character replacements.
///
/// Needed wherever character offsets in the result must stay valid — for
/// instance when searching for PEM headers in running text, where the reported
/// position has to line up with the original text.
pub fn normalize_confusable_keep_len(s: &str) -> String {
    s.chars().map(confusion_class).collect()
}

/// Searches for `needle` inside `haystack` in confusion space and returns the
/// character offsets of every hit in the **original** text.
pub fn find_all_confusable(haystack: &str, needle: &str) -> Vec<usize> {
    let h: Vec<char> = normalize_confusable_keep_len(haystack).chars().collect();
    let n: Vec<char> = normalize_confusable_keep_len(needle).chars().collect();
    if n.is_empty() || h.len() < n.len() {
        return Vec::new();
    }
    let mut out = Vec::new();
    for i in 0..=(h.len() - n.len()) {
        if h[i..i + n.len()] == n[..] {
            out.push(i);
        }
    }
    out
}

/// Levenshtein distance, bounded by `max`. Bails out early as soon as every
/// cell of a row exceeds `max` — for prefixes (< 16 characters) that is
/// negligibly fast.
pub fn levenshtein_within(a: &str, b: &str, max: usize) -> Option<usize> {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > max {
        return None;
    }
    if a.is_empty() {
        return if b.len() <= max { Some(b.len()) } else { None };
    }
    if b.is_empty() {
        return if a.len() <= max { Some(a.len()) } else { None };
    }

    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur: Vec<usize> = vec![0; b.len() + 1];

    for i in 1..=a.len() {
        cur[0] = i;
        let mut row_min = cur[0];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
            row_min = row_min.min(cur[j]);
        }
        if row_min > max {
            return None;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    let d = prev[b.len()];
    if d <= max {
        Some(d)
    } else {
        None
    }
}

/// Checks whether `text` begins with `prefix`, tolerating OCR errors.
///
/// Returns `Some(characters_consumed)` so the caller can slice off the token's
/// body exactly. An insertion or deletion inside the prefix shifts that
/// boundary, so the window is varied by ±`max_dist` and the best match wins.
pub fn fuzzy_prefix_match(text: &str, prefix: &str, max_dist: usize) -> Option<usize> {
    // Anchor on the first character — this is security-critical.
    //
    // Without this rule `pk_live_` (a public Stripe key, harmless) matches
    // `sk_live_` (a secret key, critical), because in confusion space their
    // distance is 1. That would be a severity mix-up: the scanner would report
    // a harmless value as a critical finding — and conversely a real finding
    // could be filed under the wrong label.
    //
    // The anchor compares in confusion class, not exactly. `5k-proj-` therefore
    // still matches `sk-proj-` (both class '5'), while `pk_` ('p') and `sk_`
    // ('5') stay cleanly apart.
    let first_text = text.chars().next()?;
    let first_prefix = prefix.chars().next()?;
    if confusion_class(first_text) != confusion_class(first_prefix) {
        return None;
    }

    let norm_prefix = normalize_confusable(prefix);
    let plen = prefix.chars().count();
    let tlen = text.chars().count();

    let lo = plen.saturating_sub(max_dist).max(1);
    let hi = (plen + max_dist).min(tlen);
    if lo > hi {
        return None;
    }

    let mut best: Option<(usize, usize)> = None; // (distance, characters consumed)
    for take in lo..=hi {
        let head: String = text.chars().take(take).collect();
        let norm_head = normalize_confusable(&head);
        if let Some(d) = levenshtein_within(&norm_head, &norm_prefix, max_dist) {
            let better = match best {
                None => true,
                Some((bd, bt)) => d < bd || (d == bd && take.abs_diff(plen) < bt.abs_diff(plen)),
            };
            if better {
                best = Some((d, take));
            }
        }
    }
    best.map(|(_, take)| take)
}

/// How many characters of a token are still plausibly part of a Base62/Base64
/// secret after normalisation? Used to spot truncated tokens (line break,
/// window edge).
pub fn secret_charset_ratio(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let ok = s
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '+' | '/' | '=' | '.'))
        .count();
    ok as f64 / s.chars().count() as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_dashes_become_ascii() {
        assert_eq!(normalize_unicode("sk\u{2011}proj\u{2013}abc"), "sk-proj-abc");
        assert_eq!(normalize_unicode("a\u{200B}b"), "ab");
        assert_eq!(normalize_unicode("x\u{00A0}y"), "x y");
    }

    #[test]
    fn confusion_classes_collapse() {
        assert_eq!(confusion_class('O'), confusion_class('0'));
        assert_eq!(confusion_class('l'), confusion_class('1'));
        assert_eq!(confusion_class('I'), confusion_class('1'));
        assert_eq!(confusion_class('S'), confusion_class('5'));
        assert_eq!(confusion_class('B'), confusion_class('8'));
        // Hyphen and underscore stay apart — they are structurally meaningful
        assert_ne!(confusion_class('-'), confusion_class('_'));
    }

    #[test]
    fn multichar_confusions() {
        assert_eq!(normalize_confusable("rn"), normalize_confusable("m"));
        assert_eq!(normalize_confusable("vv"), normalize_confusable("w"));
    }

    #[test]
    fn levenshtein_basics() {
        assert_eq!(levenshtein_within("abc", "abc", 2), Some(0));
        assert_eq!(levenshtein_within("abc", "abd", 2), Some(1));
        assert_eq!(levenshtein_within("abc", "xyz", 2), None);
        assert_eq!(levenshtein_within("", "ab", 2), Some(2));
    }

    #[test]
    fn fuzzy_prefix_tolerates_ocr_damage() {
        // O instead of 0, l instead of 1 — the classic case
        assert!(fuzzy_prefix_match("sk-pr0j-ABC", "sk-proj-", 2).is_some());
        assert!(fuzzy_prefix_match("5k-proj-ABC", "sk-proj-", 2).is_some());
        assert!(fuzzy_prefix_match("gbp_abcdef", "ghp_", 2).is_some());
        // Something entirely different must not match
        assert!(fuzzy_prefix_match("hello-world", "sk-proj-", 2).is_none());
    }

    #[test]
    fn fuzzy_prefix_reports_consumed_length() {
        let n = fuzzy_prefix_match("sk-proj-ABCDEF", "sk-proj-", 2).unwrap();
        assert_eq!(n, 8);
    }

    #[test]
    fn public_stripe_key_is_never_read_as_the_secret_one() {
        // The severity mix-up the first-character anchor exists to prevent.
        assert!(fuzzy_prefix_match("pk_live_abcdef123456", "sk_live_", 2).is_none());
        assert!(fuzzy_prefix_match("sk_live_abcdef123456", "pk_live_", 2).is_none());
    }

    #[test]
    fn charset_ratio() {
        assert!((secret_charset_ratio("abcDEF123-_") - 1.0).abs() < 1e-9);
        assert!(secret_charset_ratio("hello world!") < 1.0);
        assert_eq!(secret_charset_ratio(""), 0.0);
    }
}

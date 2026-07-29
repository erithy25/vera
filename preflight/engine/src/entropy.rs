//! Entropie- und Struktur-Analyse.
//!
//! Entropie allein ist ein schlechter Secret-Detektor — Git-SHAs, UUIDs,
//! Minified-JS und Base64-Bilder haben ebenfalls hohe Entropie. Sie wird hier
//! deshalb nur als *eines* von mehreren Signalen benutzt und immer zusammen mit
//! den Negativfiltern aus `negative.rs` bewertet.

use std::collections::HashMap;

/// Shannon-Entropie in Bit pro Zeichen.
pub fn shannon(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let mut counts: HashMap<char, usize> = HashMap::new();
    for c in s.chars() {
        *counts.entry(c).or_insert(0) += 1;
    }
    let len = s.chars().count() as f64;
    -counts
        .values()
        .map(|&n| {
            let p = n as f64 / len;
            p * p.log2()
        })
        .sum::<f64>()
}

/// Zusammensetzung eines Tokens. Wird für die Struktur-Heuristiken gebraucht.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Composition {
    pub lower: usize,
    pub upper: usize,
    pub digit: usize,
    pub special: usize,
    pub other: usize,
    pub len: usize,
}

impl Composition {
    pub fn of(s: &str) -> Self {
        let mut c = Composition::default();
        for ch in s.chars() {
            c.len += 1;
            if ch.is_ascii_lowercase() {
                c.lower += 1;
            } else if ch.is_ascii_uppercase() {
                c.upper += 1;
            } else if ch.is_ascii_digit() {
                c.digit += 1;
            } else if matches!(ch, '-' | '_' | '+' | '/' | '=' | '.') {
                c.special += 1;
            } else {
                c.other += 1;
            }
        }
        c
    }

    /// Wie viele der vier Zeichenklassen kommen vor? Echte Zufalls-Secrets
    /// nutzen typischerweise mindestens drei.
    pub fn classes_present(&self) -> usize {
        [self.lower, self.upper, self.digit, self.special]
            .iter()
            .filter(|&&n| n > 0)
            .count()
    }

    pub fn is_all_hex(&self, s: &str) -> bool {
        !s.is_empty() && s.chars().all(|c| c.is_ascii_hexdigit())
    }

    pub fn is_all_digits(&self) -> bool {
        self.len > 0 && self.digit == self.len
    }

    /// Reine Kleinbuchstaben ohne Ziffern — praktisch immer natürliche Sprache
    /// oder ein Bezeichner, kein Secret.
    pub fn is_wordlike(&self) -> bool {
        self.len > 0 && self.digit == 0 && self.special == 0 && self.upper <= 1
    }
}

/// Längster Lauf gleicher Zeichenklasse. Ein echtes Zufalls-Secret hat kurze
/// Läufe; `aaaaaaaaaaaa` oder `000000000000` nicht.
pub fn longest_same_char_run(s: &str) -> usize {
    let mut best = 0usize;
    let mut cur = 0usize;
    let mut last: Option<char> = None;
    for c in s.chars() {
        if Some(c) == last {
            cur += 1;
        } else {
            cur = 1;
            last = Some(c);
        }
        best = best.max(cur);
    }
    best
}

/// Anteil unterschiedlicher Zeichen. Niedrige Werte deuten auf Wiederholungs-
/// muster (Platzhalter wie `xxxxxxxxxxxx`, `AAAA...`).
pub fn distinct_ratio(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let distinct: std::collections::HashSet<char> = s.chars().collect();
    distinct.len() as f64 / s.chars().count() as f64
}

/// Kombinierter Zufälligkeits-Score in [0,1].
///
/// Wichtig für die OCR-Toleranz: Ein OCR-Fehler verändert einzelne Zeichen,
/// aber weder Länge noch grobe Zusammensetzung. Alle Signale hier sind deshalb
/// gegenüber Einzelzeichen-Fehlern robust — im Gegensatz zu einem exakten
/// Regex-Match, der komplett scheitert.
pub fn randomness_score(s: &str) -> f64 {
    let comp = Composition::of(s);
    if comp.len < 8 {
        return 0.0;
    }

    let ent = shannon(s);
    // Base62 hat max. ~5,95 bit/Zeichen; bei kurzen Strings ist die gemessene
    // Entropie durch die Länge gedeckelt (max = log2(len)).
    let max_possible = (comp.len as f64).log2().min(6.0);
    let ent_norm = if max_possible > 0.0 {
        (ent / max_possible).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let class_score = match comp.classes_present() {
        0 | 1 => 0.0,
        2 => 0.45,
        3 => 0.85,
        _ => 1.0,
    };

    let distinct = distinct_ratio(s);
    let distinct_score = (distinct / 0.6).clamp(0.0, 1.0);

    let run = longest_same_char_run(s);
    let run_penalty = if run >= 5 { 0.3 } else if run >= 4 { 0.7 } else { 1.0 };

    // Reine Buchstabenfolgen ohne Ziffern und Sonderzeichen sind fast immer
    // natürliche Sprache oder Bezeichner. Ohne diese Strafe erreicht ein Wort
    // wie "configuration" über die reine Entropie einen zu hohen Wert, weil es
    // viele verschiedene Buchstaben enthält.
    let word_penalty = if comp.is_wordlike() { 0.35 } else { 1.0 };

    (0.45 * ent_norm + 0.35 * class_score + 0.20 * distinct_score) * run_penalty * word_penalty
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entropy_of_uniform_is_zero() {
        assert!(shannon("aaaaaaaa") < 0.001);
    }

    #[test]
    fn entropy_rises_with_variety() {
        assert!(shannon("abcdefgh") > shannon("aaaabbbb"));
    }

    #[test]
    fn composition_counts() {
        let c = Composition::of("aB3-");
        assert_eq!(c.lower, 1);
        assert_eq!(c.upper, 1);
        assert_eq!(c.digit, 1);
        assert_eq!(c.special, 1);
        assert_eq!(c.classes_present(), 4);
    }

    #[test]
    fn wordlike_detection() {
        assert!(Composition::of("hello").is_wordlike());
        assert!(!Composition::of("hello123").is_wordlike());
    }

    #[test]
    fn runs_and_distinct() {
        assert_eq!(longest_same_char_run("aaabbb"), 3);
        assert_eq!(longest_same_char_run("abcabc"), 1);
        assert!(distinct_ratio("aaaa") < 0.3);
        assert!((distinct_ratio("abcd") - 1.0).abs() < 1e-9);
    }

    #[test]
    fn randomness_separates_secrets_from_words() {
        let secret = randomness_score("T3xK9mPq2LvR8wZa5NbY");
        let word = randomness_score("configuration");
        let placeholder = randomness_score("xxxxxxxxxxxxxxxx");
        assert!(secret > 0.6, "secret score was {secret}");
        assert!(word < 0.45, "word score was {word}");
        assert!(placeholder < 0.3, "placeholder score was {placeholder}");
        assert!(secret > word);
        assert!(secret > placeholder);
    }

    #[test]
    fn short_strings_score_zero() {
        assert_eq!(randomness_score("aB3x"), 0.0);
    }
}

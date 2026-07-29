//! OCR-Fehlertoleranz.
//!
//! Das Problem, das dieses Modul löst und das kein dateibasierter Secret-Scanner
//! hat: Der Text, den wir prüfen, wurde nie korrekt gelesen. Vision/Tesseract
//! liefern für einen echten Key `sk-proj-AbC1...` je nach Schriftart und
//! Auflösung `sk-pr0j-AbCl...`, `5k-proj-A6C1...` oder `sk‑proj–AbC1…`.
//!
//! Ein exaktes Regex-Muster (gitleaks, trufflehog) findet davon nichts.
//!
//! Strategie — bewusst asymmetrisch:
//!   * Auf dem **Präfix** wird aggressiv normalisiert. Präfixe sind kurz und
//!     bekannt; ein unscharfer Treffer ist billig, weil der Rest des Tokens
//!     danach immer noch die Struktur eines Secrets haben muss.
//!   * Auf dem **Körper** wird NICHT normalisiert. Dort zählen Länge, Zeichensatz
//!     und Entropie. Würde man hier normalisieren, stiege die Falsch-Positiv-Rate
//!     stark an, weil die Entropie künstlich sinkt.

/// Unicode-Zeichen, die OCR-Engines und Terminal-Renderer für ASCII einsetzen.
/// Muss vor jeder weiteren Verarbeitung angewandt werden, sonst scheitern schon
/// die Wortgrenzen (ein `‑` ist kein `-`).
pub fn normalize_unicode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            // Bindestrich-Varianten (en/em dash, minus sign, non-breaking hyphen,
            // figure dash, horizontal bar) -> ASCII-Hyphen
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
            | '\u{2212}' | '\u{FE58}' | '\u{FE63}' | '\u{FF0D}' => '-',
            // Unterstrich-Varianten
            '\u{FF3F}' | '\u{FE4D}' | '\u{FE4E}' | '\u{FE4F}' => '_',
            // Anführungszeichen
            '\u{2018}' | '\u{2019}' | '\u{201B}' | '\u{2032}' | '\u{FF07}' => '\'',
            '\u{201C}' | '\u{201D}' | '\u{201F}' | '\u{2033}' | '\u{FF02}' => '"',
            // Doppelpunkt / Gleichheitszeichen in Vollbreite
            '\u{FF1A}' => ':',
            '\u{FF1D}' => '=',
            '\u{FF0E}' => '.',
            // Diverse Leerzeichen -> normales Leerzeichen
            '\u{00A0}' | '\u{2007}' | '\u{202F}' | '\u{2009}' | '\u{200A}' | '\u{2002}'
            | '\u{2003}' | '\u{3000}' => ' ',
            // Zero-width-Zeichen werden entfernt (siehe filter unten)
            other => other,
        })
        // Zero-width joiner / non-joiner / space, BOM, soft hyphen: OCR-Artefakte
        .filter(|c| !matches!(c, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | '\u{00AD}'))
        .collect()
}

/// Bildet ein Zeichen auf seine Verwechslungsklasse ab.
///
/// Die Klassen stammen aus den Glyphen-Kollisionen, die in Monospace-Schriften
/// (SF Mono, Menlo, JetBrains Mono, Fira Code, Consolas) tatsächlich auftreten.
/// Bewusst konservativ: jedes zusätzliche Paar erhöht die Trefferquote beim
/// Präfix, aber auch das Risiko, dass ein harmloses Wort auf ein Präfix passt.
pub fn confusion_class(c: char) -> char {
    match c {
        // Null / O / o / Q — die mit Abstand häufigste Verwechslung
        '0' | 'O' | 'o' | 'Q' | 'D' => '0',
        // Eins / kleines L / großes I / Pipe / Ausrufezeichen
        '1' | 'l' | 'I' | 'i' | '|' | '!' | 'j' | 'L' => '1',
        // Fünf / S
        '5' | 'S' | 's' | '$' => '5',
        // Acht / B
        '8' | 'B' => '8',
        // Zwei / Z
        '2' | 'Z' | 'z' => '2',
        // Sechs / G / b
        '6' | 'G' | 'b' => '6',
        // Neun / g / q
        '9' | 'g' | 'q' => '9',
        // Sieben / T (schmale Schriften)
        '7' | 'T' | 't' => '7',
        // U / V
        'U' | 'u' | 'V' | 'v' => 'u',
        // C / c (mit ( in sehr kleinen Größen)
        'C' | 'c' | '(' => 'c',
        // Bindestrich / Unterstrich / Punkt werden NICHT zusammengeworfen —
        // sie trennen Präfixe und sind für die Struktur bedeutsam.
        other => other.to_ascii_lowercase(),
    }
}

/// Normalisiert einen String in den Verwechslungsraum.
/// Zusätzlich werden Mehrzeichen-Verwechslungen aufgelöst (`rn` -> `m`,
/// `vv` -> `w`, `cl` -> `d`), die in kleinen Schriftgraden real auftreten.
pub fn normalize_confusable(s: &str) -> String {
    let pre = s
        .replace("rn", "m")
        .replace("RN", "m")
        .replace("vv", "w")
        .replace("VV", "w")
        .replace("cl", "d");
    pre.chars().map(confusion_class).collect()
}

/// Wie [`normalize_confusable`], aber **längenerhaltend**: nur 1:1-Abbildungen,
/// keine Mehrzeichen-Ersetzungen.
///
/// Wird überall dort gebraucht, wo Zeichen-Offsets im Ergebnis erhalten bleiben
/// müssen — etwa bei der Suche nach PEM-Headern im Fließtext, wo die gemeldete
/// Position zum Originaltext passen muss.
pub fn normalize_confusable_keep_len(s: &str) -> String {
    s.chars().map(confusion_class).collect()
}

/// Sucht `needle` in `haystack` im Verwechslungsraum und liefert die
/// Zeichen-Offsets aller Treffer im **Originaltext**.
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

/// Levenshtein-Distanz, begrenzt auf `max`. Bricht früh ab, sobald jede Zelle
/// einer Zeile `max` überschreitet — bei Präfixen (< 16 Zeichen) ist das
/// vernachlässigbar schnell.
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

/// Prüft, ob `text` mit `prefix` beginnt — tolerant gegenüber OCR-Fehlern.
///
/// Rückgabe: `Some(anzahl_verbrauchter_zeichen)`, damit der Aufrufer den Körper
/// des Tokens exakt abtrennen kann. Bei einer Einfügung/Löschung im Präfix
/// verschiebt sich die Grenze, deshalb wird das Fenster um ±`max_dist` variiert
/// und die beste Übereinstimmung gewählt.
pub fn fuzzy_prefix_match(text: &str, prefix: &str, max_dist: usize) -> Option<usize> {
    // Anker auf dem ersten Zeichen — sicherheitskritisch.
    //
    // Ohne diese Regel matcht `pk_live_` (öffentlicher Stripe-Key, harmlos)
    // gegen `sk_live_` (geheimer Key, kritisch), weil sie im Verwechslungsraum
    // Distanz 1 haben. Das wäre eine Schweregrad-Verwechslung: Preflight würde
    // einen unkritischen Wert als kritischen Fund melden — und umgekehrt könnte
    // ein echter Fund unter falschem Label laufen.
    //
    // Der Anker vergleicht in der Verwechslungsklasse, nicht exakt. `5k-proj-`
    // matcht deshalb weiterhin `sk-proj-` (beide Klasse '5'), während `pk_`
    // ('p') und `sk_` ('5') sauber getrennt bleiben.
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

    let mut best: Option<(usize, usize)> = None; // (distanz, verbrauchte zeichen)
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

/// Wie viele Zeichen eines Tokens sind nach der Normalisierung noch plausibel
/// Teil eines Base62/Base64-Secrets? Wird benutzt, um abgeschnittene Tokens
/// (Zeilenumbruch, Fensterrand) zu erkennen.
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
        // Bindestrich und Unterstrich bleiben getrennt — strukturell bedeutsam
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
        // O statt 0, l statt 1 — der klassische Fall
        assert!(fuzzy_prefix_match("sk-pr0j-ABC", "sk-proj-", 2).is_some());
        assert!(fuzzy_prefix_match("5k-proj-ABC", "sk-proj-", 2).is_some());
        assert!(fuzzy_prefix_match("gbp_abcdef", "ghp_", 2).is_some());
        // Etwas völlig anderes darf nicht treffen
        assert!(fuzzy_prefix_match("hello-world", "sk-proj-", 2).is_none());
    }

    #[test]
    fn fuzzy_prefix_reports_consumed_length() {
        let n = fuzzy_prefix_match("sk-proj-ABCDEF", "sk-proj-", 2).unwrap();
        assert_eq!(n, 8);
    }

    #[test]
    fn charset_ratio() {
        assert!((secret_charset_ratio("abcDEF123-_") - 1.0).abs() < 1e-9);
        assert!(secret_charset_ratio("hallo welt!") < 1.0);
        assert_eq!(secret_charset_ratio(""), 0.0);
    }
}

use preflight_engine::*;
fn main() {
    for t in ["pk_live_T3xK9mPq2LvR8wZa5NbYc7Hd", "sk-proj-T3xK9mPq2LvR8wZa5NbYc7Hd"] {
        let r = detect_with_report(t);
        println!("--- {t}");
        println!("  findings: {:?}", r.findings.iter().map(|f| (&f.pattern_id, f.severity, f.confidence)).collect::<Vec<_>>());
        println!("  rejected: {:?}", r.rejected.iter().map(|x| (&x.token, x.reason.as_str())).collect::<Vec<_>>());
        // manual probe
        let body = "T3xK9mPq2LvR8wZa5NbYc7Hd";
        println!("  body len={} rand={:.3} base62={:.3}", body.len(),
            preflight_engine::entropy::randomness_score(body),
            preflight_engine::patterns::BodyCharset::Base62.ratio(body));
        println!("  prefix pk_live_ -> {:?}", preflight_engine::ocr::fuzzy_prefix_match(t, "pk_live_", 2));
    }
}

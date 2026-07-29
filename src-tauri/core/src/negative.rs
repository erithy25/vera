//! Negative filters — the part that decides whether the product is usable.
//!
//! The kill gate is fewer than one false alarm per 10 minutes of video. A
//! developer's screen is permanently covered in text that looks like a secret:
//! git SHAs, UUIDs, content hashes in filenames, minified JS, base64 images,
//! npm integrity hashes.
//!
//! The most important case is a different one though, and it follows directly
//! from the audience: **our users record tutorials.** A tutorial video shows
//! example keys in almost every case — `sk-your-api-key-here`,
//! `sk-ant-api03-xxxxxxxx`, `AKIAIOSFODNN7EXAMPLE`. A tool that reports all of
//! those is uninstalled after the second scan.

/// Why a candidate was rejected. Carried all the way to the UI so that
/// false-positive reports can be analysed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rejection {
    Placeholder,
    GitSha,
    Uuid,
    IntegrityHash,
    ContentHashFilename,
    DataUri,
    Semver,
    IpAddress,
    HexColor,
    Timestamp,
    FilePath,
    PlainUrl,
    DocumentedExample,
    TooShort,
    WordLike,
    LowRandomness,
    RepeatedChar,
    MimeOrEncoding,
}

impl Rejection {
    pub fn as_str(&self) -> &'static str {
        match self {
            Rejection::Placeholder => "placeholder",
            Rejection::GitSha => "git-sha",
            Rejection::Uuid => "uuid",
            Rejection::IntegrityHash => "integrity-hash",
            Rejection::ContentHashFilename => "content-hash-filename",
            Rejection::DataUri => "data-uri",
            Rejection::Semver => "semver",
            Rejection::IpAddress => "ip-address",
            Rejection::HexColor => "hex-color",
            Rejection::Timestamp => "timestamp",
            Rejection::FilePath => "file-path",
            Rejection::PlainUrl => "plain-url",
            Rejection::DocumentedExample => "documented-example",
            Rejection::TooShort => "too-short",
            Rejection::WordLike => "word-like",
            Rejection::LowRandomness => "low-randomness",
            Rejection::RepeatedChar => "repeated-char",
            Rejection::MimeOrEncoding => "mime-or-encoding",
        }
    }
}

/// Words that appear in placeholders. Matched case-insensitively.
const PLACEHOLDER_MARKERS: &[&str] = &[
    "your", "youre", "yours", "example", "sample", "placeholder", "replace",
    "insert", "here", "todo", "fixme", "changeme", "change_me", "dummy", "fake",
    // "test" is deliberately NOT here: `sk_test_…` and `pk_test_…` are real
    // Stripe prefixes. A tutorial placeholder like `sk_test_YOUR_KEY_HERE` is
    // still caught through "your"/"here".
    "demo", "redacted", "hidden", "removed", "secret_here", "mykey",
    "my_key", "apikey_here", "xxxx", "abcdef123456", "1234567890abcdef",
    "notreal", "invalid", "foobar", "lorem",
];

/// Example values documented by the providers themselves. These show up in
/// every other tutorial because they are copied from the official docs.
const DOCUMENTED_EXAMPLES: &[&str] = &[
    "AKIAIOSFODNN7EXAMPLE",
    "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "AKIAI44QH8DHBEXAMPLE",
    "je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY",
    "sk-1234567890abcdef1234567890abcdef",
    "xoxb-your-token",
    "ghp_1234567890abcdef1234567890abcdef1234",
];

fn lower(s: &str) -> String {
    s.to_ascii_lowercase()
}

/// Does the candidate carry a placeholder signal?
pub fn is_placeholder(s: &str) -> bool {
    let l = lower(s);

    // Brackets around the value: <your-key>, {API_KEY}, [token]
    if (l.starts_with('<') && l.ends_with('>'))
        || (l.starts_with('{') && l.ends_with('}'))
        || (l.starts_with('[') && l.ends_with(']'))
    {
        return true;
    }

    // Masked with asterisks or dots: sk-****, abc…def
    if s.contains("***") || s.contains("•••") || s.contains("…") || s.contains("...") {
        return true;
    }

    for m in PLACEHOLDER_MARKERS {
        if l.contains(m) {
            return true;
        }
    }

    // Long runs of the same character inside the value: sk-xxxxxxxxxxxx,
    // ghp_000000000000. From 6 identical characters on it is not random.
    let mut run = 0usize;
    let mut last: Option<char> = None;
    for c in s.chars() {
        if Some(c) == last {
            run += 1;
            if run >= 6 {
                return true;
            }
        } else {
            run = 1;
            last = Some(c);
        }
    }

    // Ascending or descending sequences: abcdefghijkl, 123456789012
    if has_long_monotonic_run(s, 8) {
        return true;
    }

    false
}

/// Recognises `abcdefgh` / `12345678` / `zyxwvuts` as placeholder patterns.
fn has_long_monotonic_run(s: &str, min_len: usize) -> bool {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < min_len {
        return false;
    }
    let mut up = 1usize;
    let mut down = 1usize;
    for w in chars.windows(2) {
        let (a, b) = (w[0] as i32, w[1] as i32);
        if b - a == 1 {
            up += 1;
            down = 1;
        } else if a - b == 1 {
            down += 1;
            up = 1;
        } else {
            up = 1;
            down = 1;
        }
        if up >= min_len || down >= min_len {
            return true;
        }
    }
    false
}

pub fn is_documented_example(s: &str) -> bool {
    DOCUMENTED_EXAMPLES.iter().any(|e| s.contains(e))
}

/// Is the value a code reference rather than a literal?
///
/// `const apiKey = process.env.OPENAI_API_KEY` is the **correct** way to handle
/// secrets and appears in every tutorial. A tool that reports best practice as
/// a leak is worse than useless.
///
/// Recognised: environment access, function calls, shell variables, object
/// paths and template placeholders.
pub fn is_code_reference(s: &str) -> bool {
    let l = lower(s);

    // Environment access in the common languages
    const ENV_ACCESS: &[&str] = &[
        "process.env", "os.environ", "os.getenv", "system.getenv", "env::var",
        "environment.get", "config.get", "settings.", "secrets.", "vault.",
        "dotenv", "importmeta.env", "import.meta.env", "runtimeconfig",
    ];
    if ENV_ACCESS.iter().any(|e| l.contains(e)) {
        return true;
    }

    // Shell variables: $TOKEN, ${TOKEN}, %TOKEN%
    if s.starts_with('$') || (s.starts_with('%') && s.ends_with('%')) {
        return true;
    }

    // Template interpolation: {{ .Values.token }}, ${{ secrets.GH_TOKEN }}
    if s.contains("{{") || s.contains("${") {
        return true;
    }

    // Function call: anything with parentheses
    if s.contains('(') || s.contains(')') {
        return true;
    }

    // Dotted identifier path with no random look: a.b.c / foo.bar_baz
    if s.contains('.') {
        let parts: Vec<&str> = s.split('.').collect();
        let identifier_like = parts.len() >= 2
            && parts.iter().all(|p| {
                !p.is_empty()
                    && p.chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                    && p.chars().next().map(|c| !c.is_ascii_digit()).unwrap_or(false)
            });
        if identifier_like {
            return true;
        }
    }

    false
}

fn all_hex(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn all_lower_hex(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

/// Git commit hash: 40 characters (SHA-1) or 64 (SHA-256), lowercase hex only.
/// The usual short forms 7–12 count as well.
pub fn is_git_sha(s: &str) -> bool {
    let n = s.chars().count();
    all_lower_hex(s) && (n == 40 || n == 64 || (7..=12).contains(&n))
}

/// UUID with or without hyphens.
pub fn is_uuid(s: &str) -> bool {
    let stripped = s.replace('-', "");
    if stripped.chars().count() != 32 || !all_hex(&stripped) {
        return false;
    }
    // With hyphens: exactly the 8-4-4-4-12 shape
    if s.contains('-') {
        let parts: Vec<&str> = s.split('-').collect();
        return parts.len() == 5
            && parts[0].len() == 8
            && parts[1].len() == 4
            && parts[2].len() == 4
            && parts[3].len() == 4
            && parts[4].len() == 12;
    }
    true
}

/// npm/yarn `integrity` fields and Docker digests.
pub fn is_integrity_hash(s: &str) -> bool {
    let l = lower(s);
    l.starts_with("sha512-")
        || l.starts_with("sha384-")
        || l.starts_with("sha256-")
        || l.starts_with("sha256:")
        || l.starts_with("sha1-")
        || l.starts_with("md5-")
}

/// Bundler filenames: `main.a3f9b2c1.js`, `chunk-4F2A9B.mjs`, `app.f0e1d2c3.css`
pub fn is_content_hash_filename(s: &str) -> bool {
    const EXTS: &[&str] = &[
        ".js", ".mjs", ".cjs", ".css", ".map", ".woff", ".woff2", ".png", ".jpg",
        ".svg", ".webp", ".wasm", ".html", ".json", ".ts", ".tsx",
    ];
    let l = lower(s);
    EXTS.iter().any(|e| l.ends_with(e))
}

pub fn is_data_uri(s: &str) -> bool {
    let l = lower(s);
    l.starts_with("data:") || l.starts_with("blob:")
}

/// MIME types and encoding headers, permanently visible in DevTools.
pub fn is_mime_or_encoding(s: &str) -> bool {
    let l = lower(s);
    l.starts_with("application/")
        || l.starts_with("text/")
        || l.starts_with("image/")
        || l.starts_with("multipart/")
        || l.starts_with("charset=")
        || l == "gzip"
        || l == "deflate"
        || l == "br"
}

/// Semantic versions, including range prefixes and prerelease parts.
pub fn is_semver(s: &str) -> bool {
    let t = s.trim_start_matches(['v', 'V', '^', '~', '=', '>', '<']);
    let core = t.split(['-', '+']).next().unwrap_or("");
    let parts: Vec<&str> = core.split('.').collect();
    (2..=4).contains(&parts.len())
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

pub fn is_ip_address(s: &str) -> bool {
    // IPv4, optionally with a port
    let host = s.split(':').next().unwrap_or(s);
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() == 4
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.len() <= 3
                && p.chars().all(|c| c.is_ascii_digit())
                && p.parse::<u32>().map(|n| n <= 255).unwrap_or(false)
        })
    {
        return true;
    }
    // IPv6, roughly
    s.matches(':').count() >= 2 && s.chars().all(|c| c.is_ascii_hexdigit() || c == ':')
}

pub fn is_hex_color(s: &str) -> bool {
    let t = s.strip_prefix('#').unwrap_or(s);
    matches!(t.chars().count(), 3 | 4 | 6 | 8) && all_hex(t) && s.starts_with('#')
}

/// Unix timestamps (10 or 13 digits) and ISO dates.
pub fn is_timestamp(s: &str) -> bool {
    let n = s.chars().count();
    if (n == 10 || n == 13) && s.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    // ISO-8601: 2026-07-29T12:34:56
    if n >= 10 {
        let b = s.as_bytes();
        if b.len() >= 10
            && b[0..4].iter().all(|c| c.is_ascii_digit())
            && b[4] == b'-'
            && b[5..7].iter().all(|c| c.is_ascii_digit())
            && b[7] == b'-'
            && b[8..10].iter().all(|c| c.is_ascii_digit())
        {
            return true;
        }
    }
    false
}

pub fn is_file_path(s: &str) -> bool {
    s.starts_with('/')
        || s.starts_with("./")
        || s.starts_with("../")
        || s.starts_with("~/")
        || (s.len() > 3 && s.as_bytes()[1] == b':' && (s.contains('\\')))
        || s.contains("/node_modules/")
        || s.contains("/.git/")
}

/// A URL without embedded credentials. A URL *with* `user:pass@` very much is a
/// finding and is deliberately not rejected here.
pub fn is_plain_url(s: &str) -> bool {
    let l = lower(s);
    let is_url = l.starts_with("http://")
        || l.starts_with("https://")
        || l.starts_with("ws://")
        || l.starts_with("wss://")
        || l.starts_with("ftp://");
    if !is_url {
        return false;
    }
    // Credentials in the authority?
    if let Some(rest) = l.split("//").nth(1) {
        let authority = rest.split('/').next().unwrap_or("");
        if authority.contains('@') && authority.contains(':') {
            return false; // carries credentials -> do not reject
        }
    }
    true
}

/// Every structural negative filter in one pass.
/// `None` = nothing matched, the candidate stays in the running.
pub fn structural_rejection(s: &str) -> Option<Rejection> {
    if s.chars().count() < 8 {
        return Some(Rejection::TooShort);
    }
    if is_placeholder(s) {
        return Some(Rejection::Placeholder);
    }
    if is_documented_example(s) {
        return Some(Rejection::DocumentedExample);
    }
    if is_data_uri(s) {
        return Some(Rejection::DataUri);
    }
    if is_mime_or_encoding(s) {
        return Some(Rejection::MimeOrEncoding);
    }
    if is_integrity_hash(s) {
        return Some(Rejection::IntegrityHash);
    }
    if is_uuid(s) {
        return Some(Rejection::Uuid);
    }
    if is_git_sha(s) {
        return Some(Rejection::GitSha);
    }
    if is_content_hash_filename(s) {
        return Some(Rejection::ContentHashFilename);
    }
    if is_hex_color(s) {
        return Some(Rejection::HexColor);
    }
    if is_semver(s) {
        return Some(Rejection::Semver);
    }
    if is_ip_address(s) {
        return Some(Rejection::IpAddress);
    }
    if is_timestamp(s) {
        return Some(Rejection::Timestamp);
    }
    if is_file_path(s) {
        return Some(Rejection::FilePath);
    }
    if is_plain_url(s) {
        return Some(Rejection::PlainUrl);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tutorial_placeholders_are_rejected() {
        // This is the most important test in the whole module.
        assert!(is_placeholder("sk-your-api-key-here"));
        assert!(is_placeholder("sk-ant-api03-xxxxxxxxxxxxxxxx"));
        assert!(is_placeholder("<your-token>"));
        assert!(is_placeholder("{API_KEY}"));
        assert!(is_placeholder("ghp_REPLACE_ME"));
        assert!(is_placeholder("sk-proj-***************"));
        assert!(is_placeholder("YOUR_SECRET_HERE"));
        assert!(is_placeholder("sk-abcdefghijklmnop"));
        assert!(is_placeholder("token-000000000000"));
        assert!(is_placeholder("sk-proj-abc…xyz"));
    }

    #[test]
    fn aws_documented_example_rejected() {
        assert!(is_documented_example("AKIAIOSFODNN7EXAMPLE"));
        assert!(structural_rejection("AKIAIOSFODNN7EXAMPLE").is_some());
    }

    #[test]
    fn best_practice_is_not_a_leak() {
        // A tool that flags this is worse than useless.
        assert!(is_code_reference("process.env.OPENAI_API_KEY"));
        assert!(is_code_reference("os.environ.get"));
        assert!(is_code_reference("$GITHUB_TOKEN"));
        assert!(is_code_reference("${{ secrets.GH_TOKEN }}"));
        assert!(is_code_reference("config.get"));
        // A real literal is not a code reference
        assert!(!is_code_reference("T3xK9mPq2LvR8wZa5NbYc7Hd"));
    }

    #[test]
    fn git_shas_rejected() {
        assert!(is_git_sha("3c198ac"));
        assert!(is_git_sha("a074f80ab12cd34ef56789012345678901234567"));
        // Uppercase hex is not a git SHA
        assert!(!is_git_sha("A074F80AB12CD34EF56789012345678901234567"));
    }

    #[test]
    fn uuids_rejected() {
        assert!(is_uuid("dbf38fa8-c92d-5164-853a-fd6f17eb9cc9"));
        assert!(is_uuid("dbf38fa8c92d5164853afd6f17eb9cc9"));
        assert!(!is_uuid("dbf38fa8-c92d-5164-853a"));
    }

    #[test]
    fn build_artifacts_rejected() {
        assert!(is_integrity_hash("sha512-abcdefghijklmnop=="));
        assert!(is_content_hash_filename("main.a3f9b2c1.js"));
        assert!(is_data_uri("data:image/png;base64,iVBORw0KGgo"));
        assert!(is_mime_or_encoding("application/json"));
    }

    #[test]
    fn common_screen_noise_rejected() {
        assert!(is_semver("1.2.3"));
        assert!(is_semver("v2.11.2"));
        assert!(is_semver("^4.6.0"));
        assert!(is_ip_address("192.168.1.100"));
        assert!(is_ip_address("127.0.0.1:5432"));
        assert!(is_hex_color("#a3f9b2"));
        assert!(is_timestamp("1753776000"));
        assert!(is_timestamp("2026-07-29T12:00:00"));
        assert!(is_file_path("/Users/erik/dev/project"));
        assert!(is_file_path("./src/lib.rs"));
    }

    #[test]
    fn plain_url_rejected_but_credential_url_kept() {
        assert!(is_plain_url("https://example.com/path?q=1"));
        // A URL with credentials is a real finding and must NOT be rejected
        assert!(!is_plain_url("postgres://admin:Hunter2Pass@db.example.com:5432/app"));
        assert!(!is_plain_url("https://user:s3cr3tPassw0rd@internal.example.com"));
    }

    #[test]
    fn monotonic_runs_are_placeholders() {
        assert!(has_long_monotonic_run("abcdefghij", 8));
        assert!(has_long_monotonic_run("123456789012", 8));
        assert!(!has_long_monotonic_run("aXbYcZdW", 8));
    }

    #[test]
    fn real_looking_secret_survives_all_filters() {
        assert!(structural_rejection("T3xK9mPq2LvR8wZa5NbYc7Hd").is_none());
    }
}

//! Privacy rules: which processes and domains are never recorded.
//!
//! Extracted from `lib.rs`. Two of these functions (`categorize_app`,
//! `is_system_process_name`) also existed in `src/lib/db.ts` — the Rust version
//! was even labelled "Port of …" in its own comment. Those copies are gone;
//! this is the single source of truth.

/// Processes that never count as user activity.
/// Compared **exactly** against the lowercased app name (never as a substring),
/// so real apps like "System Settings" or "Docker" are not filtered by accident.
pub const SYSTEM_PROCESS_BLOCKLIST: &[&str] = &[
    "loginwindow",
    "login window",
    "screensaverengine",
    "screensaver",
    "screen saver",
    "windowserver",
    "window server",
    "systemuiserver",
    "controlcenter",
    "control center",
    "notificationcenter",
    "notification center",
    "usernotificationcenter",
    "spotlight",
    "coreautha",
    "universalcontrol",
    "wallpaper",
    "talagent",
    "screencaptureui",
    "lockoutagent",
    "dock",
    "unknown", // tracker fallback when a process reports no name
];

/// Password managers and banking apps excluded by default.
pub const DEFAULT_EXCLUDED_APPS: &[&str] = &[
    "1Password", "Bitwarden", "KeePassXC", "Dashlane", "LastPass", "Keychain Access",
    "Enpass", "Banking",
];

pub fn is_system_process(app_name: &str, bundle_id: &str) -> bool {
    let app = app_name.to_lowercase();
    let bundle = bundle_id.to_lowercase();
    SYSTEM_PROCESS_BLOCKLIST.contains(&app.as_str())
        || bundle.contains("loginwindow")
        || bundle.contains("windowserver")
        || bundle.contains("screensaver")
        || bundle.contains("systemuiserver")
        || bundle.contains("notificationcenter")
        || bundle.contains("spotlight")
        || bundle == "com.apple.controlcenter"
        || bundle == "com.apple.dock"
}

/// Name only — for paths that have no bundle ID at hand.
pub fn is_system_process_name(app_name: &str) -> bool {
    let n = app_name.to_lowercase();
    SYSTEM_PROCESS_BLOCKLIST.contains(&n.as_str()) || n.contains("loginwindow")
}

pub fn is_browser(app_name: &str, bundle_id: &str) -> bool {
    let app = app_name.to_lowercase();
    let bundle = bundle_id.to_lowercase();
    matches!(app.as_str(), "safari" | "google chrome" | "chrome" | "arc" | "microsoft edge" | "edge")
        || matches!(
            bundle.as_str(),
            "com.apple.safari"
                | "com.google.chrome"
                | "company.thebrowser.browser"
                | "com.microsoft.edgemc"
                | "com.microsoft.edge"
        )
}

/// Is the URL's domain excluded? Subdomains are matched too.
pub fn is_domain_excluded(url: &str, excluded: &[String]) -> bool {
    let mut host = url;
    if let Some(i) = url.find("://") {
        host = &url[i + 3..];
    }
    // Skip credentials in the authority (user:pass@host)
    if let Some(i) = host.find('@') {
        host = &host[i + 1..];
    }
    if let Some(i) = host.find('/') {
        host = &host[..i];
    }
    if let Some(i) = host.find(':') {
        host = &host[..i];
    }
    let host = host.trim_start_matches("www.").to_lowercase();
    if host.is_empty() {
        return false;
    }

    excluded.iter().any(|d| {
        let d = d.trim().trim_start_matches("www.").to_lowercase();
        !d.is_empty() && (host == d || host.ends_with(&format!(".{d}")))
    })
}

/// Is the app excluded? Substring comparison, so "1Password" also matches
/// "1Password 8".
pub fn is_app_excluded(app_name: &str, bundle_id: &str, excluded: &[String]) -> bool {
    let app = app_name.to_lowercase();
    let bundle = bundle_id.to_lowercase();
    excluded.iter().any(|e| {
        let e = e.trim().to_lowercase();
        !e.is_empty() && (app.contains(&e) || bundle.contains(&e))
    })
}

/// Coarse category for an app — drives the timeline display.
pub fn categorize_app(app_name: &str) -> &'static str {
    let n = app_name.to_lowercase();
    let has = |k: &str| n.contains(k);
    if has("code") || has("xcode") || has("terminal") || has("warp") || has("iterm") || has("developer") {
        "code"
    } else if has("figma") || has("sketch") || has("photoshop") || has("illustrator") || has("framer") {
        "design"
    } else if has("notion") || has("obsidian") || has("word") || has("pages") || has("textedit") || has("book") || has("reader") {
        "docs"
    } else if has("message") || has("slack") || has("mail") || has("discord") || has("whatsapp") || has("telegram") {
        "comms"
    } else if has("zoom") || has("meet") || has("facetime") || has("teams") || has("webex") {
        "meeting"
    } else if has("arc") || has("chrome") || has("safari") || has("firefox") || has("edge") || has("browser") {
        "browser"
    } else {
        "other"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn system_processes_are_filtered() {
        assert!(is_system_process("loginwindow", ""));
        assert!(is_system_process("Dock", "com.apple.dock"));
        assert!(is_system_process("", "com.apple.WindowServer"));
        assert!(is_system_process("Unknown", ""));
    }

    #[test]
    fn real_apps_are_not_filtered_by_substring() {
        // Regression guard: "Dock" is on the list, "Docker" must not be
        // filtered along with it.
        assert!(!is_system_process("Docker", "com.docker.docker"));
        assert!(!is_system_process("Docker Desktop", "com.docker.desktop"));
        assert!(!is_system_process("System Settings", "com.apple.systempreferences"));
        assert!(!is_system_process("Spotlight Search Helper", "com.acme.helper"));
    }

    #[test]
    fn browsers_are_recognized() {
        assert!(is_browser("Safari", "com.apple.Safari"));
        assert!(is_browser("Google Chrome", ""));
        assert!(is_browser("", "company.thebrowser.Browser"));
        assert!(!is_browser("Visual Studio Code", "com.microsoft.VSCode"));
    }

    #[test]
    fn excluded_domains_match_subdomains_only_correctly() {
        let ex = v(&["bank.example", "example.com"]);
        assert!(is_domain_excluded("https://bank.example/account", &ex));
        assert!(is_domain_excluded("https://www.bank.example/", &ex));
        assert!(is_domain_excluded("https://login.bank.example/", &ex));
        assert!(is_domain_excluded("https://example.com:8443/x", &ex));
        // Must NOT match — different registrable domain, only suffix similarity
        assert!(!is_domain_excluded("https://notbank.example/", &ex));
        assert!(!is_domain_excluded("https://bank.example.evil.com/", &ex));
    }

    #[test]
    fn credentials_in_url_do_not_confuse_the_host_check() {
        let ex = v(&["bank.example"]);
        assert!(is_domain_excluded("https://user:pass@bank.example/account", &ex));
        assert!(!is_domain_excluded("https://bank.example:pass@evil.com/", &ex));
    }

    #[test]
    fn empty_exclusion_list_excludes_nothing() {
        assert!(!is_domain_excluded("https://bank.example", &[]));
        assert!(!is_domain_excluded("https://bank.example", &v(&["", "  "])));
        assert!(!is_app_excluded("1Password", "", &[]));
    }

    #[test]
    fn password_managers_are_excluded_by_default() {
        let ex: Vec<String> = DEFAULT_EXCLUDED_APPS.iter().map(|s| s.to_string()).collect();
        assert!(is_app_excluded("1Password 8", "com.1password.1password", &ex));
        assert!(is_app_excluded("Bitwarden", "", &ex));
        assert!(is_app_excluded("Keychain Access", "", &ex));
        assert!(!is_app_excluded("Visual Studio Code", "com.microsoft.VSCode", &ex));
    }

    #[test]
    fn categories_are_stable() {
        assert_eq!(categorize_app("Visual Studio Code"), "code");
        assert_eq!(categorize_app("Terminal"), "code");
        assert_eq!(categorize_app("Figma"), "design");
        assert_eq!(categorize_app("Notion"), "docs");
        assert_eq!(categorize_app("Slack"), "comms");
        assert_eq!(categorize_app("Zoom"), "meeting");
        assert_eq!(categorize_app("Safari"), "browser");
        assert_eq!(categorize_app("Some Unknown App"), "other");
    }
}

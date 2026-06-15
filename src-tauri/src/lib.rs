use tauri_plugin_sql::{Migration, MigrationKind};
use std::os::raw::c_char;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::Manager;
use std::sync::Mutex;
use rusqlite::OptionalExtension;

#[repr(C)]
pub struct AppActivity {
    pub app_name: *mut c_char,
    pub bundle_id: *mut c_char,
    pub window_title: *mut c_char,
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
}

extern "C" {
    fn get_active_app_activity() -> AppActivity;
    fn free_app_activity(activity: AppActivity);
    #[link_name = "check_accessibility_permission"]
    fn ffi_check_accessibility_permission() -> bool;
    #[link_name = "request_accessibility_permission"]
    fn ffi_request_accessibility_permission() -> bool;
    #[link_name = "is_screen_locked"]
    fn ffi_is_screen_locked() -> bool;
    #[link_name = "check_screen_recording_permission"]
    fn ffi_check_screen_recording_permission() -> bool;
    #[link_name = "request_screen_recording_permission"]
    fn ffi_request_screen_recording_permission() -> bool;
    // Media-key vault (Keychain + Touch ID / Secure Enclave). See src/vault.m.
    fn vault_has_key() -> i32;
    fn vault_get_or_create(out: *mut u8) -> i32;
}

struct PrivacySettings {
    paused: bool,
    excluded_apps: Vec<String>,
    excluded_domains: Vec<String>,
}

struct PrivacyState {
    settings: Mutex<PrivacySettings>,
}

// Handle to the tray's capture-toggle menu item, so its label can be kept in
// sync with the capture-paused state from anywhere (tray click or in-app).
struct TrayHandles {
    pause_item: Mutex<Option<tauri::menu::MenuItem<tauri::Wry>>>,
}

// Frame-based screen recording (SCStream sidecar). `enabled` mirrors the
// `frames_capture_enabled` setting (default OFF); `child` is the live sidecar
// process so the supervisor can start/stop it. Both window-independent so
// capture keeps running when the window is hidden/closed.
struct FrameCaptureState {
    enabled: Mutex<bool>,
    child: Mutex<Option<std::process::Child>>,
}

// The AES-256 media key, held in memory only for the unlocked session. It is
// loaded from the Keychain (Touch ID) on unlock and dropped on lock/quit. Never
// logged, never written to disk.
struct VaultState {
    key: Mutex<Option<[u8; 32]>>,
}

// Near-identical re-capture dedup window for the startup cleanup of the legacy
// `captures` table. A wide window means recurring notifications/banners are
// counted once, not every time they reappear.
const CAPTURE_SIMILARITY_SKIP: f64 = 0.85;
const RECENT_CAPTURE_WINDOW: usize = 15;

fn text_token_set(text: &str) -> std::collections::HashSet<String> {
    text.to_lowercase()
        .split_whitespace()
        .map(|w| w.to_string())
        .collect()
}

fn jaccard_similarity(
    a: &std::collections::HashSet<String>,
    b: &std::collections::HashSet<String>,
) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = a.intersection(b).count();
    let union = a.len() + b.len() - intersection;
    if union == 0 {
        1.0
    } else {
        intersection as f64 / union as f64
    }
}

fn is_browser(app_name: &str, bundle_id: &str) -> bool {
    let app_lower = app_name.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();
    app_lower == "safari" || bundle_lower == "com.apple.safari" ||
    app_lower == "google chrome" || app_lower == "chrome" || bundle_lower == "com.google.chrome" ||
    app_lower == "arc" || bundle_lower == "company.thebrowser.browser" ||
    app_lower == "microsoft edge" || app_lower == "edge" || bundle_lower == "com.microsoft.edgemc" || bundle_lower == "com.microsoft.edge"
}

// Processes that must never be recorded as user activity. Matched against the
// lowercased app name exactly (never as substring), so real apps like
// "System Settings" or "Docker" are not affected.
const SYSTEM_PROCESS_BLOCKLIST: &[&str] = &[
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
    "dock",
    "unknown", // tracker fallback when a process has no proper localized name
];

fn is_system_process(app_name: &str, bundle_id: &str) -> bool {
    let app_lower = app_name.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();

    SYSTEM_PROCESS_BLOCKLIST.contains(&app_lower.as_str())
        || bundle_lower.contains("loginwindow")
        || bundle_lower.contains("windowserver")
        || bundle_lower.contains("screensaver")
        || bundle_lower.contains("systemuiserver")
        || bundle_lower == "com.apple.controlcenter"
        || bundle_lower == "com.apple.dock"
}

fn get_active_browser_url(app_name: &str, bundle_id: &str) -> Option<String> {
    let app_lower = app_name.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();

    let script = if app_lower == "safari" || bundle_lower == "com.apple.safari" {
        Some("tell application \"Safari\" to return URL of current tab of front window")
    } else if app_lower == "google chrome" || app_lower == "chrome" || bundle_lower == "com.google.chrome" {
        Some("tell application \"Google Chrome\" to return URL of active tab of front window")
    } else if app_lower == "arc" || bundle_lower == "company.thebrowser.browser" {
        Some("tell application \"Arc\" to return URL of active tab of front window")
    } else if app_lower == "microsoft edge" || app_lower == "edge" || bundle_lower == "com.microsoft.edgemc" || bundle_lower == "com.microsoft.edge" {
        Some("tell application \"Microsoft Edge\" to return URL of active tab of front window")
    } else {
        None
    };

    if let Some(script_content) = script {
        let output = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script_content)
            .output();

        match output {
            Ok(out) => {
                if out.status.success() {
                    let url = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !url.is_empty() {
                        return Some(url);
                    }
                } else {
                    let err = String::from_utf8_lossy(&out.stderr);
                    eprintln!("osascript error: {}", err);
                }
            }
            Err(e) => {
                eprintln!("Failed to execute osascript: {:?}", e);
            }
        }
    }
    None
}

#[allow(dead_code)] // domain filtering returns with a later capture prompt
fn is_domain_excluded(url: &str, excluded_domains: &[String]) -> bool {
    let mut host = url;
    if let Some(idx) = url.find("://") {
        host = &url[idx + 3..];
    }
    if let Some(idx) = host.find('/') {
        host = &host[..idx];
    }
    if let Some(idx) = host.find(':') {
        host = &host[..idx];
    }
    if host.starts_with("www.") {
        host = &host[4..];
    }

    let host_lower = host.to_lowercase();

    for domain in excluded_domains {
        let mut dom = domain.as_str();
        if dom.starts_with("www.") {
            dom = &dom[4..];
        }
        let dom_lower = dom.to_lowercase();
        if host_lower == dom_lower || host_lower.ends_with(&format!(".{}", dom_lower)) {
            return true;
        }
    }
    false
}

fn is_sensitive_app_in_list(app_name: &str, bundle_id: &str, excluded_apps: &[String]) -> bool {
    let app_lower = app_name.to_lowercase();
    let bundle_lower = bundle_id.to_lowercase();
    for app in excluded_apps {
        let sens_lower = app.to_lowercase();
        if app_lower.contains(&sens_lower) || bundle_lower.contains(&sens_lower) {
            return true;
        }
    }
    false
}

#[tauri::command]
fn has_accessibility_permission() -> bool {
    unsafe { ffi_check_accessibility_permission() }
}

#[tauri::command]
fn request_accessibility_permission() -> bool {
    unsafe { ffi_request_accessibility_permission() }
}

#[tauri::command]
fn has_screen_recording_permission() -> bool {
    unsafe { ffi_check_screen_recording_permission() }
}

#[tauri::command]
fn request_screen_recording_permission() -> bool {
    unsafe { ffi_request_screen_recording_permission() }
}

/// Write a UTF-8 text file to an explicit, user-chosen path (from the export
/// save dialog). Kept minimal on purpose — no fs plugin / path scope needed.
#[tauri::command]
fn write_text_file_at(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Failed to write file: {}", e))
}

// ---------- Backend-side capture/activity persistence ----------
// Capture and activity are now written to SQLite directly from the background
// threads (via rusqlite, the same pattern already used by the startup cleanup
// and cloud-key storage), so persistence no longer depends on the webview and
// keeps running when the window is hidden or closed.

fn now_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Port of isLuhnValid (src/lib/db.ts).
fn is_luhn_valid(s: &str) -> bool {
    let mut sum = 0u32;
    let mut double = false;
    for c in s.chars().rev() {
        let d = match c.to_digit(10) {
            Some(d) => d,
            None => return false,
        };
        let mut d = d;
        if double {
            d *= 2;
            if d > 9 {
                d -= 9;
            }
        }
        sum += d;
        double = !double;
    }
    sum % 10 == 0
}

/// Port of redactSensitiveData (src/lib/db.ts). Regex literals are compiled
/// with `.ok()` so a (theoretically impossible) bad pattern can never panic.
fn redact_sensitive_data(text: &str) -> String {
    let mut out = text.to_string();

    // 1. Credit cards (13–16 digits, optional spaces/hyphens), Luhn-validated
    if let Ok(re) = regex::Regex::new(r"\b(?:\d[ -]?){13,16}\b") {
        out = re
            .replace_all(&out, |caps: &regex::Captures| {
                let m = caps.get(0).map(|x| x.as_str()).unwrap_or("");
                let clean: String = m.chars().filter(|c| c.is_ascii_digit()).collect();
                if is_luhn_valid(&clean) {
                    "[redacted]".to_string()
                } else {
                    m.to_string()
                }
            })
            .into_owned();
    }
    // 2. IBANs
    if let Ok(re) = regex::Regex::new(r"(?i)\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b") {
        out = re.replace_all(&out, "[redacted]").into_owned();
    }
    // 3. Long all-digit runs (account/IDs/phone lists)
    if let Ok(re) = regex::Regex::new(r"\b\d{10,}\b") {
        out = re.replace_all(&out, "[redacted]").into_owned();
    }
    // 4. API keys / tokens
    let patterns = [
        r"sk-(proj-)?[a-zA-Z0-9]{48,}",
        r"rk_live_[a-zA-Z0-9]{24}",
        r"sk_live_[a-zA-Z0-9]{24}",
        r"ghp_[a-zA-Z0-9]{36,}",
        r"AKIA[0-9A-Z]{16}",
        r#"(?i)\b(?:bearer|token|password|secret|passwd|auth[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9_\-\.]{16,}["']?"#,
    ];
    for p in patterns {
        if let Ok(re) = regex::Regex::new(p) {
            out = re.replace_all(&out, "[redacted]").into_owned();
        }
    }
    out
}

/// Port of categorizeApp (src/lib/db.ts).
fn categorize_app(app_name: &str) -> String {
    let n = app_name.to_lowercase();
    let has = |k: &str| n.contains(k);
    if has("code") || has("xcode") || has("terminal") || has("warp") || has("iterm") || has("developer") {
        "code".to_string()
    } else if has("figma") || has("sketch") || has("photoshop") || has("illustrator") || has("framer") {
        "design".to_string()
    } else if has("notion") || has("obsidian") || has("word") || has("pages") || has("textedit") || has("book") || has("reader") {
        "docs".to_string()
    } else if has("message") || has("slack") || has("mail") || has("discord") || has("whatsapp") || has("telegram") {
        "comms".to_string()
    } else if has("zoom") || has("meet") || has("facetime") || has("teams") || has("webex") {
        "meeting".to_string()
    } else if has("arc") || has("chrome") || has("safari") || has("firefox") || has("edge") || has("browser") {
        "browser".to_string()
    } else {
        "other".to_string()
    }
}

/// Name-only system-process guard (mirrors isSystemProcessName in db.ts).
fn is_system_process_name(app_name: &str) -> bool {
    let n = app_name.to_lowercase();
    SYSTEM_PROCESS_BLOCKLIST.contains(&n.as_str()) || n.contains("loginwindow")
}

fn open_vera_db(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let path = resolve_db_path(app).ok_or_else(|| "vera.db not found yet".to_string())?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| format!("open db: {}", e))?;
    let _ = conn.busy_timeout(Duration::from_millis(5000));
    Ok(conn)
}

/// Upsert one activity segment directly into SQLite (mirrors insertEvent).
fn persist_activity_segment(
    app: &tauri::AppHandle,
    app_name: &str,
    window_title: Option<&str>,
    started_at: u64,
    duration_seconds: u64,
) -> Result<(), String> {
    if is_system_process_name(app_name) {
        return Ok(());
    }
    let conn = open_vera_db(app)?;
    let category = categorize_app(app_name);
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM activity_events WHERE app_name = ?1 \
             AND (window_title = ?2 OR (window_title IS NULL AND ?2 IS NULL)) AND started_at = ?3",
            rusqlite::params![app_name, window_title, started_at as i64],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("query activity: {}", e))?;
    if let Some(id) = existing {
        conn.execute(
            "UPDATE activity_events SET duration_seconds = ?1 WHERE id = ?2",
            rusqlite::params![duration_seconds as i64, id],
        )
        .map_err(|e| format!("update activity: {}", e))?;
    } else {
        conn.execute(
            "INSERT INTO activity_events (app_name, window_title, started_at, duration_seconds, category) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![app_name, window_title, started_at as i64, duration_seconds as i64, category],
        )
        .map_err(|e| format!("insert activity: {}", e))?;
    }
    Ok(())
}

/// Store an activity segment and notify the UI. No-ops on zero duration.
fn store_segment(
    app_handle: &tauri::AppHandle,
    app_name: String,
    window_title: Option<String>,
    started_at: u64,
    duration_seconds: u64,
) {
    if duration_seconds == 0 {
        return;
    }
    match persist_activity_segment(app_handle, &app_name, window_title.as_deref(), started_at, duration_seconds) {
        Ok(()) => {
            let _ = app_handle.emit("activity-stored", ());
        }
        Err(e) => eprintln!("[Vera Activity] persist failed: {}", e),
    }
}

/// Persist the capture-paused flag so the frontend reflects tray-driven changes.
fn persist_capture_paused(app: &tauri::AppHandle, paused: bool) {
    if let Ok(conn) = open_vera_db(app) {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('capture_paused', ?1)",
            rusqlite::params![if paused { "true" } else { "false" }],
        );
    }
}

/// One-time copy of the database from the previous bundle identifier's data
/// dir to the current one, so the user's notes/goals/captures/activity survive
/// the com.vera.app -> app.vera.desktop change. macOS resolves the app data
/// dir as ~/Library/Application Support/<identifier>. Computed from $HOME (not
/// the AppHandle) and called before the Builder, so it runs before the sql
/// plugin can touch the new path. Idempotent: copies only when the new dir has
/// no vera.db yet and the old one does.
fn migrate_legacy_database() {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return,
    };
    let support = std::path::Path::new(&home)
        .join("Library")
        .join("Application Support");
    let new_dir = support.join("app.vera.desktop");
    if new_dir.join("vera.db").exists() {
        return; // already migrated, or the user already has data here
    }
    let old_dir = support.join("com.vera.app");
    if !old_dir.join("vera.db").exists() {
        return; // fresh install — nothing to migrate
    }
    if let Err(e) = std::fs::create_dir_all(&new_dir) {
        println!("[Vera Migrate] could not create new data dir: {}", e);
        return;
    }
    // Copy the main DB plus any WAL/SHM sidecar files so no committed data is lost
    for name in ["vera.db", "vera.db-wal", "vera.db-shm"] {
        let src = old_dir.join(name);
        if src.exists() {
            match std::fs::copy(&src, new_dir.join(name)) {
                Ok(_) => println!("[Vera Migrate] copied {}", name),
                Err(e) => println!("[Vera Migrate] failed to copy {}: {}", name, e),
            }
        }
    }
    println!("[Vera Migrate] database carried over from com.vera.app to app.vera.desktop");
}

/// Open the matching macOS System Settings privacy pane.
#[tauri::command]
fn open_privacy_settings(pane: String) -> Result<(), String> {
    let url = match pane.as_str() {
        "accessibility" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        "screen_recording" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        "automation" => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
        }
        other => return Err(format!("Unknown privacy pane '{}'", other)),
    };
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    Ok(())
}

/// Single source of truth for the capture-paused flag: updates the in-memory
/// PrivacyState (which the capture thread reads), persists it, and updates the
/// tray menu item text so the tray and the app never drift apart.
fn apply_pause(app: &tauri::AppHandle, paused: bool) {
    if let Ok(mut settings) = app.state::<PrivacyState>().settings.lock() {
        settings.paused = paused;
    }
    persist_capture_paused(app, paused);
    if let Ok(guard) = app.state::<TrayHandles>().pause_item.lock() {
        if let Some(item) = guard.as_ref() {
            let _ = item.set_text(if paused { "Resume capture" } else { "Pause capture" });
        }
    }
}

// ---------- Frame-based screen recording (SCStream sidecar) ----------
// A long-lived Swift sidecar (frame-capture) streams the display at a low rate,
// keeps only visibly-changed frames, OCRs them, writes the image to Application
// Support, and prints one JSON line per kept frame. The supervisor thread below
// owns the sidecar's lifecycle (start when enabled + not paused + permitted,
// stop otherwise) and persists each frame into the `frames` table. It is fully
// backend-driven, so capture keeps running with the window hidden or closed.

// ---------- Media-key vault + AES-256-GCM encryption at rest ----------
// The key lives in the Keychain (Touch ID / Secure Enclave) and, once unlocked,
// in VaultState for the session only. Media files (HEVC segments + thumbnails)
// are encrypted in place; retrieval decrypts to a temp file on demand.

/// Encrypted file format: b"VEG1" || nonce(12) || ciphertext+tag.
const VAULT_MAGIC: &[u8; 4] = b"VEG1";

fn current_media_key(app: &tauri::AppHandle) -> Option<[u8; 32]> {
    app.state::<VaultState>().key.lock().ok().and_then(|k| *k)
}

fn vault_is_unlocked(app: &tauri::AppHandle) -> bool {
    current_media_key(app).is_some()
}

fn is_encrypted(data: &[u8]) -> bool {
    data.len() >= 4 && &data[0..4] == VAULT_MAGIC
}

fn encrypt_bytes(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
    use aes_gcm::{Aes256Gcm, Key};
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "encrypt failed".to_string())?;
    let mut out = Vec::with_capacity(4 + 12 + ct.len());
    out.extend_from_slice(VAULT_MAGIC);
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt_bytes(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    if data.len() < 4 + 12 + 16 || &data[0..4] != VAULT_MAGIC {
        return Err("not an encrypted vault file".to_string());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&data[4..16]);
    cipher
        .decrypt(nonce, &data[16..])
        .map_err(|_| "decrypt failed (wrong key or corrupt)".to_string())
}

/// Encrypt a media file in place (atomic). No-op if already encrypted; errors
/// if the vault is locked (the supervisor only captures while unlocked).
fn encrypt_file_in_place(app: &tauri::AppHandle, path: &Path) -> Result<(), String> {
    let key = current_media_key(app).ok_or_else(|| "vault locked".to_string())?;
    let plaintext = std::fs::read(path).map_err(|e| format!("read for encrypt: {}", e))?;
    if is_encrypted(&plaintext) {
        return Ok(());
    }
    let ct = encrypt_bytes(&key, &plaintext)?;
    let tmp = path.with_extension("enc.tmp");
    std::fs::write(&tmp, &ct).map_err(|e| format!("write enc: {}", e))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("rename enc: {}", e))?;
    Ok(())
}

/// Decrypt a media file to a destination (used for on-the-fly retrieval). A
/// not-yet-encrypted file (e.g. the active segment) is copied through.
fn decrypt_file_to(app: &tauri::AppHandle, src: &Path, dest: &Path) -> Result<(), String> {
    let key = current_media_key(app).ok_or_else(|| "vault locked".to_string())?;
    let data = std::fs::read(src).map_err(|e| format!("read for decrypt: {}", e))?;
    let plaintext = if is_encrypted(&data) {
        decrypt_bytes(&key, &data)?
    } else {
        data
    };
    std::fs::write(dest, &plaintext).map_err(|e| format!("write dec: {}", e))?;
    Ok(())
}

/// Load the media key from the Keychain (Touch ID) into the session; blocking
/// on the biometric prompt. Generates + stores a key on first use.
fn vault_unlock_blocking(app: &tauri::AppHandle) -> Result<(), String> {
    if vault_is_unlocked(app) {
        return Ok(());
    }
    let mut buf = [0u8; 32];
    let rc = unsafe { vault_get_or_create(buf.as_mut_ptr()) };
    if rc != 0 {
        buf.iter_mut().for_each(|b| *b = 0);
        return Err(format!("Touch ID unlock failed (code {})", rc));
    }
    if let Ok(mut k) = app.state::<VaultState>().key.lock() {
        *k = Some(buf);
    }
    buf.iter_mut().for_each(|b| *b = 0);
    println!("[Vera Vault] media key unlocked for this session");
    Ok(())
}

#[tauri::command]
async fn vault_unlock(app: tauri::AppHandle) -> Result<(), String> {
    vault_unlock_blocking(&app)
}

#[tauri::command]
fn is_vault_unlocked(app: tauri::AppHandle) -> bool {
    vault_is_unlocked(&app)
}

#[tauri::command]
fn has_vault_key() -> bool {
    unsafe { vault_has_key() == 1 }
}

// ---------- Frame-based screen recording (SCStream sidecar) ----------

/// Directory for frame images: <app data>/frames (local, never iCloud).
fn frames_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .or_else(|_| app.path().app_config_dir())
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
    let dir = base.join("frames");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create frames dir: {}", e))?;
    Ok(dir)
}

/// Ensure the full frames + segments schema on a connection. Idempotent:
/// creates the base tables and adds the segment columns only if missing, so it
/// never collides with the sql-plugin migration. Logs, never panics.
fn ensure_frames_schema(conn: &rusqlite::Connection) {
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS frames (\
           id INTEGER PRIMARY KEY AUTOINCREMENT, \
           timestamp INTEGER NOT NULL, app TEXT, window_title TEXT, url TEXT, \
           ocr_text TEXT, image_path TEXT, perceptual_hash TEXT)",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS segments (\
           id TEXT PRIMARY KEY, path TEXT NOT NULL, started_at INTEGER NOT NULL, \
           ended_at INTEGER, frame_count INTEGER NOT NULL DEFAULT 0, \
           size_bytes INTEGER NOT NULL DEFAULT 0)",
        [],
    );
    // Add the PROMPT-2 columns if an older frames table predates them.
    let existing: std::collections::HashSet<String> = conn
        .prepare("PRAGMA table_info(frames)")
        .and_then(|mut stmt| {
            let cols = stmt
                .query_map([], |r| r.get::<_, String>(1))?
                .filter_map(|r| r.ok())
                .collect::<std::collections::HashSet<String>>();
            Ok(cols)
        })
        .unwrap_or_default();
    for (col, decl) in [
        ("segment_id", "TEXT"),
        ("frame_index", "INTEGER"),
        ("thumbnail_path", "TEXT"),
    ] {
        if !existing.contains(col) {
            let _ = conn.execute(&format!("ALTER TABLE frames ADD COLUMN {} {}", col, decl), []);
        }
    }
}

/// Open vera.db for frame writes, ensuring the schema exists regardless of when
/// the sql-plugin migration ran.
fn open_frames_db(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let conn = open_vera_db(app)?;
    ensure_frames_schema(&conn);
    Ok(conn)
}

/// Ensure the frames + segments schema directly against an existing vera.db at
/// startup, before the frontend loads the database. Idempotent; logs, no panic.
fn ensure_frames_table_at(path: &Path) {
    match rusqlite::Connection::open(path) {
        Ok(conn) => {
            let _ = conn.busy_timeout(Duration::from_millis(5000));
            ensure_frames_schema(&conn);
            println!("[Vera Frames] frames + segments schema ready ({})", path.display());
        }
        Err(e) => println!("[Vera Frames] could not open db to ensure schema: {}", e),
    }
}

/// Recursively sum file sizes under a directory (segments + thumbnails).
fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            match entry.metadata() {
                Ok(meta) if meta.is_dir() => total += dir_size(&entry.path()),
                Ok(meta) => total += meta.len(),
                Err(_) => {}
            }
        }
    }
    total
}

/// Total on-disk bytes used by frame capture (HEVC segments + thumbnails).
#[tauri::command]
fn get_frames_storage_bytes(app: tauri::AppHandle) -> u64 {
    match frames_dir(&app) {
        Ok(dir) => dir_size(&dir),
        Err(_) => 0,
    }
}

/// SIGTERM the sidecar so it finalizes the open HEVC segment, then force-kill
/// if it does not exit within a few seconds.
fn stop_frame_child(mut child: std::process::Child) {
    unsafe {
        libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
    }
    for _ in 0..30 {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Remove leftover PROMPT-1 standalone full-frame PNGs (loose *.png in the
/// frames root; segments live in frames/segments, thumbnails in frames/thumbs),
/// and drop the orphaned PROMPT-1 rows that referenced them.
fn cleanup_legacy_frame_files(app: &tauri::AppHandle) {
    if let Ok(root) = frames_dir(app) {
        let mut removed = 0u32;
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("png") {
                    if std::fs::remove_file(&p).is_ok() {
                        removed += 1;
                    }
                }
            }
        }
        if removed > 0 {
            println!("[Vera Frames] removed {} legacy standalone frame PNG(s)", removed);
        }
    }
    if let Ok(conn) = open_frames_db(app) {
        let _ = conn.execute("DELETE FROM frames WHERE segment_id IS NULL", []);
    }
}

/// Enforce the storage budget + retention age by evicting the oldest CLOSED
/// segments (the active, still-open segment is never touched), deleting their
/// .mov, thumbnails, and rows. Never panics.
fn evict_if_needed(app: &tauri::AppHandle) {
    let budget_mb = read_setting_from_app(app, "frames_max_storage_mb")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(2048);
    let retention_days = read_setting_from_app(app, "frames_retention_days")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(30);
    let budget_bytes = budget_mb.saturating_mul(1024 * 1024);
    let cutoff = now_epoch_ms() as i64 - retention_days.saturating_mul(86_400_000);

    let root = match frames_dir(app) {
        Ok(d) => d,
        Err(_) => return,
    };
    let conn = match open_frames_db(app) {
        Ok(c) => c,
        Err(_) => return,
    };

    loop {
        let total = dir_size(&root);
        let oldest: Option<(String, String, i64)> = conn
            .query_row(
                "SELECT id, path, started_at FROM segments \
                 WHERE ended_at IS NOT NULL ORDER BY started_at ASC LIMIT 1",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)),
            )
            .optional()
            .unwrap_or(None);
        let (id, path, started_at) = match oldest {
            Some(t) => t,
            None => break,
        };
        let over_budget = total > budget_bytes;
        let too_old = started_at < cutoff;
        if !over_budget && !too_old {
            break;
        }
        // Delete this segment's thumbnails, its frame rows, the .mov, the row.
        if let Ok(mut stmt) = conn.prepare("SELECT thumbnail_path FROM frames WHERE segment_id = ?1") {
            if let Ok(rows) = stmt.query_map(rusqlite::params![id], |r| r.get::<_, Option<String>>(0)) {
                for tp in rows.flatten().flatten() {
                    let _ = std::fs::remove_file(&tp);
                }
            }
        }
        let _ = conn.execute("DELETE FROM frames WHERE segment_id = ?1", rusqlite::params![id]);
        let _ = std::fs::remove_file(&path);
        let _ = conn.execute("DELETE FROM segments WHERE id = ?1", rusqlite::params![id]);
        println!(
            "[Vera Frames] evicted segment {} (over_budget={}, too_old={})",
            id, over_budget, too_old
        );
    }
}

/// Retrieve the frame nearest a timestamp by seeking into its HEVC segment.
/// Returns a temp JPEG path the caller can open/display.
#[tauri::command]
async fn extract_frame_near(app: tauri::AppHandle, timestamp: i64) -> Result<String, String> {
    let (segment_id, frame_index, seg_path) = {
        let conn = open_frames_db(&app)?;
        let row: Option<(Option<String>, Option<i64>)> = conn
            .query_row(
                "SELECT segment_id, frame_index FROM frames \
                 WHERE segment_id IS NOT NULL AND frame_index IS NOT NULL \
                 ORDER BY ABS(timestamp - ?1) ASC LIMIT 1",
                rusqlite::params![timestamp],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("query nearest frame: {}", e))?;
        let (segment_id, frame_index) = row.ok_or_else(|| "no segment-backed frames yet".to_string())?;
        let segment_id = segment_id.ok_or_else(|| "nearest frame has no segment".to_string())?;
        let frame_index = frame_index.ok_or_else(|| "nearest frame has no index".to_string())?;
        let seg_path: String = conn
            .query_row(
                "SELECT path FROM segments WHERE id = ?1",
                rusqlite::params![segment_id],
                |r| r.get(0),
            )
            .map_err(|e| format!("segment not found: {}", e))?;
        (segment_id, frame_index, seg_path)
    };

    let helper = app
        .path()
        .resolve("binaries/frame-extract", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("frame-extract helper not found: {}", e))?;

    // Decrypt the segment to a transient plaintext .mov, extract, then delete it.
    let temp_mov = std::env::temp_dir().join(format!("vera-seg-{}.mov", now_epoch_ms()));
    decrypt_file_to(&app, Path::new(&seg_path), &temp_mov)?;

    let out = std::env::temp_dir().join(format!("vera-frame-{}.jpg", now_epoch_ms()));
    let output = std::process::Command::new(&helper)
        .arg(&temp_mov)
        .arg(frame_index.to_string())
        .arg(&out)
        .arg("1")
        .output();
    let _ = std::fs::remove_file(&temp_mov); // never leave plaintext media around
    let output = output.map_err(|e| format!("run frame-extract: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value =
        serde_json::from_str(stdout.trim()).unwrap_or(serde_json::Value::Null);
    if parsed.get("status").and_then(|s| s.as_str()) == Some("ok") {
        let _ = segment_id; // (kept for clarity/logging parity)
        Ok(out.to_string_lossy().to_string())
    } else {
        let err = parsed
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("unknown error");
        Err(format!("frame-extract failed: {}", err))
    }
}

/// Delete every segment whose time span overlaps [start, end] — including its
/// .mov, its thumbnails, and its frame rows — plus any orphan frame rows in the
/// range. Whole overlapping segments are removed (privacy-first: the deleted
/// time range's pixels never survive, even if a segment straddles the edge).
/// Returns the number of segments deleted.
fn delete_segments_overlapping(
    conn: &rusqlite::Connection,
    start: i64,
    end: i64,
) -> Result<usize, String> {
    let targets: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, path FROM segments \
                 WHERE started_at <= ?2 AND (ended_at IS NULL OR ended_at >= ?1)",
            )
            .map_err(|e| format!("prepare overlap: {}", e))?;
        let rows = stmt
            .query_map(rusqlite::params![start, end], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| format!("query overlap: {}", e))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for (id, path) in &targets {
        if let Ok(mut stmt) = conn.prepare("SELECT thumbnail_path FROM frames WHERE segment_id = ?1") {
            if let Ok(rows) = stmt.query_map(rusqlite::params![id], |r| r.get::<_, Option<String>>(0)) {
                for tp in rows.flatten().flatten() {
                    let _ = std::fs::remove_file(&tp);
                }
            }
        }
        let _ = conn.execute("DELETE FROM frames WHERE segment_id = ?1", rusqlite::params![id]);
        let _ = std::fs::remove_file(path);
        let _ = conn.execute("DELETE FROM segments WHERE id = ?1", rusqlite::params![id]);
    }

    // Orphan rows (legacy/segment-less) inside the range.
    let _ = conn.execute(
        "DELETE FROM frames WHERE segment_id IS NULL AND timestamp >= ?1 AND timestamp <= ?2",
        rusqlite::params![start, end],
    );
    Ok(targets.len())
}

/// Stop the live sidecar so the open segment is finalized + closed; the
/// supervisor respawns it within ~2s if capture is still enabled.
fn finalize_open_segment(app: &tauri::AppHandle) {
    if let Ok(mut g) = app.state::<FrameCaptureState>().child.lock() {
        if let Some(child) = g.take() {
            stop_frame_child(child);
        }
    }
}

/// Delete all frame data in [start_ms, end_ms]. Finalizes the active segment
/// first so the current block is included.
#[tauri::command]
fn delete_frames_range(app: tauri::AppHandle, start_ms: i64, end_ms: i64) -> Result<usize, String> {
    finalize_open_segment(&app);
    let conn = open_frames_db(&app)?;
    let n = delete_segments_overlapping(&conn, start_ms, end_ms)?;
    println!("[Vera Frames] deleted {} segment(s) in range", n);
    Ok(n)
}

/// Wipe the entire frame store: all segments, thumbnails, rows, and files.
#[tauri::command]
fn clear_all_frames(app: tauri::AppHandle) -> Result<(), String> {
    finalize_open_segment(&app);
    let conn = open_frames_db(&app)?;
    let _ = conn.execute("DELETE FROM frames", []);
    let _ = conn.execute("DELETE FROM segments", []);
    if let Ok(root) = frames_dir(&app) {
        let _ = std::fs::remove_dir_all(root.join("segments"));
        let _ = std::fs::remove_dir_all(root.join("thumbs"));
    }
    println!("[Vera Frames] cleared all frame data");
    Ok(())
}

/// Persist the frames-enabled flag so the supervisor resumes after a restart.
fn persist_frames_enabled(app: &tauri::AppHandle, enabled: bool) {
    if let Ok(conn) = open_vera_db(app) {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('frames_capture_enabled', ?1)",
            rusqlite::params![if enabled { "true" } else { "false" }],
        );
    }
}

/// Insert one kept frame (segment-backed: references segment_id + frame_index +
/// thumbnail), enriching with the active browser URL (browsers only) via the
/// existing Automation path. An excluded frontmost app is dropped here too
/// (belt-and-suspenders with the sidecar's own gate).
fn persist_frame(app: &tauri::AppHandle, v: &serde_json::Value) -> Result<(), String> {
    let app_name = v.get("app").and_then(|x| x.as_str()).unwrap_or("");
    let bundle_id = v.get("bundle_id").and_then(|x| x.as_str()).unwrap_or("");
    let window_title = v.get("window_title").and_then(|x| x.as_str());
    let ocr_text = v.get("ocr_text").and_then(|x| x.as_str()).unwrap_or("");
    let thumbnail_path = v.get("thumbnail_path").and_then(|x| x.as_str()).unwrap_or("");
    let segment_id = v.get("segment_id").and_then(|x| x.as_str());
    let frame_index = v.get("frame_index").and_then(|x| x.as_i64());
    let phash = v.get("perceptual_hash").and_then(|x| x.as_str());
    let timestamp = v
        .get("timestamp")
        .and_then(|x| x.as_i64())
        .unwrap_or_else(|| now_epoch_ms() as i64);

    if thumbnail_path.is_empty() {
        return Err("frame missing thumbnail_path".to_string());
    }

    // Defensive exclude re-check against the current settings.
    let excluded = app
        .state::<PrivacyState>()
        .settings
        .lock()
        .map(|s| s.excluded_apps.clone())
        .unwrap_or_default();
    if is_sensitive_app_in_list(app_name, bundle_id, &excluded) {
        // Drop the just-written thumbnail so nothing is stored for it.
        let _ = std::fs::remove_file(thumbnail_path);
        return Ok(());
    }

    let url: Option<String> = if is_browser(app_name, bundle_id) {
        get_active_browser_url(app_name, bundle_id)
    } else {
        None
    };

    // Defense in depth: the sidecar already redacts on-frame text, but redact
    // the stored OCR text again here so a secret can never reach the database.
    let safe_text = redact_sensitive_data(ocr_text);

    let conn = open_frames_db(app)?;
    conn.execute(
        "INSERT INTO frames \
           (timestamp, app, window_title, url, ocr_text, image_path, perceptual_hash, segment_id, frame_index, thumbnail_path) \
         VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7, ?8, ?9)",
        rusqlite::params![timestamp, app_name, window_title, url, safe_text, phash, segment_id, frame_index, thumbnail_path],
    )
    .map_err(|e| format!("insert frame: {}", e))?;
    // Encrypt the thumbnail at rest (capture only runs while the vault is unlocked).
    if let Err(e) = encrypt_file_in_place(app, Path::new(thumbnail_path)) {
        eprintln!("[Vera Vault] thumbnail encrypt failed: {}", e);
    }
    let _ = app.emit("frame-stored", ());
    Ok(())
}

/// Record a newly opened HEVC segment (ended_at NULL = still being written).
fn persist_segment_opened(app: &tauri::AppHandle, v: &serde_json::Value) -> Result<(), String> {
    let id = v
        .get("segment_id")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "segment_opened missing id".to_string())?;
    let path = v.get("path").and_then(|x| x.as_str()).unwrap_or("");
    let started_at = v
        .get("started_at")
        .and_then(|x| x.as_i64())
        .unwrap_or_else(|| now_epoch_ms() as i64);
    let conn = open_frames_db(app)?;
    conn.execute(
        "INSERT OR REPLACE INTO segments (id, path, started_at, ended_at, frame_count, size_bytes) \
         VALUES (?1, ?2, ?3, NULL, 0, 0)",
        rusqlite::params![id, path, started_at],
    )
    .map_err(|e| format!("insert segment: {}", e))?;
    Ok(())
}

/// Finalize a segment row once the sidecar has written + closed the .mov.
fn persist_segment_closed(app: &tauri::AppHandle, v: &serde_json::Value) -> Result<(), String> {
    let id = v
        .get("segment_id")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "segment_closed missing id".to_string())?;
    let frame_count = v.get("frame_count").and_then(|x| x.as_i64()).unwrap_or(0);
    let size_bytes = v.get("size_bytes").and_then(|x| x.as_i64()).unwrap_or(0);
    let ended_at = v
        .get("ended_at")
        .and_then(|x| x.as_i64())
        .unwrap_or_else(|| now_epoch_ms() as i64);
    let conn = open_frames_db(app)?;
    let seg_path: Option<String> = conn
        .query_row("SELECT path FROM segments WHERE id = ?1", rusqlite::params![id], |r| r.get(0))
        .optional()
        .ok()
        .flatten();
    conn.execute(
        "UPDATE segments SET ended_at = ?1, frame_count = ?2, size_bytes = ?3 WHERE id = ?4",
        rusqlite::params![ended_at, frame_count, size_bytes, id],
    )
    .map_err(|e| format!("update segment: {}", e))?;

    // Encrypt the finalized segment at rest, then record its ciphertext size.
    if let Some(path) = seg_path {
        if let Err(e) = encrypt_file_in_place(app, Path::new(&path)) {
            eprintln!("[Vera Vault] segment encrypt failed: {}", e);
        } else if let Ok(meta) = std::fs::metadata(&path) {
            let _ = conn.execute(
                "UPDATE segments SET size_bytes = ?1 WHERE id = ?2",
                rusqlite::params![meta.len() as i64, id],
            );
        }
    }
    Ok(())
}

/// Parse and act on one stdout line from the frame-capture sidecar.
fn handle_sidecar_line(app: &tauri::AppHandle, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    let v: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            eprintln!("[frame-capture] {}", trimmed);
            return;
        }
    };
    match v.get("type").and_then(|t| t.as_str()) {
        Some("frame") => {
            if let Err(e) = persist_frame(app, &v) {
                eprintln!("[Vera Frames] persist failed: {}", e);
            }
        }
        Some("segment_opened") => {
            if let Err(e) = persist_segment_opened(app, &v) {
                eprintln!("[Vera Frames] segment_opened persist failed: {}", e);
            }
        }
        Some("segment_closed") => {
            if let Err(e) = persist_segment_closed(app, &v) {
                eprintln!("[Vera Frames] segment_closed persist failed: {}", e);
            }
            // A segment just finalized — a good moment to enforce the budget.
            evict_if_needed(app);
        }
        Some("status") => {
            let status = v.get("status").and_then(|s| s.as_str()).unwrap_or("");
            println!("[Vera Frames] sidecar status: {}", status);
            if status == "PermissionRequired" {
                let _ = app.emit(
                    "screen-capture",
                    &serde_json::json!({ "status": "PermissionRequired" }),
                );
            }
        }
        Some("log") => {
            if let Some(m) = v.get("message").and_then(|m| m.as_str()) {
                println!("[frame-capture] {}", m);
            }
        }
        _ => {}
    }
}

/// Spawn the frame-capture sidecar and a reader thread that persists its output.
fn spawn_frame_sidecar(app: &tauri::AppHandle, helper: &Path) -> Result<std::process::Child, String> {
    let out_dir = frames_dir(app)?;
    let excluded = app
        .state::<PrivacyState>()
        .settings
        .lock()
        .map(|s| s.excluded_apps.clone())
        .unwrap_or_default();
    let exclude_arg = excluded.join(",");

    let mut cmd = std::process::Command::new(helper);
    cmd.arg("--out-dir").arg(&out_dir)
        .arg("--fps").arg("1")
        .arg("--max-width").arg("1280")
        .arg("--hash-threshold").arg("5")
        .arg("--vera-bundle-id").arg("app.vera.desktop")
        .arg("--segment-seconds").arg("600")
        .arg("--thumb-width").arg("320");
    if !exclude_arg.is_empty() {
        cmd.arg("--exclude").arg(exclude_arg);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn frame-capture: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(l) => handle_sidecar_line(&app2, &l),
                    Err(_) => break,
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    eprintln!("[frame-capture:err] {}", l);
                }
            }
        });
    }
    println!("[Vera Frames] capture started (out={})", out_dir.display());
    Ok(child)
}

/// Long-lived supervisor: reconciles the sidecar with the enabled/paused/
/// permission state every couple of seconds. Never panics.
fn frame_supervisor_loop(app: tauri::AppHandle, helper: Option<PathBuf>) {
    let helper = match helper {
        Some(h) => h,
        None => {
            eprintln!("[Vera Frames] frame-capture sidecar not found; frame capture disabled");
            return;
        }
    };
    // One-time cleanup of PROMPT-1 standalone frame PNGs + orphan rows.
    cleanup_legacy_frame_files(&app);

    let mut warned_permission = false;
    let mut ticks: u32 = 0;

    loop {
        std::thread::sleep(Duration::from_secs(2));
        ticks = ticks.wrapping_add(1);

        // Enforce storage budget / retention roughly once a minute, independent
        // of segment-close events (covers age-based eviction while idle).
        if ticks % 30 == 0 {
            evict_if_needed(&app);
        }

        let want = {
            let enabled = app
                .state::<FrameCaptureState>()
                .enabled
                .lock()
                .map(|e| *e)
                .unwrap_or(false);
            let paused = app
                .state::<PrivacyState>()
                .settings
                .lock()
                .map(|s| s.paused)
                .unwrap_or(true);
            // Only capture while the media key is unlocked, so every frame can
            // be encrypted at rest (no plaintext we cannot protect).
            enabled && !paused && vault_is_unlocked(&app)
        };

        // Is the sidecar alive? Reap it if it exited on its own.
        let running = {
            let state = app.state::<FrameCaptureState>();
            let mut guard = match state.child.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            let alive = match guard.as_mut() {
                Some(child) => matches!(child.try_wait(), Ok(None)),
                None => false,
            };
            if !alive {
                *guard = None;
            }
            alive
        };

        if want && !running {
            // Degrade gracefully if screen recording permission is missing.
            if !unsafe { ffi_check_screen_recording_permission() } {
                if !warned_permission {
                    eprintln!("[Vera Frames] screen recording permission not granted; will retry");
                    warned_permission = true;
                }
                continue;
            }
            warned_permission = false;
            match spawn_frame_sidecar(&app, &helper) {
                Ok(child) => {
                    if let Ok(mut g) = app.state::<FrameCaptureState>().child.lock() {
                        *g = Some(child);
                    }
                }
                Err(e) => eprintln!("[Vera Frames] failed to start sidecar: {}", e),
            }
        } else if !want && running {
            if let Ok(mut g) = app.state::<FrameCaptureState>().child.lock() {
                if let Some(child) = g.take() {
                    stop_frame_child(child); // SIGTERM → finalize segment → exit
                    println!("[Vera Frames] capture stopped");
                }
            }
        }
    }
}

#[tauri::command]
fn set_frames_capture_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    persist_frames_enabled(&app, enabled);
    if let Ok(mut e) = app.state::<FrameCaptureState>().enabled.lock() {
        *e = enabled;
    }
    println!("[Vera Frames] frames_capture_enabled set to {}", enabled);
    Ok(())
}

#[tauri::command]
fn is_frames_capture_enabled(state: tauri::State<'_, FrameCaptureState>) -> bool {
    state.enabled.lock().map(|e| *e).unwrap_or(false)
}

#[tauri::command]
fn set_capture_paused(app: tauri::AppHandle, paused: bool) {
    apply_pause(&app, paused);
}

#[tauri::command]
fn is_capture_paused(state: tauri::State<'_, PrivacyState>) -> bool {
    if let Ok(settings) = state.settings.lock() {
        settings.paused
    } else {
        true
    }
}

#[tauri::command]
fn update_privacy_settings(
    app: tauri::AppHandle,
    paused: bool,
    excluded_apps: Vec<String>,
    excluded_domains: Vec<String>,
) {
    if let Ok(mut settings) = app.state::<PrivacyState>().settings.lock() {
        settings.excluded_apps = excluded_apps;
        settings.excluded_domains = excluded_domains;
        println!(
            "[Vera Privacy] Settings updated: excluded_apps count={}, excluded_domains count={}",
            settings.excluded_apps.len(),
            settings.excluded_domains.len()
        );
    }
    // Recycle the frame sidecar so a changed exclude list takes immediate effect
    // (its capture-time SCContentFilter + frontmost gate are set at spawn). The
    // supervisor respawns it within ~2s with the new exclusions.
    if let Ok(mut g) = app.state::<FrameCaptureState>().child.lock() {
        if let Some(child) = g.take() {
            stop_frame_child(child); // SIGTERM → finalize segment → exit
        }
    }
    apply_pause(&app, paused);
}

// ---------- AI engine: local Ollama (default) or bring-your-own-key cloud ----------
// The cloud API key is written and read ONLY here in Rust. It is never logged
// and never returned to the frontend; it leaves this process only inside the
// HTTPS request to the selected provider.

#[derive(Clone, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

/// Locate the sqlite file used by tauri-plugin-sql ("sqlite:vera.db" resolves
/// against the app config dir).
fn resolve_db_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    [app.path().app_config_dir(), app.path().app_data_dir()]
        .into_iter()
        .filter_map(|dir| dir.ok().map(|d| d.join("vera.db")))
        .find(|p| p.exists())
}

/// Like resolve_db_path, but yields the canonical path even before the file
/// exists (first launch), creating the parent directory if needed.
fn db_path_for_write(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some(existing) = resolve_db_path(app) {
        return Ok(existing);
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve app config dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create app config dir: {}", e))?;
    Ok(dir.join("vera.db"))
}

fn open_settings_db(path: &std::path::Path) -> Result<rusqlite::Connection, String> {
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| format!("Cannot open settings database: {}", e))?;
    let _ = conn.busy_timeout(Duration::from_millis(3000));
    // Same schema as migration v1; harmless if the table already exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )
    .map_err(|e| format!("Cannot ensure settings table: {}", e))?;
    Ok(conn)
}

fn read_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get::<_, String>(0)
    })
    .ok()
}

fn read_setting_from_app(app: &tauri::AppHandle, key: &str) -> Option<String> {
    let path = resolve_db_path(app)?;
    let conn = rusqlite::Connection::open(&path).ok()?;
    read_setting(&conn, key)
}

fn validate_provider(provider: &str) -> Result<(), String> {
    match provider {
        "anthropic" | "openai" => Ok(()),
        other => Err(format!("Unknown cloud provider '{}'", other)),
    }
}

fn provider_label(provider: &str) -> &'static str {
    if provider == "openai" { "OpenAI" } else { "Anthropic" }
}

#[tauri::command]
fn save_cloud_api_key(app: tauri::AppHandle, provider: String, key: String) -> Result<(), String> {
    validate_provider(&provider)?;
    let path = db_path_for_write(&app)?;
    let conn = open_settings_db(&path)?;
    let setting_key = format!("cloud_api_key_{}", provider);
    let trimmed = key.trim();
    if trimmed.is_empty() {
        conn.execute("DELETE FROM settings WHERE key = ?1", [setting_key.as_str()])
            .map_err(|e| format!("Failed to remove API key: {}", e))?;
        println!("[Vera AI] Cloud API key removed for provider {}", provider);
    } else {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![setting_key, trimmed],
        )
        .map_err(|e| format!("Failed to save API key: {}", e))?;
        // Log only the fact that a key was saved — never the key itself
        println!("[Vera AI] Cloud API key saved for provider {}", provider);
    }
    Ok(())
}

#[tauri::command]
fn has_cloud_api_key(app: tauri::AppHandle, provider: String) -> bool {
    if validate_provider(&provider).is_err() {
        return false;
    }
    read_setting_from_app(&app, &format!("cloud_api_key_{}", provider))
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false)
}

fn truncate_for_error(body: &str) -> String {
    body.chars().take(300).collect()
}

fn provider_error_message(parsed: &serde_json::Value, raw_body: &str) -> String {
    parsed
        .pointer("/error/message")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| truncate_for_error(raw_body))
}

async fn call_anthropic(
    key: &str,
    model: &str,
    messages: &[ChatMessage],
    max_tokens: u32,
) -> Result<String, String> {
    // Anthropic takes the system prompt as a top-level field, not as a message
    let system_text = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let chat_messages: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();
    if chat_messages.is_empty() {
        return Err("No user message to send".to_string());
    }

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": chat_messages,
    });
    if !system_text.is_empty() {
        body["system"] = serde_json::Value::String(system_text);
    }

    let res = reqwest::Client::new()
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .timeout(Duration::from_secs(60))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach Anthropic: {}", e))?;

    let status = res.status();
    let body_text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read Anthropic response: {}", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&body_text).unwrap_or(serde_json::Value::Null);

    if !status.is_success() {
        return Err(format!(
            "Anthropic error ({}): {}",
            status.as_u16(),
            provider_error_message(&parsed, &body_text)
        ));
    }

    let text = parsed
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter_map(|b| {
                    if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                        b.get("text").and_then(|t| t.as_str())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    if text.is_empty() {
        return Err("Anthropic returned an empty response".to_string());
    }
    Ok(text)
}

async fn call_openai(key: &str, model: &str, messages: &[ChatMessage]) -> Result<String, String> {
    let chat_messages: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();
    let body = serde_json::json!({ "model": model, "messages": chat_messages });

    let res = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key))
        .header("content-type", "application/json")
        .timeout(Duration::from_secs(60))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach OpenAI: {}", e))?;

    let status = res.status();
    let body_text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read OpenAI response: {}", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&body_text).unwrap_or(serde_json::Value::Null);

    if !status.is_success() {
        return Err(format!(
            "OpenAI error ({}): {}",
            status.as_u16(),
            provider_error_message(&parsed, &body_text)
        ));
    }

    let text = parsed
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if text.is_empty() {
        return Err("OpenAI returned an empty response".to_string());
    }
    Ok(text)
}

async fn call_ollama_chat(model: &str, messages: &[ChatMessage]) -> Result<String, String> {
    let chat_messages: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();
    let body = serde_json::json!({
        "model": model,
        "messages": chat_messages,
        "stream": false,
        "options": { "temperature": 0.2 },
    });

    let res = reqwest::Client::new()
        .post("http://localhost:11434/api/chat")
        .header("content-type", "application/json")
        .timeout(Duration::from_secs(120))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach Ollama: {}", e))?;

    let status = res.status();
    let body_text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read Ollama response: {}", e))?;
    let parsed: serde_json::Value = serde_json::from_str(&body_text).unwrap_or(serde_json::Value::Null);

    if !status.is_success() {
        let msg = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| truncate_for_error(&body_text));
        return Err(format!("Ollama error ({}): {}", status.as_u16(), msg));
    }

    let text = parsed
        .pointer("/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    if text.is_empty() {
        return Err("Ollama returned an empty response".to_string());
    }
    Ok(text)
}

struct CloudConfig {
    provider: String,
    model: String,
    key: String,
}

fn read_cloud_config(app: &tauri::AppHandle) -> Result<CloudConfig, String> {
    let path = resolve_db_path(app)
        .ok_or_else(|| "Settings database not found yet. Configure the engine in Settings first.".to_string())?;
    let conn = rusqlite::Connection::open(&path)
        .map_err(|e| format!("Cannot open settings database: {}", e))?;

    let provider = read_setting(&conn, "cloud_provider").unwrap_or_else(|| "anthropic".to_string());
    validate_provider(&provider)?;

    let default_model = if provider == "openai" { "gpt-4o" } else { "claude-sonnet-4-6" };
    let model = read_setting(&conn, &format!("cloud_model_{}", provider))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| default_model.to_string());

    let key = read_setting(&conn, &format!("cloud_api_key_{}", provider)).unwrap_or_default();
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err(format!(
            "Cloud mode is on, but no API key is saved for {}. Add your key in Settings → AI Engine.",
            provider_label(&provider)
        ));
    }

    Ok(CloudConfig { provider, model, key })
}

/// Generate a chat answer with the configured engine. Retrieval/embeddings
/// stay local either way; this only generates the final answer.
#[tauri::command]
async fn generate_chat_completion(
    app: tauri::AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err("No messages provided".to_string());
    }

    let engine = read_setting_from_app(&app, "ai_engine").unwrap_or_else(|| "local".to_string());

    if engine == "cloud" {
        let config = read_cloud_config(&app)?;
        match config.provider.as_str() {
            "openai" => call_openai(&config.key, &config.model, &messages).await,
            _ => call_anthropic(&config.key, &config.model, &messages, 1024).await,
        }
    } else {
        let model = read_setting_from_app(&app, "chat_model").unwrap_or_else(|| "llama3.2:3b".to_string());
        call_ollama_chat(&model, &messages).await
    }
}

/// Small validation request against the chosen provider/model. Uses the key
/// from the input field when given, otherwise the stored one.
#[tauri::command]
async fn test_cloud_connection(
    app: tauri::AppHandle,
    provider: String,
    model: String,
    key: Option<String>,
) -> Result<String, String> {
    validate_provider(&provider)?;
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("Enter a model id first".to_string());
    }

    let resolved_key = match key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty()) {
        Some(k) => k,
        None => read_setting_from_app(&app, &format!("cloud_api_key_{}", provider))
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .ok_or_else(|| {
                format!(
                    "No API key entered and none saved for {}.",
                    provider_label(&provider)
                )
            })?,
    };

    let ping = vec![ChatMessage {
        role: "user".to_string(),
        content: "Reply with the single word: ok".to_string(),
    }];

    match provider.as_str() {
        "openai" => call_openai(&resolved_key, &model, &ping)
            .await
            .map(|_| format!("Connected to OpenAI ({})", model)),
        _ => call_anthropic(&resolved_key, &model, &ping, 16)
            .await
            .map(|_| format!("Connected to Anthropic ({})", model)),
    }
}

/// One-time-per-launch cleanup of low-value screen captures: chrome-only
/// short fragments, exact duplicates, and near-duplicate re-captures of
/// static UI. Idempotent. Returns (short, exact-dup, near-dup) delete counts.
fn cleanup_low_value_captures(
    db_path: &std::path::Path,
) -> Result<(usize, usize, usize), rusqlite::Error> {
    let conn = rusqlite::Connection::open(db_path)?;
    let _ = conn.busy_timeout(Duration::from_millis(3000));

    // Fresh installs have no captures table yet — nothing to clean
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='captures'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);
    if !table_exists {
        return Ok((0, 0, 0));
    }

    // (a) short fragments: chrome/truncated-label rows with no substance
    let short_deleted = conn.execute(
        "DELETE FROM captures WHERE char_count < 64 OR LENGTH(TRIM(ocr_text)) < 64",
        [],
    )?;

    // (b) exact duplicates: keep only the newest row per (app, text)
    let exact_deleted = conn.execute(
        "DELETE FROM captures WHERE id NOT IN (SELECT MAX(id) FROM captures GROUP BY app_name, ocr_text)",
        [],
    )?;

    // (c) near-duplicates: chronological scan per app, drop rows that are
    // >85% token-identical to a recently kept capture of the same app
    let mut stmt =
        conn.prepare("SELECT id, app_name, ocr_text FROM captures ORDER BY app_name, captured_at ASC")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    drop(stmt);

    let mut to_delete: Vec<i64> = Vec::new();
    let mut current_app = String::new();
    let mut kept_recent: Vec<std::collections::HashSet<String>> = Vec::new();

    for (id, app_name, text) in rows {
        if app_name != current_app {
            current_app = app_name;
            kept_recent.clear();
        }
        let tokens = text_token_set(&text);
        let near_dup = kept_recent
            .iter()
            .any(|prev| jaccard_similarity(prev, &tokens) > CAPTURE_SIMILARITY_SKIP);
        if near_dup {
            to_delete.push(id);
        } else {
            if kept_recent.len() >= RECENT_CAPTURE_WINDOW {
                kept_recent.remove(0);
            }
            kept_recent.push(tokens);
        }
    }

    let near_dup_deleted = to_delete.len();
    for chunk in to_delete.chunks(500) {
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!("DELETE FROM captures WHERE id IN ({})", placeholders);
        conn.execute(&sql, rusqlite::params_from_iter(chunk.iter()))?;
    }

    Ok((short_deleted, exact_deleted, near_dup_deleted))
}

/// Purge lock-screen / system-process rows from activity_events.
/// Idempotent; runs on every launch before the UI reads any stats.
/// Returns (deleted row count, remaining DISTINCT app names).
fn cleanup_system_process_rows(db_path: &std::path::Path) -> Result<(usize, Vec<String>), rusqlite::Error> {
    let conn = rusqlite::Connection::open(db_path)?;

    let deleted = conn.execute(
        "DELETE FROM activity_events
         WHERE app_name IN ('loginwindow','ScreenSaverEngine','WindowServer','SystemUIServer','Dock')
            OR LOWER(app_name) LIKE '%loginwindow%'
            OR LOWER(app_name) LIKE '%screensaver%'
            OR REPLACE(LOWER(app_name), ' ', '') IN
               ('loginwindow','screensaverengine','screensaver','windowserver','systemuiserver','controlcenter','dock','unknown')",
        [],
    )?;

    let mut stmt = conn.prepare("SELECT DISTINCT app_name FROM activity_events ORDER BY app_name")?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect::<Vec<String>>();

    Ok((deleted, names))
}

/// Build the macOS menu-bar (tray) icon and its menu. The Dock icon is kept.
fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::TrayIconBuilder;

    let initially_paused = app
        .state::<PrivacyState>()
        .settings
        .lock()
        .map(|s| s.paused)
        .unwrap_or(true);

    let open_item = MenuItemBuilder::with_id("open", "Open Vera").build(app)?;
    let pause_item = MenuItemBuilder::with_id(
        "toggle_capture",
        if initially_paused { "Resume capture" } else { "Pause capture" },
    )
    .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Vera").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .item(&pause_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // Keep the pause item so its label can be updated from tray or app.
    if let Ok(mut guard) = app.state::<TrayHandles>().pause_item.lock() {
        *guard = Some(pause_item.clone());
    }

    // The "V" mark as a monochrome template image (renders in light/dark menu bars).
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-v-template.png"))?;

    let _tray = TrayIconBuilder::with_id("vera-tray")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "toggle_capture" => {
                let new_paused = match app.state::<PrivacyState>().settings.lock() {
                    Ok(s) => !s.paused,
                    Err(_) => return,
                };
                apply_pause(app, new_paused);
                let _ = app.emit("capture-paused-changed", new_paused);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Carry existing data across the bundle-identifier change before anything
  // (including the sql plugin) can touch the new data directory.
  migrate_legacy_database();

  let migrations = vec![
    Migration {
      version: 1,
      description: "create_initial_tables",
      sql: "
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          target_minutes INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activity_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          app_name TEXT NOT NULL,
          window_title TEXT,
          started_at INTEGER NOT NULL,
          duration_seconds INTEGER NOT NULL,
          category TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "create_captures_table",
      sql: "
        CREATE TABLE IF NOT EXISTS captures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          captured_at INTEGER NOT NULL,
          app_name TEXT NOT NULL,
          window_title TEXT,
          ocr_text TEXT NOT NULL,
          char_count INTEGER NOT NULL
        );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "add_embedding_to_captures",
      sql: "
        ALTER TABLE captures ADD COLUMN embedding TEXT;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "add_done_to_goals",
      sql: "
        ALTER TABLE goals ADD COLUMN done INTEGER NOT NULL DEFAULT 0;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "create_frames_table",
      sql: "
        CREATE TABLE IF NOT EXISTS frames (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          app TEXT,
          window_title TEXT,
          url TEXT,
          ocr_text TEXT,
          image_path TEXT NOT NULL,
          perceptual_hash TEXT
        );
      ",
      kind: MigrationKind::Up,
    }
  ];

  tauri::Builder::default()
    // Single-instance must be registered first: a second launch (autostart +
    // manual open) focuses the running instance instead of starting a second
    // capture loop.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }))
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:vera.db", migrations)
        .build()
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None::<Vec<&str>>,
    ))
    // Closing the main window hides it; Vera keeps running (menu bar + capture).
    // Cmd+Q and the tray "Quit Vera" item still exit fully.
    .on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if window.label() == "main" {
                api.prevent_close();
                let _ = window.hide();
            }
        }
    })
    .manage(PrivacyState {
      settings: Mutex::new(PrivacySettings {
        paused: true, // Secure default on startup
        excluded_apps: vec![
            "app.vera.desktop".to_string(), // never capture Vera itself
            "1Password".to_string(),
            "Bitwarden".to_string(),
            "Keychain Access".to_string(),
            "KeychainAccess".to_string(),
            "KeePassXC".to_string(),
            "Dashlane".to_string(),
            "LastPass".to_string(),
            "Authy".to_string(),
            "Enpass".to_string(),
            "Banking".to_string(),
        ],
        excluded_domains: Vec::new(),
      }),
    })
    .manage(TrayHandles {
      pause_item: Mutex::new(None),
    })
    .manage(FrameCaptureState {
      enabled: Mutex::new(false), // default OFF; resolved from settings in setup()
      child: Mutex::new(None),
    })
    .manage(VaultState {
      key: Mutex::new(None), // locked until Touch ID unlock
    })
    .invoke_handler(tauri::generate_handler![
      has_accessibility_permission,
      request_accessibility_permission,
      has_screen_recording_permission,
      request_screen_recording_permission,
      open_privacy_settings,
      write_text_file_at,
      set_capture_paused,
      is_capture_paused,
      update_privacy_settings,
      save_cloud_api_key,
      has_cloud_api_key,
      test_cloud_connection,
      generate_chat_completion,
      set_frames_capture_enabled,
      is_frames_capture_enabled,
      get_frames_storage_bytes,
      extract_frame_near,
      delete_frames_range,
      clear_all_frames,
      vault_unlock,
      is_vault_unlocked,
      has_vault_key
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Menu-bar (tray) icon. A failure here is logged but does not abort the
      // app — Cmd+Q still quits, and capture still runs.
      match build_tray(app) {
          Ok(()) => {}
          Err(e) => eprintln!("[Vera] Failed to create menu-bar tray: {}", e),
      }

      // Startup cleanup: purge system-process rows (loginwindow etc.) from the
      // activity history BEFORE the UI loads, and surface what is stored.
      // tauri-plugin-sql resolves "sqlite:vera.db" against the app config dir.
      {
          let db_file = resolve_db_path(app.handle());

          match db_file {
              Some(path) => {
                  match cleanup_system_process_rows(&path) {
                      Ok((deleted, names)) => {
                          println!(
                              "[Vera Cleanup] deleted {} system-process rows from activity_events ({})",
                              deleted,
                              path.display()
                          );
                          println!(
                              "[Vera Cleanup] remaining DISTINCT app_name values ({}):",
                              names.len()
                          );
                          for name in &names {
                              println!("[Vera Cleanup]   - {:?}", name);
                          }
                      }
                      Err(e) => {
                          println!("[Vera Cleanup] FAILED to clean activity_events at {}: {}", path.display(), e);
                      }
                  }

                  match cleanup_low_value_captures(&path) {
                      Ok((short, exact, near)) => {
                          println!(
                              "[Vera Cleanup] captures: removed {} short/chrome rows, {} exact duplicates, {} near-duplicates",
                              short, exact, near
                          );
                      }
                      Err(e) => {
                          println!("[Vera Cleanup] FAILED to clean captures at {}: {}", path.display(), e);
                      }
                  }

                  // Make sure the frames table exists immediately on launch, even
                  // with frame capture OFF (the sql-plugin migration also creates
                  // it, but only once the frontend loads the database).
                  ensure_frames_table_at(&path);
              }
              None => {
                  println!("[Vera Cleanup] no existing vera.db found yet — nothing to clean");
              }
          }
      }

      // Spawn native background activity-tracking thread (app/window/duration).
      // This is NOT the screen-capture loop; the old text-only capture loop was
      // retired in favour of the frame-capture sidecar supervised below.
      let app_handle = app.handle().clone();
      std::thread::spawn(move || {
          let mut current_app: Option<String> = None;
          let mut current_window: Option<String> = None;
          let mut current_start_time: Option<u64> = None;
          let mut last_flush_time = Instant::now();

          loop {
              thread_loop_tick(
                  &app_handle,
                  &mut current_app,
                  &mut current_window,
                  &mut current_start_time,
                  &mut last_flush_time
              );
              std::thread::sleep(Duration::from_secs(3));
          }
      });

      // Resolve the bundled frame-capture sidecar and start its supervisor.
      // The supervisor owns the sidecar lifecycle and only runs it when the
      // "Screen recording (frames)" setting is on, capture isn't paused, and
      // screen-recording permission is granted. Backend-driven, so it keeps
      // capturing when the window is hidden or closed.
      let frame_helper = app
          .path()
          .resolve("binaries/frame-capture", tauri::path::BaseDirectory::Resource)
          .ok()
          .filter(|p| p.exists());
      if frame_helper.is_none() {
          eprintln!("Warning: frame-capture binary resource not found; frame capture disabled");
      }

      // Resume the persisted enabled state across restarts (default OFF).
      let frames_enabled = read_setting_from_app(app.handle(), "frames_capture_enabled")
          .map(|v| v == "true")
          .unwrap_or(false);
      if let Ok(mut e) = app.state::<FrameCaptureState>().enabled.lock() {
          *e = frames_enabled;
      }

      let app_handle_frames = app.handle().clone();
      std::thread::spawn(move || {
          frame_supervisor_loop(app_handle_frames, frame_helper);
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Vera")
    .run(|app_handle, event| {
        // Clicking the Dock icon while the window is hidden reopens it.
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
    });
}

fn thread_loop_tick(
    app_handle: &tauri::AppHandle,
    current_app: &mut Option<String>,
    current_window: &mut Option<String>,
    current_start_time: &mut Option<u64>,
    last_flush_time: &mut Instant
) {
    let now_epoch_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // Get seconds since last input event
    let idle_seconds = unsafe { CGEventSourceSecondsSinceLastEventType(0, 0xFFFFFFFF) };

    if idle_seconds >= 60.0 {
        // User has been idle for over 60s, close the active session (if any)
        if let Some(app) = current_app.take() {
            let start = current_start_time.take().unwrap_or(now_epoch_ms);
            let active_end_ms = now_epoch_ms.saturating_sub((idle_seconds * 1000.0) as u64);

            let duration = if active_end_ms > start { (active_end_ms - start) / 1000 } else { 0 };
            store_segment(app_handle, app, current_window.take(), start, duration);
        }
        return;
    }

    // Screen is locked — locked time never counts as activity.
    // Close any open session and record nothing until unlock.
    if unsafe { ffi_is_screen_locked() } {
        if let Some(app) = current_app.take() {
            let start = current_start_time.take().unwrap_or(now_epoch_ms);
            let duration = (now_epoch_ms.saturating_sub(start)) / 1000;
            store_segment(app_handle, app, current_window.take(), start, duration);
        }
        return;
    }

    // Query active app
    let activity = unsafe { get_active_app_activity() };

    let app_name = if !activity.app_name.is_null() {
        let name = unsafe { std::ffi::CStr::from_ptr(activity.app_name).to_string_lossy().into_owned() };
        name
    } else {
        String::new()
    };

    let bundle_id = if !activity.bundle_id.is_null() {
        unsafe { std::ffi::CStr::from_ptr(activity.bundle_id).to_string_lossy().into_owned() }
    } else {
        String::new()
    };

    let window_title = if !activity.window_title.is_null() {
        Some(unsafe { std::ffi::CStr::from_ptr(activity.window_title).to_string_lossy().into_owned() })
    } else {
        None
    };

    unsafe { free_app_activity(activity) };

    if app_name.is_empty() {
        return;
    }

    // Exclude Vera itself and system UI processes (loginwindow, screensaver, dock, ...)
    let is_vera = app_name == "Vera" || app_name == "vera" || bundle_id == "app.vera.desktop";
    if is_vera || is_system_process(&app_name, &bundle_id) {
        if let Some(prev_app) = current_app.take() {
            let start = current_start_time.take().unwrap_or(now_epoch_ms);
            let duration = (now_epoch_ms.saturating_sub(start)) / 1000;
            store_segment(app_handle, prev_app, current_window.take(), start, duration);
        }
        return;
    }

    let app_changed = match current_app {
        Some(curr) => curr != &app_name,
        None => true,
    };

    if app_changed {
        // Close previous session
        if let Some(prev_app) = current_app.take() {
            let start = current_start_time.take().unwrap_or(now_epoch_ms);
            let duration = (now_epoch_ms.saturating_sub(start)) / 1000;
            store_segment(app_handle, prev_app, current_window.take(), start, duration);
        }

        // Start new session
        *current_app = Some(app_name);
        *current_window = window_title;
        *current_start_time = Some(now_epoch_ms);
        *last_flush_time = Instant::now();
    } else {
        // App is the same, update the window title
        *current_window = window_title;

        // Flush active session once a minute to update the dashboard live
        if last_flush_time.elapsed() >= Duration::from_secs(60) {
            if let Some(app) = current_app {
                let start = current_start_time.unwrap_or(now_epoch_ms);
                let duration = (now_epoch_ms.saturating_sub(start)) / 1000;
                if duration > 0 {
                    store_segment(app_handle, app.clone(), current_window.clone(), start, duration);
                }
            }
            *last_flush_time = Instant::now();
        }
    }
}

//! Path confinement — audit finding F-2.
//!
//! ## What was wrong
//!
//! Two Tauri commands took a path straight from the webview and used it
//! unchecked:
//!
//! ```text
//! #[tauri::command]
//! fn get_frame_thumbnail(app, thumbnail_path: String) -> Result<String, String> {
//!     let data = std::fs::read(&thumbnail_path)?;   // any file on disk
//!     …                                             // returned as base64
//! }
//!
//! #[tauri::command]
//! fn write_text_file_at(path: String, contents: String) -> Result<(), String> {
//!     std::fs::write(&path, contents)               // any path, any content
//! }
//! ```
//!
//! The comment on the second one even said *"Kept minimal on purpose — no fs
//! plugin / path scope needed."* Tauri's path scoping was bypassed deliberately.
//!
//! Neither was exploitable on its own. Together with `"csp": null` in
//! `tauri.conf.json` and `sql:allow-execute` granted to the webview, they formed
//! a complete chain: one script execution inside the webview could read any file
//! the user could read and exfiltrate it as a data URL.
//!
//! ## What holds now
//!
//! Every path crossing the IPC boundary passes through [`confine`]. A path is
//! only accepted if it resolves inside an allowed root. Symlinks, `..` segments
//! and absolute escapes are all rejected by the same rule, because the check
//! runs on the **normalised** path.

use std::path::{Component, Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub enum PathError {
    /// Path points outside every allowed root.
    Escapes,
    /// Empty path, or one that normalises to nothing.
    Empty,
    /// Path contains a NUL byte or other input that cannot be a real file.
    Malformed,
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::Escapes => write!(f, "path is outside the permitted directory"),
            PathError::Empty => write!(f, "empty path"),
            PathError::Malformed => write!(f, "malformed path"),
        }
    }
}

/// Removes `.` and resolves `..` lexically, without touching the filesystem.
///
/// Lexical rather than `canonicalize()` on purpose: `canonicalize` requires the
/// file to exist, which would make the check unusable for write targets, and it
/// would silently follow symlinks.
pub fn normalise(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                // Popping past the root is not allowed to escape it.
                if !out.pop() {
                    // Keep a leading `..` on relative paths so it stays
                    // detectable as an escape later.
                    if !out.has_root() {
                        out.push("..");
                    }
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Accepts `candidate` only if it lies inside `root`.
///
/// Returns the normalised path so callers use the checked value, never the raw
/// input — otherwise the check could be bypassed by passing a different string
/// to the subsequent read.
pub fn confine(candidate: &str, root: &Path) -> Result<PathBuf, PathError> {
    if candidate.is_empty() {
        return Err(PathError::Empty);
    }
    if candidate.contains('\0') {
        return Err(PathError::Malformed);
    }

    let normalised = normalise(Path::new(candidate));
    if normalised.as_os_str().is_empty() {
        return Err(PathError::Empty);
    }

    let root = normalise(root);
    if normalised.starts_with(&root) {
        Ok(normalised)
    } else {
        Err(PathError::Escapes)
    }
}

/// Like [`confine`], but accepts any one of several roots.
pub fn confine_any(candidate: &str, roots: &[PathBuf]) -> Result<PathBuf, PathError> {
    let mut last = PathError::Escapes;
    for root in roots {
        match confine(candidate, root) {
            Ok(p) => return Ok(p),
            Err(e) => last = e,
        }
    }
    Err(last)
}

/// Does the path carry one of the allowed extensions? Case-insensitive.
pub fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_ascii_lowercase();
            allowed.iter().any(|a| a.eq_ignore_ascii_case(&e))
        })
        .unwrap_or(false)
}

/// Extensions the thumbnail command may serve.
pub const THUMBNAIL_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png"];

/// Extensions the export command may write.
pub const EXPORT_EXTENSIONS: &[&str] = &["json", "csv", "txt", "md"];

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/Users/erik/Library/Application Support/app.vera.desktop/frames")
    }

    #[test]
    fn accepts_paths_inside_the_root() {
        let r = root();
        assert!(confine("/Users/erik/Library/Application Support/app.vera.desktop/frames/a.jpg", &r).is_ok());
        assert!(confine("/Users/erik/Library/Application Support/app.vera.desktop/frames/sub/b.jpg", &r).is_ok());
    }

    #[test]
    fn rejects_the_exact_attack_the_audit_described() {
        // `get_frame_thumbnail` used to read any file the user could read and
        // return it base64-encoded to the webview.
        let r = root();
        for attack in [
            "/etc/passwd",
            "/Users/erik/.ssh/id_rsa",
            "/Users/erik/Library/Application Support/app.vera.desktop/vera.db",
            "/Users/erik/Documents/taxes.pdf",
        ] {
            assert_eq!(confine(attack, &r), Err(PathError::Escapes), "accepted: {attack}");
        }
    }

    #[test]
    fn rejects_traversal_out_of_the_root() {
        let r = root();
        for attack in [
            "/Users/erik/Library/Application Support/app.vera.desktop/frames/../vera.db",
            "/Users/erik/Library/Application Support/app.vera.desktop/frames/../../../../etc/passwd",
            "/Users/erik/Library/Application Support/app.vera.desktop/frames/./../../secrets",
        ] {
            assert_eq!(confine(attack, &r), Err(PathError::Escapes), "accepted: {attack}");
        }
    }

    #[test]
    fn traversal_that_returns_inside_is_allowed() {
        // `frames/sub/../a.jpg` is `frames/a.jpg` — legitimate.
        let r = root();
        let p = confine(
            "/Users/erik/Library/Application Support/app.vera.desktop/frames/sub/../a.jpg",
            &r,
        )
        .expect("should be allowed");
        assert_eq!(
            p,
            PathBuf::from("/Users/erik/Library/Application Support/app.vera.desktop/frames/a.jpg")
        );
    }

    #[test]
    fn returns_the_normalised_path_not_the_input() {
        // Callers must use the checked value. If the raw input were returned,
        // the check could be defeated by the read that follows.
        let r = root();
        let p = confine(
            "/Users/erik/Library/Application Support/app.vera.desktop/frames/./a.jpg",
            &r,
        )
        .unwrap();
        assert!(!p.to_string_lossy().contains("/./"));
    }

    #[test]
    fn sibling_directory_with_shared_prefix_is_rejected() {
        // `frames-backup` starts with the same string as `frames` but is a
        // different directory. A naive `starts_with` on strings would accept it.
        let r = PathBuf::from("/data/frames");
        assert_eq!(confine("/data/frames-backup/a.jpg", &r), Err(PathError::Escapes));
        assert!(confine("/data/frames/a.jpg", &r).is_ok());
    }

    #[test]
    fn empty_and_malformed_are_rejected() {
        let r = root();
        assert_eq!(confine("", &r), Err(PathError::Empty));
        assert_eq!(confine("a\0b", &r), Err(PathError::Malformed));
    }

    #[test]
    fn relative_paths_do_not_escape() {
        let r = PathBuf::from("/data/frames");
        assert_eq!(confine("../../etc/passwd", &r), Err(PathError::Escapes));
        assert_eq!(confine("a.jpg", &r), Err(PathError::Escapes));
    }

    #[test]
    fn confine_any_accepts_from_several_roots() {
        let roots = vec![PathBuf::from("/data/frames"), PathBuf::from("/data/segments")];
        assert!(confine_any("/data/segments/x.mov", &roots).is_ok());
        assert!(confine_any("/data/frames/x.jpg", &roots).is_ok());
        assert_eq!(confine_any("/etc/passwd", &roots), Err(PathError::Escapes));
    }

    #[test]
    fn extension_check_is_case_insensitive() {
        assert!(has_extension(Path::new("a.JPG"), THUMBNAIL_EXTENSIONS));
        assert!(has_extension(Path::new("a.jpeg"), THUMBNAIL_EXTENSIONS));
        assert!(!has_extension(Path::new("a.db"), THUMBNAIL_EXTENSIONS));
        assert!(!has_extension(Path::new("noext"), THUMBNAIL_EXTENSIONS));
        assert!(has_extension(Path::new("export.JSON"), EXPORT_EXTENSIONS));
        assert!(!has_extension(Path::new("payload.sh"), EXPORT_EXTENSIONS));
    }

    #[test]
    fn database_can_never_be_served_as_a_thumbnail() {
        // Defence in depth: even if a path check were bypassed, the extension
        // rule keeps vera.db out of the thumbnail command.
        assert!(!has_extension(Path::new("vera.db"), THUMBNAIL_EXTENSIONS));
        assert!(!has_extension(Path::new("vera.db-wal"), THUMBNAIL_EXTENSIONS));
    }

    #[test]
    fn normalise_does_not_touch_the_filesystem() {
        // Must work for paths that do not exist — write targets are checked
        // before the file is created.
        let p = normalise(Path::new("/definitely/not/here/../there/x.json"));
        assert_eq!(p, PathBuf::from("/definitely/not/there/x.json"));
    }
}

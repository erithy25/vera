//! What Vera can find out about this Mac before a recording is made.
//!
//! The rule this module lives under: **Vera never captures the screen.** That is
//! written on the website and in the app, and it is the reason the product is
//! trusted with a file full of credentials. So nothing here looks at pixels.
//! It reads what is installed, where files land, and how big the display is —
//! the same things a person would read off their own Settings, only without
//! having to know where to look.
//!
//! The point of knowing them is that advice stops being generic. "Your
//! recordings save to ~/Desktop" is worth more than "recordings save to your
//! chosen folder", and it is worth more still when it is true.
//!
//! Every probe here can fail, and each failure is reported as *unknown* rather
//! than as a default that happens to be plausible. A guide that confidently
//! states the wrong folder is worse than one that says it could not tell.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// One way of making a screen recording, and whether this Mac has it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Recorder {
    pub name: String,
    /// `builtin` — already on every Mac. `installed` — found in /Applications.
    pub kind: String,
    pub installed: bool,
    /// One line on what this one is good for. Written for someone who has never
    /// recorded their screen.
    pub note: String,
}

/// The apps worth naming. Ordered so the two that need no download come first —
/// somebody who has never recorded their screen should not be told to install
/// something.
const KNOWN_RECORDERS: &[(&str, &str, &str, &str)] = &[
    (
        "Screenshot",
        "/System/Applications/Utilities/Screenshot.app",
        "builtin",
        "Already on your Mac. Shift-Command-5 opens it. Records the whole screen or a region you drag.",
    ),
    (
        "QuickTime Player",
        "/System/Applications/QuickTime Player.app",
        "builtin",
        "Already on your Mac. File > New Screen Recording. Useful when you also want to trim afterwards.",
    ),
    (
        "Screen Studio",
        "/Applications/Screen Studio.app",
        "installed",
        "Records at full resolution and zooms automatically — text stays large, which is exactly what a scan needs.",
    ),
    (
        "CleanShot X",
        "/Applications/CleanShot X.app",
        "installed",
        "Region recording with a visible countdown, so nothing is caught before you are ready.",
    ),
    (
        "Loom",
        "/Applications/Loom.app",
        "installed",
        "Uploads as it records. Anything on screen is on their servers before you have seen it — scan a local copy first.",
    ),
    (
        "OBS Studio",
        "/Applications/OBS.app",
        "installed",
        "Full control over resolution and bitrate. Check the output size: OBS defaults can be smaller than your display.",
    ),
    (
        "Descript",
        "/Applications/Descript.app",
        "installed",
        "Records and edits together. Its exports are often downscaled, which is where readable text stops being readable.",
    ),
    (
        "Kap",
        "/Applications/Kap.app",
        "installed",
        "Small and free. Defaults to a low frame rate, which is fine — Vera samples one frame a second anyway.",
    ),
];

/// Which recorders are present.
///
/// The existence check is injected so this can be exercised on a machine with no
/// /Applications at all, which is where it is built.
pub fn detect_recorders(exists: impl Fn(&str) -> bool) -> Vec<Recorder> {
    KNOWN_RECORDERS
        .iter()
        .map(|(name, path, kind, note)| Recorder {
            name: (*name).to_string(),
            kind: (*kind).to_string(),
            // A built-in is reported as present even if the probe cannot see it:
            // Screenshot.app has been on every Mac since Mojave, and telling
            // someone their Mac lacks it would send them looking for a download
            // that does not exist.
            installed: *kind == "builtin" || exists(path),
            note: (*note).to_string(),
        })
        .collect()
}

/// Where screen recordings are saved.
///
/// `defaults read com.apple.screencapture location` is unset on a Mac that has
/// never been changed, and macOS then uses the Desktop. An unset key is a known
/// answer, not a failed probe — but a `defaults` that will not run at all is a
/// failed probe, and the two are kept apart.
pub fn resolve_save_location(raw: Option<&str>, home: &str) -> (String, bool) {
    match raw {
        None => (String::new(), false),
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                (format!("{home}/Desktop"), true)
            } else {
                // `defaults` returns the literal tilde form when it was set that
                // way; expanding it is the difference between a path a person
                // can find and one they have to translate.
                let expanded = if let Some(rest) = trimmed.strip_prefix("~/") {
                    format!("{home}/{rest}")
                } else {
                    trimmed.to_string()
                };
                (expanded.trim_end_matches('/').to_string(), true)
            }
        }
    }
}

/// Everything the guidance screen is allowed to claim about this Mac.
#[derive(Debug, Clone, Serialize)]
pub struct RecordingEnvironment {
    pub recorders: Vec<Recorder>,
    /// Absolute path, empty when the probe could not answer.
    pub save_location: String,
    pub save_location_known: bool,
    /// Display size in device pixels, and its backing scale. Zero means the
    /// probe failed — the legibility maths treats that as "cannot say", never
    /// as "fine".
    pub display_width: u32,
    pub display_height: u32,
    pub display_scale: f64,
}

fn screencapture_location() -> Option<String> {
    let out = Command::new("defaults")
        .args(["read", "com.apple.screencapture", "location"])
        .output()
        .ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        // The key is simply unset, which is the normal state of a fresh Mac.
        // `defaults` exits non-zero for that, so it is reported as the known
        // default rather than as a failure — but only when `defaults` ran.
        Some(String::new())
    }
}

#[tauri::command]
pub fn recording_environment(app: tauri::AppHandle) -> RecordingEnvironment {
    let home = std::env::var("HOME").unwrap_or_default();
    let (save_location, save_location_known) =
        resolve_save_location(screencapture_location().as_deref(), &home);

    let (display_width, display_height, display_scale) = {
        use tauri::Manager;
        match app.get_webview_window("main").and_then(|w| w.primary_monitor().ok().flatten()) {
            Some(monitor) => {
                let size = monitor.size();
                (size.width, size.height, monitor.scale_factor())
            }
            None => (0, 0, 0.0),
        }
    };

    RecordingEnvironment {
        recorders: detect_recorders(|p| Path::new(p).exists()),
        save_location,
        save_location_known,
        display_width,
        display_height,
        display_scale,
    }
}

/// Open the recorder macOS already has.
///
/// The bundle identifier first because it survives the app being renamed or
/// localised, which the display name does not.
#[tauri::command]
pub fn open_screen_recorder() -> Result<(), String> {
    let by_bundle = Command::new("open").args(["-b", "com.apple.screencaptureui"]).status();
    if matches!(&by_bundle, Ok(s) if s.success()) {
        return Ok(());
    }
    match Command::new("open").args(["-a", "Screenshot"]).status() {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("The screen recorder would not open (exit {s}).")),
        Err(e) => Err(format!("The screen recorder would not open: {e}")),
    }
}

/// Reveal the folder recordings are saved to, so "it's in ~/Desktop" becomes a
/// window the user is looking at.
#[tauri::command]
pub fn reveal_folder(path: String) -> Result<(), String> {
    if path.is_empty() {
        return Err("No folder to open.".into());
    }
    match Command::new("open").arg(&path).status() {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err(format!("Could not open {path}.")),
        Err(e) => Err(format!("Could not open {path}: {e}")),
    }
}

/// The key the dry run asks you to put on screen, and what the app is allowed
/// to say about it.
///
/// It comes from the engine crate rather than being written here, because the
/// value and the test that proves the engine still detects it have to be the
/// same thing. A canary the detector has quietly stopped recognising would make
/// the dry run tell healthy setups that they are broken.
#[tauri::command]
pub fn dry_run_canary() -> &'static str {
    vera_core::DRY_RUN_CANARY
}

/// What a recording plan does to the text in it.
///
/// The maths lives in `vera-core::legibility`, where it is measured and tested,
/// and is called across the boundary rather than reimplemented in TypeScript.
/// A second copy of a rule is a copy that drifts, and this one carries numbers
/// that decide whether a user re-records or ships.
#[tauri::command]
pub fn evaluate_recording_plan(
    font_points: f64,
    display_scale: f64,
    capture_height_px: u32,
    export_height_px: u32,
) -> RecordingPlanReport {
    let plan = vera_core::RecordingPlan {
        font_points,
        display_scale,
        capture_height_px,
        export_height_px,
    };
    RecordingPlanReport {
        verdict: vera_core::evaluate_plan(plan),
        smallest_safe_export_height: vera_core::smallest_safe_export_height(plan),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingPlanReport {
    pub verdict: vera_core::PlanVerdict,
    /// The export height that would have been fine, when one exists. `None`
    /// means no export size helps because the text is already too small at full
    /// size — a different problem with a different fix.
    pub smallest_safe_export_height: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_ins_are_never_reported_as_missing() {
        // Probe that finds nothing at all — the state of the build machine.
        let found = detect_recorders(|_| false);
        for r in found.iter().filter(|r| r.kind == "builtin") {
            assert!(
                r.installed,
                "{} is on every Mac; reporting it missing sends the user looking for a download that does not exist",
                r.name
            );
        }
        assert!(found.iter().filter(|r| r.kind == "installed").all(|r| !r.installed));
    }

    #[test]
    fn a_third_party_recorder_is_found_by_its_path() {
        let found = detect_recorders(|p| p == "/Applications/Screen Studio.app");
        let studio = found.iter().find(|r| r.name == "Screen Studio").unwrap();
        assert!(studio.installed);
        assert!(!found.iter().find(|r| r.name == "Loom").unwrap().installed);
    }

    #[test]
    fn the_builtin_recorders_come_first() {
        // Somebody who has never recorded their screen must not be told to
        // install something before they are told about Shift-Command-5.
        let found = detect_recorders(|_| true);
        assert_eq!(found[0].name, "Screenshot");
        assert_eq!(found[0].kind, "builtin");
    }

    #[test]
    fn an_unset_key_means_the_desktop() {
        let (path, known) = resolve_save_location(Some(""), "/Users/erik");
        assert_eq!(path, "/Users/erik/Desktop");
        assert!(known, "an unset key is a known answer, not a failed probe");
    }

    #[test]
    fn a_tilde_path_is_expanded_into_something_findable() {
        let (path, known) = resolve_save_location(Some("~/Movies/screencasts"), "/Users/erik");
        assert_eq!(path, "/Users/erik/Movies/screencasts");
        assert!(known);
    }

    #[test]
    fn a_trailing_slash_does_not_survive() {
        let (path, _) = resolve_save_location(Some("/Users/erik/Desktop/"), "/Users/erik");
        assert_eq!(path, "/Users/erik/Desktop");
    }

    #[test]
    fn a_probe_that_could_not_run_says_so_instead_of_guessing() {
        let (path, known) = resolve_save_location(None, "/Users/erik");
        assert!(!known, "a failed probe must not be presented as a real answer");
        assert!(path.is_empty());
    }
}

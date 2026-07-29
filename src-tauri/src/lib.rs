//! Vera — the desktop shell.
//!
//! ## What this file used to be
//!
//! 2,300 lines and eight jobs at once: an Objective-C FFI surface, a polling
//! tracker that recorded which app you had in front, a supervisor for a
//! long-lived screen-recording sidecar, AES-GCM file encryption, a Keychain
//! vault gated by Touch ID, HTTP clients for Anthropic, OpenAI and Ollama, and
//! three separate places that created the database schema.
//!
//! Almost none of that is needed to scan a file you hand over. The tracker, the
//! recorder, the vault and the model clients are gone — not disabled behind a
//! setting, but removed. A tool whose whole job is finding credentials you
//! accidentally recorded has no business running a screen recorder of its own,
//! and every one of those subsystems was a way for it to hold data it should
//! never have had.
//!
//! What is left is a window, a menu-bar icon, an updater, and the four commands
//! in [`video_scan`]. The detection itself lives in `vera-core`, where it is
//! covered by tests that run on any machine.

use tauri::Manager;

/// Scanning a finished recording — Vera's entire job.
pub mod video_scan;

/// Migrations come from `vera-core` so the schema has exactly one definition.
/// It used to have three, in two languages: the plugin's migration list, a
/// second `CREATE TABLE` pass in Rust that reconciled columns by hand, and a
/// third in `src/lib/db.ts`.
fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    vera_core::schema::MIGRATIONS
        .iter()
        .map(|m| tauri_plugin_sql::Migration {
            version: m.version,
            description: m.description,
            sql: m.sql,
            kind: tauri_plugin_sql::MigrationKind::Up,
        })
        .collect()
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Menu-bar icon. Two items: show the window, quit.
///
/// It used to carry a "Pause capture" toggle, which no longer means anything —
/// there is nothing running to pause.
fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::TrayIconBuilder;

    let open_item = MenuItemBuilder::with_id("open", "Open Vera").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Vera").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&open_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // The "V" mark as a monochrome template image (renders in light/dark menu bars).
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-v-template.png"))?;

    let _tray = TrayIconBuilder::with_id("vera-tray")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch (Spotlight, Dock, login item) focuses the running
        // window instead of opening another one.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:vera.db", migrations())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        // Closing the window hides it so the menu-bar icon can bring it back.
        // Cmd+Q and the tray's "Quit Vera" still exit properly.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            video_scan::scan_video,
            video_scan::cancel_scan,
            video_scan::detector_count,
            video_scan::detector_list,
            video_scan::scan_frame_preview
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A failure here costs the menu-bar icon, not the app.
            if let Err(e) = build_tray(app) {
                eprintln!("[Vera] could not create the menu-bar icon: {e}");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Vera")
        .run(|app_handle, event| {
            // Clicking the Dock icon while the window is hidden reopens it.
            // `RunEvent::Reopen` only exists on macOS, so the arm is gated
            // rather than the crate being un-checkable elsewhere.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main_window(app_handle);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (&app_handle, &event);
        });
}

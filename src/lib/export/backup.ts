import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { getDb } from "../db";

// Complete local data export (GDPR-style takeout) to a JSON file via a
// native save dialog. Returns the chosen path, or null if cancelled.
//
// Excluded on purpose:
//  - the encrypted media itself (segments + thumbnails stay on-device only)
export async function exportBackup(): Promise<string | null> {
  const db = await getDb();

  const [
    activity,
    frames,
    clients,
    projects,
    workBlocks,
    timeEntries,
    rules,
    feedback,
    settingsRows,
    version,
  ] = await Promise.all([
    db.select<any[]>("SELECT * FROM activity_events ORDER BY started_at ASC"),
    db.select<any[]>(
      "SELECT id, timestamp, app, window_title, url, ocr_text FROM frames ORDER BY timestamp ASC"
    ),
    db.select<any[]>("SELECT * FROM clients ORDER BY id ASC"),
    db.select<any[]>("SELECT * FROM projects ORDER BY id ASC"),
    db.select<any[]>("SELECT * FROM work_blocks ORDER BY started_at ASC"),
    db.select<any[]>("SELECT * FROM time_entries ORDER BY entry_date ASC, id ASC"),
    db.select<any[]>("SELECT * FROM assignment_rules ORDER BY id ASC"),
    db.select<any[]>("SELECT * FROM assignment_feedback ORDER BY id ASC"),
    db.select<any[]>("SELECT key, value FROM settings"),
    getVersion().catch(() => "unknown"),
  ]);

  const payload = {
    app: "Vera",
    version,
    exported_at: new Date().toISOString(),
    note: "Complete local export from Vera. The encrypted media itself is intentionally excluded.",
    counts: {
      activity_events: activity.length,
      frames: frames.length,
      clients: clients.length,
      projects: projects.length,
      work_blocks: workBlocks.length,
      time_entries: timeEntries.length,
      assignment_rules: rules.length,
      assignment_feedback: feedback.length,
      settings: settingsRows.length,
    },
    activity_events: activity,
    frames,
    clients,
    projects,
    work_blocks: workBlocks,
    time_entries: timeEntries,
    assignment_rules: rules,
    assignment_feedback: feedback,
    settings: settingsRows,
  };

  const json = JSON.stringify(payload, null, 2);

  const date = new Date().toISOString().slice(0, 10);
  const path = await save({
    title: "Export Vera data",
    defaultPath: `vera-export-${date}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!path) return null;

  await invoke("write_text_file_at", { path, contents: json });
  return path;
}

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { getDb } from "./db";

// Export all local data to a JSON file via a native save dialog.
// Returns the chosen path, or null if the user cancelled.
//
// Excluded on purpose:
//  - frame embeddings (large derived vectors, not user content)
//  - the encrypted media itself (segments + thumbnails stay on-device only)
export async function exportAllData(): Promise<string | null> {
  const db = await getDb();

  const [activity, frames, settingsRows, version] = await Promise.all([
    db.select<any[]>("SELECT * FROM activity_events ORDER BY started_at ASC"),
    db.select<any[]>(
      "SELECT id, timestamp, app, window_title, url, ocr_text FROM frames ORDER BY timestamp ASC"
    ),
    db.select<any[]>("SELECT key, value FROM settings"),
    getVersion().catch(() => "unknown"),
  ]);

  const payload = {
    app: "Vera",
    version,
    exported_at: new Date().toISOString(),
    note: "Local export from Vera. The encrypted media itself is intentionally excluded.",
    counts: {
      activity_events: activity.length,
      frames: frames.length,
      settings: settingsRows.length,
    },
    activity_events: activity,
    frames,
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

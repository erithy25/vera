import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { getDb } from "./db";

// Export all local data to a JSON file via a native save dialog.
// Returns the chosen path, or null if the user cancelled.
//
// Excluded on purpose:
//  - capture embeddings (large derived vectors, regenerable, not user content)
//  - stored cloud API keys (secrets must never land in a plaintext export)
export async function exportAllData(): Promise<string | null> {
  const db = await getDb();

  const [notes, goals, activity, captures, settingsRows, version] = await Promise.all([
    db.select<any[]>("SELECT * FROM notes ORDER BY created_at ASC"),
    db.select<any[]>("SELECT * FROM goals ORDER BY created_at ASC"),
    db.select<any[]>("SELECT * FROM activity_events ORDER BY started_at ASC"),
    db.select<any[]>(
      "SELECT id, captured_at, app_name, window_title, ocr_text, char_count FROM captures ORDER BY captured_at ASC"
    ),
    db.select<any[]>("SELECT key, value FROM settings"),
    getVersion().catch(() => "unknown"),
  ]);

  const settings = settingsRows.filter((row) => !String(row.key).startsWith("cloud_api_key_"));

  const payload = {
    app: "Vera",
    version,
    exported_at: new Date().toISOString(),
    note: "Local export from Vera. Capture embeddings and stored API keys are intentionally excluded.",
    counts: {
      notes: notes.length,
      goals: goals.length,
      activity_events: activity.length,
      captures: captures.length,
      settings: settings.length,
    },
    notes,
    goals,
    activity_events: activity,
    captures,
    settings,
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

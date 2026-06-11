import { invoke } from "@tauri-apps/api/core";
import { ollamaClient } from "./ollama";
import { settingsRepo } from "./db";

// Shared engine path for chat generation. Uses the SAME configuration as the
// Ask-bar: the ai_engine setting decides between local Ollama (streaming) and
// the cloud Rust command (the API key never reaches the frontend).
// Throws an Error with a user-displayable message on failure — callers render
// it in the answer area; there is no silent fallback between engines.
export async function generateReply(
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void
): Promise<void> {
  let engine: "local" | "cloud" = "local";
  try {
    engine = await settingsRepo.getAiEngine();
  } catch (err) {
    console.error("Failed to read AI engine setting:", err);
  }

  if (engine === "cloud") {
    try {
      const reply = await invoke<string>("generate_chat_completion", { messages });
      onChunk(reply);
      settingsRepo
        .setCloudLastStatus("ok")
        .then(() => window.dispatchEvent(new CustomEvent("ai-engine-updated")))
        .catch(() => undefined);
    } catch (err: any) {
      settingsRepo
        .setCloudLastStatus("failed")
        .then(() => window.dispatchEvent(new CustomEvent("ai-engine-updated")))
        .catch(() => undefined);
      throw new Error(typeof err === "string" ? err : err?.message || String(err));
    }
    return;
  }

  const online = await ollamaClient.isRunning();
  if (!online) {
    throw new Error(
      "Ollama is offline. Please make sure Ollama is running locally and default models are installed to answer questions."
    );
  }
  const chatModel = await settingsRepo.getChatModel();
  const installed = await ollamaClient.listModels();
  if (!installed.includes(chatModel) && !installed.includes(`${chatModel}:latest`)) {
    throw new Error(
      `Model '${chatModel}' is not downloaded. Go to Settings to download it, or run \`ollama pull ${chatModel}\` in your terminal.`
    );
  }
  await ollamaClient.chatStream(chatModel, messages, onChunk);
}

import { ollamaClient } from "./ollama";
import { settingsRepo } from "./db";

// Local-only generation path (Ollama). This is the substrate for the
// assignment engine and the narrative generator of the coming layers — Vera
// has no cloud engine: not a single byte leaves the device.
// Throws an Error with a user-displayable message on failure.
export async function generateReply(
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const online = await ollamaClient.isRunning();
  if (!online) {
    throw new Error(
      "Ollama is offline. Please make sure Ollama is running locally so Vera can generate text."
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

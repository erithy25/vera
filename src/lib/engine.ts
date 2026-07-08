import { ollamaClient } from "./ollama";
import { settingsRepo } from "./db";

// Local-only generation (Ollama, JSON mode). Vera has no cloud engine: not a
// single byte leaves the device.

export class EngineUnavailableError extends Error {}

/**
 * Resolve the local model once per assignment pass (offline / model-missing
 * checks). Throws EngineUnavailableError with a user-displayable message.
 */
export async function prepareEngine(): Promise<string> {
  const online = await ollamaClient.isRunning();
  if (!online) {
    throw new EngineUnavailableError(
      "Ollama is offline. Start Ollama so Vera can assign blocks locally."
    );
  }
  const model = await settingsRepo.getChatModel();
  const installed = await ollamaClient.listModels();
  if (!installed.includes(model) && !installed.includes(`${model}:latest`)) {
    throw new EngineUnavailableError(
      `Model '${model}' is not downloaded. Pull it in Settings → Local AI.`
    );
  }
  return model;
}

/**
 * One JSON-mode completion. Malformed-but-returned JSON is the CALLER's
 * concern (parseClassifyReply); this retry only covers transport blips —
 * same prompt, one attempt. A TimeoutError (hung Ollama) propagates so the
 * caller can stop the whole pass instead of timing out 25 times.
 */
export async function generateJson(
  model: string,
  messages: { role: string; content: string }[]
): Promise<string> {
  try {
    return await ollamaClient.chatJson(model, messages);
  } catch (err: any) {
    if (err?.name === "TimeoutError") throw err;
    return await ollamaClient.chatJson(model, messages);
  }
}

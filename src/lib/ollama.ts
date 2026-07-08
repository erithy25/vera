const OLLAMA_URL = "http://localhost:11434";

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  percent?: number;
}

export const ollamaClient = {
  async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { method: "GET" });
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      const models = data.models || [];
      return models.map((m: any) => m.name);
    } catch (e) {
      console.error("Error listing Ollama models:", e);
      return [];
    }
  },

  async pullModel(modelName: string, onProgress: (progress: PullProgress) => void): Promise<void> {
    const res = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });

    if (!res.ok) {
      throw new Error(`Pull model failed with status ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("ReadableStream not supported on response");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const completed = json.completed || 0;
          const total = json.total || 0;
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
          onProgress({
            status: json.status || "Downloading...",
            completed,
            total,
            percent,
          });
        } catch (e) {
          console.error("Failed to parse pull progress line:", line, e);
        }
      }
    }
  },

  async chatStream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          temperature: 0.2,
        }
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Chat stream request failed: ${res.statusText} - ${errorText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("ReadableStream not supported on response");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            const chunk = json.message.content;
            fullResponse += chunk;
            onChunk(chunk);
          }
        } catch (e) {
          console.error("Failed to parse chat progress line:", line, e);
        }
      }
    }

    return fullResponse;
  },
};

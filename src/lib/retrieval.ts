import { capturesRepo, settingsRepo, DbCapture } from "./db";
import { ollamaClient, cosineSimilarity } from "./ollama";

// The local capture retrieval used by the Ask-bar and the Researcher agent:
// semantic ranking via on-device Ollama embeddings, with a SQL LIKE fallback
// when embeddings are unavailable. Retrieval never leaves the machine.
export async function retrieveRelevantCaptures(query: string): Promise<DbCapture[]> {
  let relevant: DbCapture[] = [];

  try {
    const embeddingModel = await settingsRepo.getEmbeddingModel();
    const installed = await ollamaClient.listModels();
    const available =
      installed.includes(embeddingModel) || installed.includes(`${embeddingModel}:latest`);

    if (available) {
      const queryVector = await ollamaClient.generateEmbedding(query, embeddingModel);
      const allCaptures = await capturesRepo.list();

      relevant = allCaptures
        .map((c: DbCapture) => {
          if (!c.embedding) return { capture: c, similarity: -1 };
          try {
            const vector = JSON.parse(c.embedding);
            return { capture: c, similarity: cosineSimilarity(queryVector, vector) };
          } catch (e) {
            return { capture: c, similarity: -1 };
          }
        })
        .filter((item) => item.similarity > 0.15)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map((item) => item.capture);
    }
  } catch (err) {
    console.error("Semantic capture search failed:", err);
  }

  if (relevant.length === 0) {
    // Fallback to SQL LIKE search
    const fallback = await capturesRepo.list(query);
    relevant = fallback.slice(0, 5);
  }

  return relevant;
}

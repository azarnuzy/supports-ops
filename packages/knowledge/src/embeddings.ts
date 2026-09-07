import { OpenAIClient } from "@anvia/openai";

export type EmbeddingClient = {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
};

export type OpenAiEmbeddingClientOptions = {
  apiKey: string;
  modelId: string;
  baseUrl?: string;
  dimensions?: number;
};

const DEFAULT_DIMENSIONS = 1536;

/**
 * Embeddings run through OpenRouter's OpenAI-compatible endpoint, verified
 * against a live provider in docs/planning/spike-anvia.md (finding 6): one
 * API key covers both completions and embeddings, and `modelId` must carry
 * OpenRouter's provider-prefixed form (e.g. `openai/text-embedding-3-small`).
 */
export function createOpenAiEmbeddingClient(
  options: OpenAiEmbeddingClientOptions,
): EmbeddingClient {
  const client = new OpenAIClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
  const model = client.embeddingModel({ modelId: options.modelId });
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;

  return {
    dimensions,
    async embed(texts) {
      if (texts.length === 0) {
        return [];
      }

      const embeddings = await model.embedTexts(texts);
      return embeddings.map((embedding) => embedding.vector);
    },
  };
}

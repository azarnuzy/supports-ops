import type { ApiClient } from "./client";

export type ModelCatalogEntry = {
  id: string;
  name: string;
  rate: number;
  description: string;
};

export type AiSettings = {
  agentModel: string;
  aiAgentId: string;
  followUpAfterSeconds: number;
  autoResolveAfterSeconds: number;
  autoResolveEnabled: boolean;
  idleCloseAfterSeconds: number;
  instructions: string;
  handoffMessage: string;
  resolutionMessage: string;
  modelCatalog: readonly ModelCatalogEntry[];
};

export async function fetchAiSettings(client: ApiClient) {
  const response = await client["ai-settings"].$get();

  if (response.status === 403) throw new Error("Only an Admin can manage AI settings.");
  if (!response.ok) throw new Error("Failed to load AI settings.");
  return (await response.json()) as { aiSettings: AiSettings };
}

export async function updateAiSettings(client: ApiClient, input: AiSettings) {
  const response = await client["ai-settings"].$patch({ json: input });
  if (!response.ok) throw new Error("Failed to save AI settings.");
  return (await response.json()) as { aiSettings: AiSettings };
}

import {
  createApiClient,
  fetchAiSettings,
  listCatalogTools,
  removeToolPolicy,
  setToolPolicy,
  updateAiSettings,
  type AiSettings,
  type TicketCategory,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAiSettings() {
  return fetchAiSettings(apiClient);
}

export function saveAiSettings(input: AiSettings) {
  return updateAiSettings(apiClient, input);
}

export function getAgentTools(aiAgentId: string) {
  return listCatalogTools(apiClient, aiAgentId);
}

export function setCategoryPolicy({
  aiAgentId,
  category,
  toolId,
}: {
  aiAgentId: string;
  category: TicketCategory;
  toolId: string;
}) {
  return setToolPolicy(apiClient, aiAgentId, category, toolId);
}

export function removeCategoryPolicy({
  aiAgentId,
  category,
}: {
  aiAgentId: string;
  category: TicketCategory;
}) {
  return removeToolPolicy(apiClient, aiAgentId, category);
}

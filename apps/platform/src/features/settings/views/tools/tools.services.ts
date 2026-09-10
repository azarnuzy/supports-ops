import {
  createApiClient,
  createHttpTool,
  deleteHttpTool,
  fetchAiSettings,
  getHttpTool,
  listCatalogTools,
  setToolEnabled,
  updateHttpTool,
  type HttpToolInput,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAiSettings() {
  return fetchAiSettings(apiClient);
}

export function getTools(aiAgentId: string) {
  return listCatalogTools(apiClient, aiAgentId);
}

export function getTool(id: string) {
  return getHttpTool(apiClient, id);
}

export function createTool(input: HttpToolInput) {
  return createHttpTool(apiClient, input);
}

export function updateTool({ id, input }: { id: string; input: HttpToolInput }) {
  return updateHttpTool(apiClient, id, input);
}

export function deleteTool(id: string) {
  return deleteHttpTool(apiClient, id);
}

export function toggleToolEnabled({ toolId, enabled }: { toolId: string; enabled: boolean }) {
  return setToolEnabled(apiClient, toolId, enabled);
}

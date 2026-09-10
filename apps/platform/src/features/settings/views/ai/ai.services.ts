import { createApiClient, fetchAiSettings, updateAiSettings, type AiSettings } from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getAiSettings() {
  return fetchAiSettings(apiClient);
}

export function saveAiSettings(input: AiSettings) {
  return updateAiSettings(apiClient, input);
}

import {
  createApiClient,
  fetchWebWidgetConfig,
  updateWebWidgetConfig as updateWebWidgetConfigRequest,
} from "@repo/api-client";
import type { UpdateWebWidgetConfigInput } from "./widget-config.types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export async function getWebWidgetConfig() {
  return fetchWebWidgetConfig(apiClient);
}

export async function updateWebWidgetConfig(input: UpdateWebWidgetConfigInput) {
  return updateWebWidgetConfigRequest(apiClient, input);
}

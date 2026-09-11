import {
  createApiClient,
  fetchWebWidgetConfig,
  fetchWhatsAppConfig,
  updateWebWidgetConfig as updateWebWidgetConfigRequest,
  updateWhatsAppConfig as updateWhatsAppConfigRequest,
  uploadWebWidgetLogo as uploadWebWidgetLogoRequest,
  verifyWhatsAppConfig as verifyWhatsAppConfigRequest,
} from "@repo/api-client";
import type {
  UpdateWebWidgetConfigInput,
  VerifyWhatsAppConfigInput,
} from "./widget-config.types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export async function getWebWidgetConfig() {
  return fetchWebWidgetConfig(apiClient);
}

export async function getWhatsAppConfig() {
  return fetchWhatsAppConfig(apiClient);
}

export async function updateWebWidgetConfig(input: UpdateWebWidgetConfigInput) {
  return updateWebWidgetConfigRequest(apiClient, input);
}

export async function updateWhatsAppConfig(enabled: boolean) {
  return updateWhatsAppConfigRequest(apiClient, enabled);
}

export async function uploadWebWidgetLogo(file: File) {
  return uploadWebWidgetLogoRequest(apiClient, file);
}

export async function verifyWhatsAppConfig(input: VerifyWhatsAppConfigInput) {
  return verifyWhatsAppConfigRequest(apiClient, input);
}

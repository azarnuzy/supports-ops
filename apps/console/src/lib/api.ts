import { createApiClient } from "@repo/api-client";

export const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const api = createApiClient(apiBaseUrl);

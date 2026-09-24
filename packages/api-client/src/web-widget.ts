import type { ApiClient } from "./client";

export type WebWidgetConfig = {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
  logoKey: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateWebWidgetConfigInput = {
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  closingMessage: string | null;
  allowedDomains: string[];
  logoKey?: string | null;
};

export type WebWidgetConfigResult = {
  webWidgetConfig: WebWidgetConfig;
  closingMessage: string | null;
};

export async function fetchWebWidgetConfig(client: ApiClient) {
  const response = await client["widget-config"].$get();

  if (response.status === 403) {
    throw new Error("You do not have permission to view the Web Widget configuration.");
  }

  if (!response.ok) {
    throw new Error("Failed to load the Web Widget configuration.");
  }

  return (await response.json()) as WebWidgetConfigResult;
}

export async function updateWebWidgetConfig(client: ApiClient, input: UpdateWebWidgetConfigInput) {
  const response = await client["widget-config"].$patch({ json: input });

  if (response.status === 403) {
    throw new Error("You do not have permission to update the Web Widget configuration.");
  }

  if (!response.ok) {
    throw new Error("Failed to save the Web Widget configuration.");
  }

  return (await response.json()) as WebWidgetConfigResult;
}

export async function uploadWebWidgetLogo(client: ApiClient, file: File) {
  const response = await client["widget-config"].logo.$post({ form: { file } });

  if (response.status === 403) {
    throw new Error("You do not have permission to update the Web Widget configuration.");
  }

  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data.message ?? "Failed to upload the logo.");
  }

  return (await response.json()) as WebWidgetConfigResult;
}

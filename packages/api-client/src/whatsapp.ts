import type { ApiClient } from "./client";

export type WhatsAppConfig = {
  accessTokenLastFour: string;
  businessAccountId: string;
  callbackUrl: string;
  displayPhoneNumber: string;
  enabled: boolean;
  health: "AWAITING_WEBHOOK" | "HEALTHY" | "DISABLED" | "TOKEN_INVALID";
  phoneNumberId: string;
  verifiedAt: string;
  verifiedName: string | null;
  verifyToken: string;
};

export type VerifyWhatsAppConfigInput = {
  accessToken: string;
  appSecret: string;
  businessAccountId: string;
  phoneNumberId: string;
};

export type ReplaceWhatsAppCredentialsInput = {
  accessToken: string;
  appSecret?: string;
};

export async function fetchWhatsAppConfig(client: ApiClient) {
  const response = await client["whatsapp-config"].$get();
  if ((response.status as number) === 403) throw new Error("Only an Admin can manage WhatsApp.");
  if (!response.ok) throw new Error("Failed to load the WhatsApp configuration.");
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig | null };
}

export async function verifyWhatsAppConfig(client: ApiClient, input: VerifyWhatsAppConfigInput) {
  const response = await client["whatsapp-config"].verify.$post({ json: input });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to verify the WhatsApp credentials.");
  }
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig };
}

export async function replaceWhatsAppCredentials(
  client: ApiClient,
  input: ReplaceWhatsAppCredentialsInput,
) {
  const response = await client["whatsapp-config"].credentials.$patch({ json: input });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to replace the WhatsApp credentials.");
  }
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig };
}

export async function updateWhatsAppConfig(client: ApiClient, enabled: boolean) {
  const response = await client["whatsapp-config"].$patch({ json: { enabled } });
  if (!response.ok) throw new Error("Failed to update the WhatsApp Channel.");
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig };
}

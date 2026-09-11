import { z } from "zod";

export const verifyWhatsAppConfigSchema = z.object({
  phoneNumberId: z.string().trim().min(1).max(100),
  businessAccountId: z.string().trim().min(1).max(100),
  accessToken: z.string().trim().min(1).max(4_000),
  appSecret: z.string().trim().min(1).max(500),
});

export const updateWhatsAppConfigSchema = z.object({ enabled: z.boolean() });

export const replaceWhatsAppCredentialsSchema = z.object({
  accessToken: z.string().trim().min(1).max(4_000),
  appSecret: z.string().trim().min(1).max(500).optional(),
});

export type VerifyWhatsAppConfigInput = z.infer<typeof verifyWhatsAppConfigSchema>;
export type ReplaceWhatsAppCredentialsInput = z.infer<typeof replaceWhatsAppCredentialsSchema>;

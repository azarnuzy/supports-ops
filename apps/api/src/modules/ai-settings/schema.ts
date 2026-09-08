import { z } from "zod";

export const updateAiSettingsSchema = z.object({
  followUpAfterSeconds: z
    .number()
    .int()
    .min(1)
    .max(60 * 60 * 24 * 30),
  autoResolveAfterSeconds: z
    .number()
    .int()
    .min(1)
    .max(60 * 60 * 24 * 30),
  autoResolveEnabled: z.boolean(),
});

export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

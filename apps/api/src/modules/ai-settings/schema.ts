import { z } from "zod";

const handoffMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(
    (message) => !/[{}]/.test(message.replaceAll("{humanAgentName}", "")),
    "Only {humanAgentName} is supported.",
  );

export const updateAiSettingsSchema = z.object({
  aiAgentId: z.string().min(1),
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
  instructions: z.string().trim().max(10_000),
  handoffMessage: handoffMessageSchema,
  resolutionMessage: z.string().trim().min(1).max(1000),
});

export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

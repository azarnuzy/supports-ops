import { z } from "zod";
import { isCatalogModelId } from "../ai-agent/model-catalog";

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
  agentModel: z.string().min(1).refine(isCatalogModelId, "Unknown Agent Model."),
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
  idleCloseAfterSeconds: z
    .number()
    .int()
    .min(1)
    .max(60 * 60 * 24 * 30),
  instructions: z.string().trim().max(10_000),
  handoffMessage: handoffMessageSchema,
  resolutionMessage: z.string().trim().min(1).max(1000),
});

export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

import { z } from "zod";

const secretHeaders = z.record(z.string().trim().min(1), z.string().min(1)).optional();

export const createMcpServerSchema = z.object({
  bearerToken: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(100),
  secretHeaders,
  url: z.url(),
});

export const updateMcpServerSchema = createMcpServerSchema.partial().extend({
  bearerToken: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  secretHeaders: secretHeaders.unwrap().nullable().optional(),
});

export const reviewMcpToolSchema = z.object({
  enabled: z.boolean(),
  risk: z.enum(["READ_ONLY", "MUTATING"]),
});

export const executeMcpToolSchema = z.object({
  aiAgentId: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export type CreateMcpServerInput = z.infer<typeof createMcpServerSchema>;
export type UpdateMcpServerInput = z.infer<typeof updateMcpServerSchema>;
export type ReviewMcpToolInput = z.infer<typeof reviewMcpToolSchema>;

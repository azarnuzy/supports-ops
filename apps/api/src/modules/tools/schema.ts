import { z } from "zod";

const secretHeadersSchema = z
  .record(z.string().trim().min(1), z.string())
  .refine(
    (headers) =>
      Object.keys(headers).every(
        (name) => !["authorization", "content-length", "host"].includes(name.toLowerCase()),
      ),
    "Authorization, Content-Length, and Host cannot be custom secret headers.",
  );

const httpToolFields = {
  bearerToken: z.string().optional().nullable(),
  description: z.string().trim().min(1).max(2_000),
  enabled: z.boolean().default(true),
  inputSchema: z.record(z.string(), z.unknown()),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  name: z.string().trim().min(1).max(100),
  risk: z.enum(["READ_ONLY", "MUTATING"]),
  secretHeaders: secretHeadersSchema.optional().nullable(),
  url: z.url(),
};

export const createHttpToolSchema = z.object(httpToolFields);
export const updateHttpToolSchema = z.object({
  ...httpToolFields,
  enabled: z.boolean(),
});

export const testHttpToolSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});

export const setToolEnabledSchema = z.object({ enabled: z.boolean() });
export const setToolAssignmentSchema = z.object({ assigned: z.boolean() });
export const setToolUsageInstructionSchema = z.object({
  usageInstruction: z.string().trim().max(1_000).nullable(),
});

export type CreateHttpToolInput = z.infer<typeof createHttpToolSchema>;
export type UpdateHttpToolInput = z.infer<typeof updateHttpToolSchema>;

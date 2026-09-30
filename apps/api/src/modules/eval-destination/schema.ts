import { z } from "zod";

const credential = z.string().trim().min(1).max(500);

export const evalDestinationSchema = z.object({
  backend: z.enum(["LENS", "LANGFUSE"]),
  endpoint: z.string().trim().url().max(500),
  dashboardUrl: z.string().trim().url().max(500),
  /** Both or neither: omitted keeps the stored credentials. */
  publicKey: credential.optional(),
  secretKey: credential.optional(),
});

export type EvalDestinationInput = z.infer<typeof evalDestinationSchema>;

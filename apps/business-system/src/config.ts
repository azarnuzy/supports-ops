import { z } from "zod";

const envSchema = z.object({
  BUSINESS_SYSTEM_DATABASE_URL: z
    .string()
    .trim()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:15432/supportops?schema=business_system"),
  BUSINESS_SYSTEM_PORT: z.coerce.number().int().positive().default(8001),
});

export const env = envSchema.parse(process.env);

/** The AI Agent runtime calls required Tools with no per-Ticket argument, so this
 * demo Business System falls back to a fixed demo customer for both the HTTP
 * subscription Tool and the MCP invoice Tool when the caller omits one. */
export const defaultDemoCustomerId = "cus_102";

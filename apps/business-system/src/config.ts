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

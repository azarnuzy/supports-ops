import { z } from "zod";
import { analyticsRangeQuerySchema } from "../analytics/schema";

export const ledgerListDefaultLimit = 20;
export const ledgerListMaxLimit = 100;

export const ledgerQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(ledgerListMaxLimit).default(ledgerListDefaultLimit),
});

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const aiUsageFiltersSchema = z.object({
  aiAgentId: z.string().trim().min(1).optional(),
  channel: z.enum(["WEB", "WHATSAPP"]).optional(),
});

export const aiUsageQuerySchema = z.intersection(analyticsRangeQuerySchema, aiUsageFiltersSchema);

export type AiUsageFilters = z.infer<typeof aiUsageFiltersSchema>;
export type AiUsageQuery = z.infer<typeof aiUsageQuerySchema>;

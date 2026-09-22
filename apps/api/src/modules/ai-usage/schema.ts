import { z } from "zod";

export const ledgerListDefaultLimit = 20;
export const ledgerListMaxLimit = 100;

export const ledgerQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(ledgerListMaxLimit).default(ledgerListDefaultLimit),
});

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

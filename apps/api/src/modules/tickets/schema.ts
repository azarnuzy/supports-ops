import { z } from "zod";

export const reassignTicketSchema = z.object({ humanAgentId: z.string().min(1) });

export const humanReplySchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().uuid(),
});

export const resolveTicketSchema = z.object({
  resolutionReason: z.literal("HUMAN_RESOLVED"),
});

function commaSeparatedEnum<T extends [string, ...string[]]>(values: T) {
  return z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1))
    .optional();
}

export const listTicketsQuerySchema = z.object({
  assigneeId: z.string().trim().min(1).optional(),
  category: commaSeparatedEnum([
    "ACCOUNT",
    "BILLING",
    "SUBSCRIPTION",
    "TECHNICAL",
    "GENERAL",
  ] as const),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  priority: commaSeparatedEnum(["LOW", "NORMAL", "HIGH"] as const),
  search: z.string().trim().min(1).max(200).optional(),
  status: commaSeparatedEnum(["AI_HANDLING", "ESCALATED", "HUMAN_HANDLING", "RESOLVED"] as const),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

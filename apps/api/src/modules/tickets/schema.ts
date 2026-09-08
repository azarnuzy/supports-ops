import { z } from "zod";

export const reassignTicketSchema = z.object({ humanAgentId: z.string().min(1) });

export const humanReplySchema = z.object({ content: z.string().trim().min(1).max(10_000) });

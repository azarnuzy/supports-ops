import { z } from "zod";

export const reassignTicketSchema = z.object({ humanAgentId: z.string().min(1) });

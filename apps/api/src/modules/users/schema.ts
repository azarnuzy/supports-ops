import { z } from "zod";
import { usersListDefaultLimit, usersListMaxLimit } from "./utils";

export const usersQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(usersListMaxLimit).default(usersListDefaultLimit),
});

export const createHumanAgentSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
});

export type CreateHumanAgentInput = z.infer<typeof createHumanAgentSchema>;

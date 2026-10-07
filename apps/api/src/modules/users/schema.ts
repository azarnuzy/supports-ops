import { z } from "zod";
import { usersListDefaultLimit, usersListMaxLimit } from "./utils";

export const usersQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(usersListMaxLimit).default(usersListDefaultLimit),
});

export const updateMembershipSchema = z.object({ role: z.enum(["ADMIN", "HUMAN_AGENT"]) });
export const organizationAdminSchema = z.object({ enabled: z.boolean() });

import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["ADMIN", "HUMAN_AGENT"]),
  workspaceId: z.string().min(1).optional(),
});

export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
});

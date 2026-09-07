import { z } from "zod";

export const preChatSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(1).max(100),
  widgetKey: z.string().trim().min(1),
});

export type PreChatInput = z.infer<typeof preChatSchema>;

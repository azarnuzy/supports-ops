import { z } from "zod";

export const preChatSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().min(1).max(100),
  widgetKey: z.string().trim().min(1),
});

export type PreChatInput = z.infer<typeof preChatSchema>;

export const customerMessageSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export type CustomerMessageInput = z.infer<typeof customerMessageSchema>;

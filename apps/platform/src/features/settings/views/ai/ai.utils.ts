import type { AiSettings } from "@repo/api-client";

export function validateAiSettings(form: AiSettings): string | null {
  if (!form.instructions.trim()) return "Instructions cannot be empty.";
  if (form.followUpAfterSeconds < 1) return "Follow-Up delay must be at least 1 second.";
  if (form.autoResolveAfterSeconds < 1) return "Auto-Resolution delay must be at least 1 second.";
  if (form.idleCloseAfterSeconds < 1) return "Silence limit must be at least 1 second.";
  return null;
}

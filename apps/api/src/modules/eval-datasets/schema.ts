import { z } from "zod";
import { caseSchema } from "@repo/shared/eval-schema";
export * from "@repo/shared/eval-schema";
export const importMessagesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(200).default(""),
  channel: z.enum(["all", "WEB", "WHATSAPP"]).default("all"),
  since: z.enum(["all", "7", "30", "90"]).default("all"),
});
export const datasetCaseQuery = z.object({
  sortBy: z.enum(["caseKey", "message", "category", "metric", "complete"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(200).default(""),
  status: z.enum(["all", "ready", "draft"]).default("all"),
});
export const bulkCaseSchema = caseSchema
  .pick({ expected: true, metric: true, metadata: true })
  .extend({
    caseIds: z.array(z.string().min(1)).min(1).max(100),
  });

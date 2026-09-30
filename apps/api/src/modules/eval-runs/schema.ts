import { z } from "zod";

export const maxCasesPerRun = 100;

export const selectionSchema = z.object({
  caseIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(maxCasesPerRun)
    .refine((ids) => new Set(ids).size === ids.length, "Each Case can be selected once."),
  datasetId: z.string().min(1).max(200),
});
export type Selection = z.infer<typeof selectionSchema>;

export const retryParams = z.object({ id: z.string().min(1), target: z.enum(["CENTRAL", "WORKSPACE"]) });

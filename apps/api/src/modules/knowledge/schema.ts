import { z } from "zod";

export const knowledgeVisibilitySchema = z.enum(["CUSTOMER_SAFE", "INTERNAL_ONLY"]);

const titleSchema = z.string().trim().min(1).max(200);
const contentSchema = z.string().trim().min(1).max(20_000);

export const createManualFaqSchema = z.object({
  content: contentSchema,
  title: titleSchema,
  visibility: knowledgeVisibilitySchema,
});

export const updateManualFaqSchema = z.object({
  content: contentSchema,
  title: titleSchema,
  visibility: knowledgeVisibilitySchema,
});

export const retrievalTestSchema = z.object({
  query: z.string().trim().min(1).max(500),
});

export const createDocumentationUrlSchema = z.object({
  url: z.url().refine((value) => new URL(value).protocol === "https:", "Use an HTTPS URL."),
  visibility: knowledgeVisibilitySchema,
});

export const createPdfKnowledgeSourceSchema = z.object({
  file: z.instanceof(File),
  visibility: knowledgeVisibilitySchema,
});

export type CreateManualFaqInput = z.infer<typeof createManualFaqSchema>;
export type UpdateManualFaqInput = z.infer<typeof updateManualFaqSchema>;
export type RetrievalTestInput = z.infer<typeof retrievalTestSchema>;
export type CreateDocumentationUrlInput = z.infer<typeof createDocumentationUrlSchema>;

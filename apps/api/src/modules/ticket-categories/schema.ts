import { z } from "zod";

const categoryFields = {
  description: z.string().trim().min(1).max(500),
  label: z.string().trim().min(1).max(60),
};

export const createTicketCategorySchema = z.object(categoryFields);
export const updateTicketCategorySchema = z.object({
  ...categoryFields,
  sortOrder: z.number().int().min(0).optional(),
});

export type CreateTicketCategoryInput = z.infer<typeof createTicketCategorySchema>;
export type UpdateTicketCategoryInput = z.infer<typeof updateTicketCategorySchema>;

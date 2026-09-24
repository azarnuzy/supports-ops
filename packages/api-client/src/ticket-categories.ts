import type { ApiClient } from "./client";

export type TicketCategoryOption = {
  id: string;
  key: string;
  label: string;
  description: string;
  isFallback: boolean;
  sortOrder: number;
};

export type TicketCategoryInput = { label: string; description: string };
export async function listTicketCategories(client: ApiClient) {
  const response = await client["ticket-categories"].$get();
  if (!response.ok) throw new Error("Failed to load ticket categories.");
  return (await response.json()) as { categories: TicketCategoryOption[] };
}

export async function createTicketCategory(client: ApiClient, input: TicketCategoryInput) {
  const response = await client["ticket-categories"].$post({ json: input });
  if (response.status === 409) throw new Error("A category with a matching name already exists.");
  if (!response.ok) throw new Error("Failed to create the category.");
  return (await response.json()) as { category: TicketCategoryOption };
}

export async function updateTicketCategory(
  client: ApiClient,
  id: string,
  input: TicketCategoryInput,
) {
  const response = await client["ticket-categories"][":id"].$put({ json: input, param: { id } });
  if (!response.ok) throw new Error("Failed to save the category.");
  return (await response.json()) as { category: TicketCategoryOption };
}

export async function deleteTicketCategory(client: ApiClient, id: string) {
  const response = await client["ticket-categories"][":id"].$delete({ param: { id } });
  if (response.status === 409)
    throw new Error(
      "The fallback category cannot be deleted — every ticket needs somewhere to land.",
    );
  if (!response.ok) throw new Error("Failed to delete the category.");
}

import {
  createApiClient,
  createTicketCategory,
  deleteTicketCategory,
  listTicketCategories,
  updateTicketCategory,
  type TicketCategoryInput,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function getTicketCategories() {
  return listTicketCategories(apiClient);
}

export function createCategory(input: TicketCategoryInput) {
  return createTicketCategory(apiClient, input);
}

export function updateCategory({ id, input }: { id: string; input: TicketCategoryInput }) {
  return updateTicketCategory(apiClient, id, input);
}

export function deleteCategory(id: string) {
  return deleteTicketCategory(apiClient, id);
}

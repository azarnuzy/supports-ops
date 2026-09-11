import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCategory, deleteCategory, getTicketCategories, updateCategory } from "./services";

export const ticketCategoriesQueryKey = ["ticket-categories"] as const;

export const ticketCategoriesQueryOptions = {
  queryFn: getTicketCategories,
  queryKey: ticketCategoriesQueryKey,
};

export function useTicketCategoriesQuery() {
  return useQuery(ticketCategoriesQueryOptions);
}

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ticketCategoriesQueryKey });
}

export function useCreateCategoryMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: createCategory, onSuccess: invalidate });
}

export function useUpdateCategoryMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: updateCategory, onSuccess: invalidate });
}

export function useDeleteCategoryMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: deleteCategory, onSuccess: invalidate });
}

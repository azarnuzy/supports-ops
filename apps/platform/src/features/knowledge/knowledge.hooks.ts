import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import {
  createManualFaq,
  deleteKnowledgeSource,
  getKnowledgeSources,
  publishKnowledgeSource,
  updateManualFaq,
} from "./knowledge.services";

export const knowledgeSourcesQueryOptions = queryOptions({
  queryFn: getKnowledgeSources,
  queryKey: queryKeys.workspace.knowledgeSources,
});

export function useCreateManualFaqMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createManualFaq,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function useUpdateManualFaqMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateManualFaq>[1] }) =>
      updateManualFaq(id, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function usePublishKnowledgeSourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: publishKnowledgeSource,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function useDeleteKnowledgeSourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteKnowledgeSource,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

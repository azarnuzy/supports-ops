import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../../lib/query-keys";
import {
  createManualFaq,
  createDocumentationUrl,
  createPdfKnowledgeSource,
  deleteKnowledgeSource,
  getKnowledgeSources,
  publishKnowledgeSource,
  refreshKnowledgeSource,
  subscribeToKnowledgeSourceEvents,
  testRetrieval,
  updateKnowledgeSource,
} from "./knowledge.services";

export const knowledgeSourcesQueryOptions = queryOptions({
  queryFn: getKnowledgeSources,
  queryKey: queryKeys.workspace.knowledgeSources,
});

export function useKnowledgeSourceEvents() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribeToKnowledgeSourceEvents(
        () =>
          void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
      ),
    [queryClient],
  );
}

export function useCreateManualFaqMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createManualFaq,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function useCreateDocumentationUrlMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDocumentationUrl,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function useCreatePdfKnowledgeSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      visibility,
    }: {
      file: File;
      visibility: "CUSTOMER_SAFE" | "INTERNAL_ONLY";
    }) => createPdfKnowledgeSource(file, visibility),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function useUpdateKnowledgeSourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof updateKnowledgeSource>[1];
    }) => updateKnowledgeSource(id, input),
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

export function useRefreshKnowledgeSourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshKnowledgeSource,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.knowledgeSources }),
  });
}

export function useTestRetrievalMutation() {
  return useMutation({
    mutationFn: testRetrieval,
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

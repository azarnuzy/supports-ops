import type { EvalCaseFilters } from "@repo/api-client";
import type { EvalMessageFilters } from "@repo/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkDestination,
  createCase,
  createDataset,
  deleteCase,
  deleteDataset,
  estimateRun,
  getRuns,
  retryDelivery,
  startRun,
  getDataset,
  getDatasets,
  getImportMessages,
  getImportMessageContext,
  importCases,
  previewImport,
  getDestination,
  saveDestination,
  updateCase,
  updateExpectations,
  updateDataset,
} from "./services";

const datasetsKey = ["workspace", "eval-datasets"] as const;

export const useDatasetsQuery = () => useQuery({ queryFn: getDatasets, queryKey: datasetsKey });

export const useDatasetQuery = (id: string, filters: EvalCaseFilters) =>
  useQuery({
    queryFn: () => getDataset(id, filters),
    placeholderData: keepPreviousData,
    queryKey: [...datasetsKey, id, filters],
  });

/** One prefix invalidation refreshes the list counts and any open detail view together. */
function useMutate<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: datasetsKey }),
  });
}

export const useDeleteDatasetMutation = () => useMutate(deleteDataset);
export const useCreateDatasetMutation = () => useMutate(createDataset);
export const useUpdateDatasetMutation = () => useMutate(updateDataset);
export const useCreateCaseMutation = () => useMutate(createCase);
export const useUpdateExpectationsMutation = () => useMutate(updateExpectations);
export const useUpdateCaseMutation = () => useMutate(updateCase);
export const useDeleteCaseMutation = () => useMutate(deleteCase);

const destinationKey = ["workspace", "eval-destination"] as const;

export const useDestinationQuery = () =>
  useQuery({ queryFn: getDestination, queryKey: destinationKey });

export const useSaveDestinationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveDestination,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: destinationKey }),
  });
};

export const useCheckDestinationMutation = () => useMutation({ mutationFn: checkDestination });

export const useImportMessagesQuery = (enabled: boolean, filters: EvalMessageFilters) =>
  useQuery({
    enabled,
    queryFn: () => getImportMessages(filters),
    queryKey: ["workspace", "eval-import-messages", filters],
  });

export const usePreviewImportMutation = () => useMutation({ mutationFn: previewImport });
export const useImportCasesMutation = () => useMutate(importCases);

const runsKey = (datasetId: string) => ["workspace", "eval-runs", datasetId] as const;

/** Polls every 3s while a Run is queued or running, so progress and delivery follow the worker. */
export const useRunsQuery = (datasetId: string, page = 1, pageSize = 1) =>
  useQuery({
    queryFn: () => getRuns(datasetId, page, pageSize),
    queryKey: [...runsKey(datasetId), page, pageSize],
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === "QUEUED" || r.status === "RUNNING") ||
      query.state.data?.runs.some(
        (r) => r.centralDelivery === "PENDING" || r.workspaceDelivery === "PENDING",
      )
        ? 3_000
        : false,
  });

/** Fetch every page so Results never silently omits older attempts. */
export const useAllRunsQuery = (datasetId: string) =>
  useQuery({
    queryKey: [...runsKey(datasetId), "all"],
    queryFn: async () => {
      const first = await getRuns(datasetId, 1, 20);
      const runs = [...first.runs];
      // ponytail: load history in memory; use server-side result pagination if datasets grow large.
      for (let page = 2; page <= Math.ceil(first.total / 20); page++) {
        const next = await getRuns(datasetId, page, 20);
        runs.push(...next.runs);
      }
      return runs;
    },
    refetchInterval: (query) =>
      query.state.data?.some(
        (run) =>
          run.status === "QUEUED" ||
          run.status === "RUNNING" ||
          run.centralDelivery === "PENDING" ||
          run.workspaceDelivery === "PENDING",
      )
        ? 3_000
        : false,
  });

export const useEstimateRunQuery = (selection: { caseIds: string[]; datasetId: string } | null) =>
  useQuery({
    enabled: selection !== null,
    queryFn: () => estimateRun(selection as { caseIds: string[]; datasetId: string }),
    queryKey: ["workspace", "eval-run-estimate", selection],
  });

export const useStartRunMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", "eval-runs"] }),
  });
};

export const useRetryDeliveryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: "CENTRAL" | "WORKSPACE" }) =>
      retryDelivery(id, target),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", "eval-runs"] }),
  });
};

export const useImportMessageContextQuery = (messageId: string, enabled: boolean) =>
  useQuery({
    enabled,
    queryFn: () => getImportMessageContext(messageId),
    queryKey: ["workspace", "eval-message-context", messageId],
  });

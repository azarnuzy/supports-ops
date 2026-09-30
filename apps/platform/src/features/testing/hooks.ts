import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkDestination,
  createCase,
  createDataset,
  deleteCase,
  estimateRun,
  getRuns,
  startRun,
  getDataset,
  getDatasets,
  getImportSessions,
  importCases,
  previewImport,
  getDestination,
  saveDestination,
  updateCase,
  updateDataset,
} from "./services";

const datasetsKey = ["workspace", "eval-datasets"] as const;

export const useDatasetsQuery = () => useQuery({ queryFn: getDatasets, queryKey: datasetsKey });

export const useDatasetQuery = (id: string) =>
  useQuery({ queryFn: () => getDataset(id), queryKey: [...datasetsKey, id] });

/** One prefix invalidation refreshes the list counts and any open detail view together. */
function useMutate<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: datasetsKey }),
  });
}

export const useCreateDatasetMutation = () => useMutate(createDataset);
export const useUpdateDatasetMutation = () => useMutate(updateDataset);
export const useCreateCaseMutation = () => useMutate(createCase);
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

export const useImportSessionsQuery = (enabled: boolean) =>
  useQuery({ enabled, queryFn: getImportSessions, queryKey: ["workspace", "eval-import-sessions"] });

export const usePreviewImportMutation = () => useMutation({ mutationFn: previewImport });
export const useImportCasesMutation = () => useMutate(importCases);

const runsKey = (datasetId: string) => ["workspace", "eval-runs", datasetId] as const;

/** Polls every 3s while a Run is queued or running, so progress and delivery follow the worker. */
export const useRunsQuery = (datasetId: string) =>
  useQuery({
    queryFn: () => getRuns(datasetId),
    queryKey: runsKey(datasetId),
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === "QUEUED" || r.status === "RUNNING") ||
      query.state.data?.runs.some((r) => r.centralDelivery === "PENDING" || r.workspaceDelivery === "PENDING")
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

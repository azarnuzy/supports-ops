import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCase,
  createDataset,
  deleteCase,
  getDataset,
  getDatasets,
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

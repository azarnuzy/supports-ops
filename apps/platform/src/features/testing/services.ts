import {
  createApiClient,
  createEvalCase,
  createEvalDataset,
  deleteEvalCase,
  type EvalCaseInput,
  type EvalDatasetInput,
  getEvalDataset,
  listEvalDatasets,
  updateEvalCase,
  updateEvalDataset,
} from "@repo/api-client";

const apiClient = createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:8000");

export const getDatasets = () => listEvalDatasets(apiClient);
export const getDataset = (id: string) => getEvalDataset(apiClient, id);
export const createDataset = (input: EvalDatasetInput) => createEvalDataset(apiClient, input);
export const updateDataset = ({ id, input }: { id: string; input: EvalDatasetInput }) =>
  updateEvalDataset(apiClient, id, input);
export const createCase = ({ datasetId, input }: { datasetId: string; input: EvalCaseInput }) =>
  createEvalCase(apiClient, datasetId, input);
export const updateCase = ({
  caseId,
  datasetId,
  input,
}: {
  caseId: string;
  datasetId: string;
  input: EvalCaseInput;
}) => updateEvalCase(apiClient, datasetId, caseId, input);
export const deleteCase = ({ caseId, datasetId }: { caseId: string; datasetId: string }) =>
  deleteEvalCase(apiClient, datasetId, caseId);

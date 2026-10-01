import type { EvalCaseFilters } from "@repo/api-client";
import {
  checkEvalDestination,
  createApiClient,
  createEvalCase,
  createEvalDataset,
  deleteEvalCase,
  estimateEvalRun,
  type EvalRunSelection,
  listEvalRuns,
  retryEvalRunDelivery,
  startEvalRun,
  type EvalDestinationInput,
  type EvalCaseInput,
  type EvalDatasetInput,
  getEvalDataset,
  getEvalDestination,
  importEvalCases,
  previewEvalImport,
  type EvalImportSource,
  listEvalDatasets,
  listEvalImportMessages,
  getEvalImportMessageContext,
  type EvalMessageFilters,
  saveEvalDestination,
  updateEvalCase,
  updateEvalCaseExpectations,
  updateEvalDataset,
} from "@repo/api-client";

const apiClient = createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:8000");

export const getDatasets = () => listEvalDatasets(apiClient);
export const getDataset = (
  id: string,
  filters: EvalCaseFilters,
) => getEvalDataset(apiClient, id, filters);
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

export const getDestination = () => getEvalDestination(apiClient);
export const saveDestination = (input: EvalDestinationInput) =>
  saveEvalDestination(apiClient, input);
export const checkDestination = () => checkEvalDestination(apiClient);

export const getImportMessages = (filters: EvalMessageFilters) =>
  listEvalImportMessages(apiClient, filters);
export const previewImport = ({
  datasetId,
  source,
}: {
  datasetId: string;
  source: EvalImportSource;
}) => previewEvalImport(apiClient, datasetId, source);
export const importCases = ({
  datasetId,
  source,
}: {
  datasetId: string;
  source: EvalImportSource;
}) => importEvalCases(apiClient, datasetId, source);

export const estimateRun = (selection: EvalRunSelection) => estimateEvalRun(apiClient, selection);
export const startRun = (selection: EvalRunSelection) => startEvalRun(apiClient, selection);
export const retryDelivery = (id: string, target: "CENTRAL" | "WORKSPACE") =>
  retryEvalRunDelivery(apiClient, id, target);
export const getRuns = (datasetId: string, page = 1, pageSize = 1) =>
  listEvalRuns(apiClient, datasetId, page, pageSize);

export const updateExpectations = ({
  datasetId,
  input,
}: {
  datasetId: string;
  input: Pick<EvalCaseInput, "expected" | "metric" | "metadata"> & { caseIds: string[] };
}) => updateEvalCaseExpectations(apiClient, datasetId, input);

export const getImportMessageContext = (messageId: string) =>
  getEvalImportMessageContext(apiClient, messageId);

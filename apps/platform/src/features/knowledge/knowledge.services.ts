import {
  createApiClient,
  createManualFaq as createManualFaqRequest,
  deleteKnowledgeSource as deleteKnowledgeSourceRequest,
  listKnowledgeSources,
  publishKnowledgeSource as publishKnowledgeSourceRequest,
  testKnowledgeRetrieval,
  updateManualFaq as updateManualFaqRequest,
} from "@repo/api-client";
import type { ManualFaqInput } from "./knowledge.types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export async function getKnowledgeSources() {
  return listKnowledgeSources(apiClient);
}

export async function createManualFaq(input: ManualFaqInput) {
  return createManualFaqRequest(apiClient, input);
}

export async function updateManualFaq(id: string, input: ManualFaqInput) {
  return updateManualFaqRequest(apiClient, id, input);
}

export async function publishKnowledgeSource(id: string) {
  return publishKnowledgeSourceRequest(apiClient, id);
}

export async function deleteKnowledgeSource(id: string) {
  return deleteKnowledgeSourceRequest(apiClient, id);
}

export async function testRetrieval(query: string) {
  return testKnowledgeRetrieval(apiClient, query);
}

import {
  createApiClient,
  createManualFaq as createManualFaqRequest,
  createDocumentationUrl as createDocumentationUrlRequest,
  createPdfKnowledgeSource as createPdfKnowledgeSourceRequest,
  deleteKnowledgeSource as deleteKnowledgeSourceRequest,
  listKnowledgeSources,
  publishKnowledgeSource as publishKnowledgeSourceRequest,
  testKnowledgeRetrieval,
  updateManualFaq as updateManualFaqRequest,
} from "@repo/api-client";
import type { DocumentationUrlInput, ManualFaqInput } from "./knowledge.types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export function subscribeToKnowledgeSourceEvents(onChange: () => void) {
  const events = new EventSource(`${apiBaseUrl}/knowledge/events`, { withCredentials: true });
  events.addEventListener("knowledge.updated", onChange);
  return () => events.close();
}

export async function getKnowledgeSources() {
  return listKnowledgeSources(apiClient);
}

export async function createManualFaq(input: ManualFaqInput) {
  return createManualFaqRequest(apiClient, input);
}

export async function createDocumentationUrl(input: DocumentationUrlInput) {
  return createDocumentationUrlRequest(apiClient, input);
}

export async function createPdfKnowledgeSource(
  file: File,
  visibility: DocumentationUrlInput["visibility"],
) {
  return createPdfKnowledgeSourceRequest(apiClient, file, visibility);
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

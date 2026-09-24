import type { ApiClient } from "./client";

export type KnowledgeSourceType = "MANUAL_FAQ" | "PDF" | "URL" | "HELP_CENTER" | "INTERNAL_SOP";
export type KnowledgeVisibility = "CUSTOMER_SAFE" | "INTERNAL_ONLY";
export type KnowledgeStatus = "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED";
export type KnowledgeIngestStage =
  | "UPLOADING"
  | "EXTRACTING"
  | "CHUNKING"
  | "EMBEDDING"
  | "INDEXING"
  | "PUBLISHED";

export type KnowledgeSource = {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string;
  content: string | null;
  parentId: string | null;
  sourceUrl: string | null;
  visibility: KnowledgeVisibility;
  status: KnowledgeStatus;
  stage: KnowledgeIngestStage | null;
  failedStage: KnowledgeIngestStage | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  chunkCount: number;
};

export type ManualFaqInput = {
  title: string;
  content: string;
  visibility: KnowledgeVisibility;
};

export type DocumentationUrlInput = { url: string; visibility: KnowledgeVisibility };

export type RetrievalTestResult = {
  knowledgeSourceId: string;
  title: string;
  chunkContent: string;
  similarity: number;
};

export class KnowledgeSourceNotFoundApiError extends Error {
  constructor() {
    super("This Knowledge Source no longer exists.");
    this.name = "KnowledgeSourceNotFoundApiError";
  }
}

export class KnowledgeSourceProcessingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeSourceProcessingApiError";
  }
}

export class EmbeddingNotConfiguredApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingNotConfiguredApiError";
  }
}

export async function listKnowledgeSources(client: ApiClient) {
  const response = await client.knowledge.$get();

  if (response.status === 403) {
    throw new Error("You do not have permission to view Knowledge Sources.");
  }

  if (!response.ok) {
    throw new Error("Failed to load Knowledge Sources.");
  }

  return (await response.json()) as { knowledgeSources: KnowledgeSource[] };
}

export async function createManualFaq(client: ApiClient, input: ManualFaqInput) {
  const response = await client.knowledge.$post({ json: input });

  if (!response.ok) {
    throw new Error("Failed to create the Knowledge Source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function createDocumentationUrl(client: ApiClient, input: DocumentationUrlInput) {
  const response = await client.knowledge.url.$post({ json: input });
  if (!response.ok) throw new Error("Failed to start documentation crawl.");
  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function createPdfKnowledgeSource(
  client: ApiClient,
  file: File,
  visibility: KnowledgeVisibility,
) {
  const response = await client.knowledge.pdf.$post({ form: { file, visibility } });
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data.message ?? "Failed to upload PDF.");
  }
  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function updateKnowledgeSource(client: ApiClient, id: string, input: ManualFaqInput) {
  const response = await client.knowledge[":id"].$patch({ json: input, param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (response.status === 409) {
    const data = (await response.json()) as { message: string };
    throw new KnowledgeSourceProcessingApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to save the Knowledge Source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function refreshKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].refresh.$post({ param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (response.status === 409 || response.status === 422) {
    const data = (await response.json()) as { message: string };
    throw new KnowledgeSourceProcessingApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to update the source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function publishKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].publish.$post({ param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (response.status === 409 || response.status === 422) {
    const data = (await response.json()) as { message: string };
    throw new KnowledgeSourceProcessingApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to publish the Knowledge Source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function deleteKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].$delete({ param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to delete the Knowledge Source.");
  }
}
export async function testKnowledgeRetrieval(client: ApiClient, query: string) {
  const response = await client.knowledge["retrieval-test"].$post({ json: { query } });

  if (response.status === 503) {
    const data = (await response.json()) as { message: string };
    throw new EmbeddingNotConfiguredApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Retrieval test failed.");
  }

  return (await response.json()) as { results: RetrievalTestResult[] };
}

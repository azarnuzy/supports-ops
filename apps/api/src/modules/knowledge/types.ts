import type { KnowledgeSourceType, KnowledgeStatus, KnowledgeVisibility } from "../../utils/prisma";

export type KnowledgeSourceDto = {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string;
  content: string | null;
  parentId: string | null;
  sourceUrl: string | null;
  visibility: KnowledgeVisibility;
  status: KnowledgeStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type KnowledgeSourcesResponse = {
  knowledgeSources: KnowledgeSourceDto[];
};

export type RetrievalTestResult = {
  knowledgeSourceId: string;
  title: string;
  chunkContent: string;
  similarity: number;
};

export type RetrievalTestResponse = {
  results: RetrievalTestResult[];
};

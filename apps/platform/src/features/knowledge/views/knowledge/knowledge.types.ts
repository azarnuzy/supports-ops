import type { KnowledgeSourceType } from "@repo/api-client";

export type {
  KnowledgeSource,
  KnowledgeSourceType,
  KnowledgeStatus,
  KnowledgeIngestStage,
  KnowledgeVisibility,
  ManualFaqInput,
  DocumentationUrlInput,
  RetrievalTestResult,
} from "@repo/api-client";

export type DialogKind = "file" | "text" | "website" | null;
export type SourceFilter = "ALL" | KnowledgeSourceType;

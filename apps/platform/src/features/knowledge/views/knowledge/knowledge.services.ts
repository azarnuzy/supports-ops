import type { KnowledgeIngestStage, KnowledgeSourceType, KnowledgeStatus, KnowledgeVisibility } from "../../knowledge.types";

const statusLabels: Record<KnowledgeStatus, string> = {
  DRAFT: "Draft",
  FAILED: "Failed",
  PROCESSING: "Processing",
  PUBLISHED: "Published",
  READY: "Ready",
};

const statusVariants: Record<KnowledgeStatus, "secondary" | "outline" | "default" | "destructive"> =
  {
    DRAFT: "secondary",
    FAILED: "destructive",
    PROCESSING: "outline",
    PUBLISHED: "default",
    READY: "outline",
  };

const visibilityLabels: Record<KnowledgeVisibility, string> = {
  CUSTOMER_SAFE: "Customer-Safe",
  INTERNAL_ONLY: "Internal-Only",
};

const sourceTypeLabels: Record<KnowledgeSourceType, string> = {
  HELP_CENTER: "Help Center",
  INTERNAL_SOP: "Internal SOP",
  MANUAL_FAQ: "Text",
  PDF: "PDF",
  URL: "Website",
};

const stageLabels: Record<KnowledgeIngestStage, string> = {
  CHUNKING: "Creating chunks",
  EMBEDDING: "Generating embeddings",
  EXTRACTING: "Extracting content",
  INDEXING: "Indexing",
  PUBLISHED: "Published",
  UPLOADING: "Uploading",
};

export function statusLabel(status: KnowledgeStatus | KnowledgeIngestStage) {
  return stageLabels[status as KnowledgeIngestStage] ?? statusLabels[status as KnowledgeStatus];
}

export function statusVariant(status: KnowledgeStatus) {
  return statusVariants[status];
}

export function visibilityLabel(visibility: KnowledgeVisibility) {
  return visibilityLabels[visibility];
}

export function sourceTypeLabel(sourceType: KnowledgeSourceType) {
  return sourceTypeLabels[sourceType];
}

export function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

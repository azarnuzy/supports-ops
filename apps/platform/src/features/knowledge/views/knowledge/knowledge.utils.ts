import type { KnowledgeIngestStage, KnowledgeSourceType, KnowledgeStatus, KnowledgeVisibility } from "./knowledge.types";

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

/**
 * The stages a source's ingestion run actually passes through. Stages that
 * do not apply to a source type (e.g. there is no separate Extracting step
 * for typed-in text) are left out entirely rather than shown as skipped, per
 * ADR-0014.
 */
export function ingestStagesFor(sourceType: KnowledgeSourceType): KnowledgeIngestStage[] {
  const stages: KnowledgeIngestStage[] =
    sourceType === "PDF" || sourceType === "URL"
      ? ["EXTRACTING", "CHUNKING", "EMBEDDING", "INDEXING"]
      : ["CHUNKING", "EMBEDDING", "INDEXING"];
  return [...stages, "PUBLISHED"];
}

export type StageState = "completed" | "active" | "pending" | "failed";

export function stageStateFor(
  stage: KnowledgeIngestStage,
  source: {
    status: KnowledgeStatus;
    stage: KnowledgeIngestStage | null;
    failedStage: KnowledgeIngestStage | null;
  },
  order: KnowledgeIngestStage[],
): StageState {
  const stageIndex = order.indexOf(stage);

  if (source.status === "PUBLISHED") return "completed";

  if (source.status === "FAILED" && source.failedStage) {
    const failedIndex = order.indexOf(source.failedStage);
    if (stageIndex < failedIndex) return "completed";
    if (stageIndex === failedIndex) return "failed";
    return "pending";
  }

  const currentIndex = source.stage ? order.indexOf(source.stage) : -1;
  if (currentIndex === -1) return "pending";
  if (stageIndex < currentIndex) return "completed";
  if (stageIndex === currentIndex) return source.status === "PROCESSING" ? "active" : "completed";
  return "pending";
}

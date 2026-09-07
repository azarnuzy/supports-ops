import type { KnowledgeStatus, KnowledgeVisibility } from "../../knowledge.types";

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

export function statusLabel(status: KnowledgeStatus) {
  return statusLabels[status];
}

export function statusVariant(status: KnowledgeStatus) {
  return statusVariants[status];
}

export function visibilityLabel(visibility: KnowledgeVisibility) {
  return visibilityLabels[visibility];
}

export function formatSimilarity(similarity: number) {
  return `${Math.round(similarity * 100)}%`;
}

export function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function canEdit(status: KnowledgeStatus) {
  return status !== "PROCESSING";
}

export function canPublish(status: KnowledgeStatus) {
  return status !== "PROCESSING";
}

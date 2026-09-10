import type { KnowledgeSource } from "../../knowledge.types";

export type KnowledgeDetailDrawerProps = {
  source: KnowledgeSource | null;
  onOpenChange: (open: boolean) => void;
};

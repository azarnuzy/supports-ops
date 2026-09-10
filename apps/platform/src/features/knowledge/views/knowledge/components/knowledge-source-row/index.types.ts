import type { KnowledgeSource } from "../../knowledge.types";

export type KnowledgeSourceRowProps = {
  source: KnowledgeSource;
  onSelect: () => void;
  onDelete: () => void;
};

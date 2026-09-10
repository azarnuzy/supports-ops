import type { KnowledgeVisibility } from "../../knowledge.types";

export type VisibilitySelectProps = {
  id?: string;
  value: KnowledgeVisibility;
  onChange: (value: KnowledgeVisibility) => void;
};

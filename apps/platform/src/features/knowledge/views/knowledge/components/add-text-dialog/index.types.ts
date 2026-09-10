import type { FormEvent } from "react";
import type { KnowledgeVisibility } from "../../knowledge.types";

export type AddTextDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  setTitle: (value: string) => void;
  content: string;
  setContent: (value: string) => void;
  visibility: KnowledgeVisibility;
  setVisibility: (value: KnowledgeVisibility) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
};

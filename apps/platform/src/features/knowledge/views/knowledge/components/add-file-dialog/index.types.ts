import type { FormEvent } from "react";
import type { KnowledgeVisibility } from "../../knowledge.types";

export type AddFileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  visibility: KnowledgeVisibility;
  setVisibility: (value: KnowledgeVisibility) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
};

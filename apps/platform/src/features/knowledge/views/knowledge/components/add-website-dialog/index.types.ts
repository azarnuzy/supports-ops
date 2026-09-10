import type { FormEvent } from "react";
import type { KnowledgeVisibility } from "../../knowledge.types";

export type AddWebsiteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  setUrl: (value: string) => void;
  visibility: KnowledgeVisibility;
  setVisibility: (value: KnowledgeVisibility) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
};

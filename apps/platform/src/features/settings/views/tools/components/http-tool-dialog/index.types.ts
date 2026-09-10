import type { HttpToolFormState } from "../../tools.types";

export type HttpToolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  form: HttpToolFormState;
  onChange: (patch: Partial<HttpToolFormState>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  hasBearerToken?: boolean;
  hasSecretHeaders?: boolean;
};

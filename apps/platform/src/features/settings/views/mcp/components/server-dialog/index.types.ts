import type { McpServerFormState } from "../../mcp.types";

export type ServerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  form: McpServerFormState;
  onChange: (patch: Partial<McpServerFormState>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
};

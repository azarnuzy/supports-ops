import type { CatalogTool, HttpToolTestResult, ToolCallLog } from "@repo/api-client";
import type { HttpToolFormState } from "../../tools.types";

export type ToolSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row this sheet was opened from; null while adding a new Webhook. */
  tool: CatalogTool | null;
  form: HttpToolFormState;
  onChange: (patch: Partial<HttpToolFormState>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  hasBearerToken?: boolean;
  hasSecretHeaders?: boolean;
  onTest?: (input: string) => void;
  isTesting?: boolean;
  testResult?: HttpToolTestResult | null;
  log?: ToolCallLog;
  isLogPending?: boolean;
  /** Saves the Admin's "when to use" guidance for this Tool on this AI Agent. */
  onSaveUsage?: (usageInstruction: string | null) => void;
  isSavingUsage?: boolean;
};

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldLabel } from "@repo/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import type { McpTool, ToolRisk } from "@repo/api-client";
import { useState } from "react";
import type { ReviewToolDialogProps } from "./index.types";

function ReviewToolForm({
  tool,
  onSubmit,
  onOpenChange,
  isPending,
}: {
  tool: McpTool;
  onSubmit: (enabled: boolean, risk: ToolRisk) => void;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
}) {
  const [enabled, setEnabled] = useState(true);
  const [risk, setRisk] = useState<ToolRisk>("READ_ONLY");

  return (
    <>
      <div className="grid gap-5">
        <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          {tool.discoveredDescription || "No description provided."}
        </p>
        <Field>
          <FieldLabel htmlFor="mcp-tool-risk">Risk</FieldLabel>
          <Select value={risk} onValueChange={(value) => setRisk(value as ToolRisk)}>
            <SelectTrigger id="mcp-tool-risk">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="READ_ONLY">Read-only</SelectItem>
              <SelectItem value="MUTATING">Mutating</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <div className="flex items-center justify-between gap-4">
            <FieldLabel htmlFor="mcp-tool-enabled">Enable this Tool</FieldLabel>
            <Switch id="mcp-tool-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={isPending} onClick={() => onSubmit(enabled, risk)}>
          {isPending ? "Saving…" : "Confirm"}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function ReviewToolDialog({
  tool,
  onOpenChange,
  onSubmit,
  isPending,
}: ReviewToolDialogProps) {
  return (
    <Dialog
      open={Boolean(tool)}
      onOpenChange={(open) => {
        if (open) return;
        onOpenChange(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {tool?.remoteName}</DialogTitle>
          <DialogDescription>
            MCP annotations are untrusted hints. Confirm this Tool&apos;s risk before enabling it.
          </DialogDescription>
        </DialogHeader>
        {tool ? (
          <ReviewToolForm
            key={tool.toolId}
            tool={tool}
            onSubmit={onSubmit}
            onOpenChange={onOpenChange}
            isPending={isPending}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

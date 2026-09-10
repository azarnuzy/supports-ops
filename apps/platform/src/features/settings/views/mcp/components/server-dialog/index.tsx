import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import type { ServerDialogProps } from "./index.types";

export default function ServerDialog({
  open,
  onOpenChange,
  mode,
  form,
  onChange,
  onSubmit,
  isPending,
}: ServerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Add MCP Server" : "Edit MCP Server"}</DialogTitle>
            <DialogDescription>Remote Streamable HTTP MCP Servers only.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="mcp-name">Name</FieldLabel>
            <Input
              id="mcp-name"
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mcp-url">URL</FieldLabel>
            <Input
              id="mcp-url"
              required
              type="url"
              value={form.url}
              onChange={(event) => onChange({ url: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="mcp-bearer">Bearer token</FieldLabel>
            <Input
              id="mcp-bearer"
              type="password"
              placeholder={mode === "edit" ? "Leave blank to keep current" : ""}
              value={form.bearerToken}
              onChange={(event) =>
                onChange({ bearerToken: event.target.value, clearBearerToken: false })
              }
            />
            {mode === "edit" ? (
              <FieldDescription>
                <button
                  type="button"
                  className="text-destructive underline"
                  onClick={() => onChange({ bearerToken: "", clearBearerToken: true })}
                >
                  {form.clearBearerToken ? "Will clear on save" : "Clear stored token"}
                </button>
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="mcp-headers">Secret headers (JSON object)</FieldLabel>
            <Textarea
              id="mcp-headers"
              rows={3}
              className="font-mono text-xs"
              placeholder={mode === "edit" ? "Leave blank to keep current" : '{"X-Api-Key":"..."}'}
              value={form.secretHeaders}
              onChange={(event) =>
                onChange({ secretHeaders: event.target.value, clearSecretHeaders: false })
              }
            />
            {mode === "edit" ? (
              <FieldDescription>
                <button
                  type="button"
                  className="text-destructive underline"
                  onClick={() => onChange({ secretHeaders: "", clearSecretHeaders: true })}
                >
                  {form.clearSecretHeaders ? "Will clear on save" : "Clear stored headers"}
                </button>
              </FieldDescription>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Add Server" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

/** Muted, hover-raised clear affordance — destructive on intent, quiet on the eye. */
function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

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
      {/* Bounded height: header and footer stay visible, only the fields scroll. The flex column
       * also keeps wide children from widening the layout — nothing scrolls sideways. */}
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <DialogHeader className="shrink-0 border-b p-5">
            <DialogTitle>{mode === "create" ? "Add MCP Server" : "Edit MCP Server"}</DialogTitle>
            <DialogDescription>Remote Streamable HTTP MCP Servers only.</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
            <Field>
              <FieldLabel htmlFor="mcp-name">Name</FieldLabel>
              <Input
                id="mcp-name"
                required
                maxLength={100}
                placeholder="e.g. Shopify - Northstar Outfitters"
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
                placeholder="https://your-server.example.com/mcp"
                value={form.url}
                onChange={(event) => onChange({ url: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="mcp-bearer">Bearer token</FieldLabel>
              <Input
                id="mcp-bearer"
                type="password"
                placeholder={
                  mode === "edit"
                    ? "Leave blank to keep current"
                    : "Paste the token the server expects"
                }
                value={form.bearerToken}
                onChange={(event) =>
                  onChange({ bearerToken: event.target.value, clearBearerToken: false })
                }
              />
              {mode === "edit" ? (
                <FieldDescription>
                  <ClearButton
                    label={form.clearBearerToken ? "Will clear on save" : "Clear stored token"}
                    onClick={() => onChange({ bearerToken: "", clearBearerToken: true })}
                  />
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="mcp-headers">Secret headers (JSON object)</FieldLabel>
              <Textarea
                id="mcp-headers"
                rows={3}
                className="max-h-40 font-mono text-xs"
                placeholder={
                  mode === "edit" ? "Leave blank to keep current" : '{"X-Api-Key":"..."}'
                }
                value={form.secretHeaders}
                onChange={(event) =>
                  onChange({ secretHeaders: event.target.value, clearSecretHeaders: false })
                }
              />
              {mode === "edit" ? (
                <FieldDescription>
                  <ClearButton
                    label={form.clearSecretHeaders ? "Will clear on save" : "Clear stored headers"}
                    onClick={() => onChange({ secretHeaders: "", clearSecretHeaders: true })}
                  />
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="mcp-static-arguments">
                Static arguments (JSON object, merged into every tool call)
              </FieldLabel>
              <Textarea
                id="mcp-static-arguments"
                rows={3}
                className="max-h-40 font-mono text-xs"
                placeholder={
                  mode === "edit"
                    ? "Leave blank to keep current"
                    : '{"meta":{"ucp-agent":{"profile":"..."}}}'
                }
                value={form.staticArguments}
                onChange={(event) =>
                  onChange({ staticArguments: event.target.value, clearStaticArguments: false })
                }
              />
              <FieldDescription>
                Always overrides matching keys the model sends, e.g. a UCP agent profile URL.
              </FieldDescription>
              {mode === "edit" ? (
                <FieldDescription>
                  <ClearButton
                    label={
                      form.clearStaticArguments ? "Will clear on save" : "Clear stored arguments"
                    }
                    onClick={() => onChange({ staticArguments: "", clearStaticArguments: true })}
                  />
                </FieldDescription>
              ) : null}
            </Field>
          </div>

          <DialogFooter className="shrink-0 border-t p-4">
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

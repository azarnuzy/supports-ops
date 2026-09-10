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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import type { HttpMethod, ToolRisk } from "@repo/api-client";
import type { HttpToolDialogProps } from "./index.types";

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export default function HttpToolDialog({
  open,
  onOpenChange,
  mode,
  form,
  onChange,
  onSubmit,
  isPending,
  hasBearerToken,
  hasSecretHeaders,
}: HttpToolDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <form className="grid gap-5" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create HTTP Tool" : "Edit HTTP Tool"}</DialogTitle>
            <DialogDescription>
              GET requests send input as query parameters; other methods send it as JSON.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="http-tool-name">Name</FieldLabel>
            <Input
              id="http-tool-name"
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="http-tool-description">Description</FieldLabel>
            <Textarea
              id="http-tool-description"
              required
              maxLength={2000}
              value={form.description}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Field>
              <FieldLabel htmlFor="http-tool-method">Method</FieldLabel>
              <Select
                value={form.method}
                onValueChange={(value) => onChange({ method: value as HttpMethod })}
              >
                <SelectTrigger id="http-tool-method" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="http-tool-url">URL</FieldLabel>
              <Input
                id="http-tool-url"
                required
                type="url"
                value={form.url}
                onChange={(event) => onChange({ url: event.target.value })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="http-tool-risk">Risk</FieldLabel>
            <Select
              value={form.risk}
              onValueChange={(value) => onChange({ risk: value as ToolRisk })}
            >
              <SelectTrigger id="http-tool-risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="READ_ONLY">Read-only</SelectItem>
                <SelectItem value="MUTATING">Mutating</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="http-tool-schema">Input JSON Schema</FieldLabel>
            <Textarea
              id="http-tool-schema"
              required
              rows={6}
              className="font-mono text-xs"
              value={form.inputSchema}
              onChange={(event) => onChange({ inputSchema: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="http-tool-bearer">Bearer token</FieldLabel>
            <Input
              id="http-tool-bearer"
              type="password"
              placeholder={hasBearerToken ? "Configured — leave blank to keep" : "Not configured"}
              value={form.bearerToken}
              onChange={(event) =>
                onChange({ bearerToken: event.target.value, clearBearerToken: false })
              }
            />
            {hasBearerToken ? (
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
            <FieldLabel htmlFor="http-tool-headers">Secret headers (JSON object)</FieldLabel>
            <Textarea
              id="http-tool-headers"
              rows={3}
              className="font-mono text-xs"
              placeholder={
                hasSecretHeaders ? "Configured — leave blank to keep" : '{"X-Api-Key":"..."}'
              }
              value={form.secretHeaders}
              onChange={(event) =>
                onChange({ secretHeaders: event.target.value, clearSecretHeaders: false })
              }
            />
            {hasSecretHeaders ? (
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
              {isPending ? "Saving…" : mode === "create" ? "Create Tool" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

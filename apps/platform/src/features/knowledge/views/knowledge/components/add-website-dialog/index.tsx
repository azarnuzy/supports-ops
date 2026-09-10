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
import { Input } from "@repo/ui/components/input";
import VisibilitySelect from "../visibility-select";
import type { AddWebsiteDialogProps } from "./index.types";

export default function AddWebsiteDialog({
  open,
  onOpenChange,
  url,
  setUrl,
  visibility,
  setVisibility,
  onSubmit,
  isPending,
}: AddWebsiteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add Website</DialogTitle>
            <DialogDescription>Import pages from one documentation website.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="knowledge-url">Website URL</FieldLabel>
            <Input
              id="knowledge-url"
              required
              placeholder="https://docs.example.com"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <VisibilitySelect value={visibility} onChange={setVisibility} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!url.trim() || isPending} type="submit">
              {isPending ? "Starting..." : "Add Website"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

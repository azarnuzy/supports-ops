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
import { Textarea } from "@repo/ui/components/textarea";
import VisibilitySelect from "../visibility-select";
import type { AddTextDialogProps } from "./index.types";

export default function AddTextDialog({
  open,
  onOpenChange,
  title,
  setTitle,
  content,
  setContent,
  visibility,
  setVisibility,
  onSubmit,
  isPending,
}: AddTextDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Create Text</DialogTitle>
            <DialogDescription>Create a Knowledge Source from text.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="knowledge-title">Title</FieldLabel>
            <Input id="knowledge-title" required value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="knowledge-content">Content</FieldLabel>
            <Textarea
              id="knowledge-content"
              required
              rows={7}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
          <VisibilitySelect value={visibility} onChange={setVisibility} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!title.trim() || !content.trim() || isPending} type="submit">
              {isPending ? "Creating..." : "Create Text"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

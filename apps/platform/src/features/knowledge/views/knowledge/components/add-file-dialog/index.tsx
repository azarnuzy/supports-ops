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
import type { AddFileDialogProps } from "./index.types";

export default function AddFileDialog({
  open,
  onOpenChange,
  file,
  setFile,
  visibility,
  setVisibility,
  onSubmit,
  isPending,
}: AddFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add File</DialogTitle>
            <DialogDescription>Upload one PDF, up to 25 MB.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="knowledge-file">PDF file</FieldLabel>
            <Input
              accept="application/pdf"
              id="knowledge-file"
              required
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          <VisibilitySelect value={visibility} onChange={setVisibility} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!file || isPending} type="submit">
              {isPending ? "Uploading..." : "Add File"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

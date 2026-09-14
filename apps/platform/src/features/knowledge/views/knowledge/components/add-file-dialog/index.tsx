import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { FileIcon, UploadIcon, XIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import VisibilitySelect from "../visibility-select";
import type { AddFileDialogProps } from "./index.types";

export default function AddFileDialog({
  open,
  onOpenChange,
  files,
  setFiles,
  visibility,
  setVisibility,
  onSubmit,
  isPending,
}: AddFileDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles([...files, ...Array.from(list)]);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, fileIndex) => fileIndex !== index));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add Files</DialogTitle>
            <DialogDescription>Upload PDFs, up to 25 MB each.</DialogDescription>
          </DialogHeader>

          <button
            className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging ? "border-primary bg-accent" : "border-muted-foreground/25 hover:bg-accent"
            }`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <UploadIcon className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">Drag & drop PDFs here, or click to browse</span>
            <span className="text-xs text-muted-foreground">Multiple files supported</span>
            <input
              ref={inputRef}
              accept="application/pdf"
              className="hidden"
              multiple
              type="file"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </button>

          {files.length > 0 ? (
            <ul className="grid gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.lastModified}`}
                  className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <button
                    aria-label={`Remove ${file.name}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={() => removeFile(index)}
                  >
                    <XIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <VisibilitySelect value={visibility} onChange={setVisibility} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={files.length === 0 || isPending} type="submit">
              {isPending ? "Uploading..." : `Add ${files.length || ""} File${files.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

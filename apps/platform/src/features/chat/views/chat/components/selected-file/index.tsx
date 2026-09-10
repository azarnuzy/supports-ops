import { FileTextIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { SelectedFileProps } from "./index.types";

export default function SelectedFile({ file, onRemove }: SelectedFileProps) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="flex min-w-0 max-w-48 items-center gap-2 rounded-md bg-muted p-1.5 text-xs text-foreground">
      {previewUrl ? <img alt="" className="size-8 rounded object-cover" src={previewUrl} /> : <FileTextIcon className="size-5 shrink-0" />}
      <span className="truncate">{file.name}</span>
      <button aria-label={`Remove ${file.name}`} onClick={onRemove} type="button"><XIcon className="size-3.5" /></button>
    </div>
  );
}

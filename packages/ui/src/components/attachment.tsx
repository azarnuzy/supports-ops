import * as React from "react";
import { FileIcon } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
function Attachment({ className, state = "done", ...props }: React.ComponentProps<"div"> & { state?: "uploading" | "processing" | "error" | "done" }) { return <div data-slot="attachment" data-state={state} className={cn("flex max-w-full items-center gap-2 rounded-xl border bg-card p-2 text-sm data-[state=error]:border-destructive/40", className)} {...props} />; }
function AttachmentMedia({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="attachment-media" className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted", className)} {...props}><FileIcon className="size-4" /></div>; }
function AttachmentContent({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="attachment-content" className={cn("min-w-0", className)} {...props} />; }
function AttachmentTitle({ className, ...props }: React.ComponentProps<"span">) { return <span data-slot="attachment-title" className={cn("block truncate font-medium", className)} {...props} />; }
function AttachmentDescription({ className, ...props }: React.ComponentProps<"span">) { return <span data-slot="attachment-description" className={cn("block truncate text-xs text-muted-foreground", className)} {...props} />; }
export { Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle };

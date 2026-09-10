import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { FileTextIcon, MoreHorizontalIcon } from "lucide-react";
import {
  formatUpdatedAt,
  sourceTypeLabel,
  statusLabel,
  statusVariant,
  visibilityLabel,
} from "../../knowledge.utils";
import type { KnowledgeSourceRowProps } from "./index.types";

export default function KnowledgeSourceRow({
  source,
  onSelect,
  onDelete,
}: KnowledgeSourceRowProps) {
  return (
    <div
      className="grid cursor-pointer gap-3 border-b p-4 last:border-b-0 hover:bg-accent/50 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate font-medium">{source.title}</p>
        </div>
        <p className="mt-1 truncate pl-6 text-sm text-muted-foreground">
          {source.sourceUrl ?? sourceTypeLabel(source.sourceType)}
        </p>
      </div>
      <Badge variant="outline">{visibilityLabel(source.visibility)}</Badge>
      <Badge variant={statusVariant(source.status)}>
        {source.status === "PROCESSING" && source.stage
          ? statusLabel(source.stage)
          : statusLabel(source.status)}
      </Badge>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Last updated {formatUpdatedAt(source.updatedAt)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${source.title}`}
              size="icon-sm"
              variant="ghost"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

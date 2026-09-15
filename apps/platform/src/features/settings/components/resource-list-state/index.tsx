import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import type { ResourceListStateProps } from "./index.types";

/**
 * The pending/error/empty states a resource list (Tools, MCP Servers, ...) shows in place of its
 * rows. Renders nothing once the list has data, so the caller maps its own rows after this.
 */
export default function ResourceListState({
  isPending,
  skeletonCount = 4,
  isError,
  errorLabel,
  onRetry,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: ResourceListStateProps) {
  if (isPending) {
    return (
      <div className="grid gap-3 p-5">
        {Array.from({ length: skeletonCount }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid place-items-center gap-3 p-12 text-center">
        <p className="text-sm text-destructive">{errorLabel}</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="grid place-items-center gap-3 p-12 text-center">
        <div className="grid size-10 place-items-center rounded-lg bg-muted">{emptyIcon}</div>
        <div className="grid gap-1">
          <p className="text-base font-medium">{emptyTitle}</p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {emptyDescription}
          </p>
        </div>
        {emptyAction ? <div className="mt-1">{emptyAction}</div> : null}
      </div>
    );
  }

  return null;
}

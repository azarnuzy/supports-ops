import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

export function ConsolePageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ConsoleSectionHeading({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold tracking-tight">{title}</h2>;
}

export function ConsoleMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

const statusToneClasses = {
  success: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  warning: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

export function ConsoleStatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof statusToneClasses;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={statusToneClasses[tone]}>
      {children}
    </Badge>
  );
}

export function ConsoleQueryState({
  isPending,
  isError,
  error,
  errorFallback = "Failed to load data.",
  isEmpty = false,
  loadingMessage = "Loading…",
  emptyTitle = "No results",
  emptyDescription,
  onRetry,
  className,
}: {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  errorFallback?: string;
  isEmpty?: boolean;
  loadingMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  className?: string;
}) {
  if (isPending) {
    return (
      <div
        aria-live="polite"
        className={cn(
          "grid min-h-40 place-items-center gap-2 p-8 text-sm text-muted-foreground",
          className,
        )}
      >
        <Spinner />
        {loadingMessage}
      </div>
    );
  }

  if (isError) {
    return (
      <Empty className={cn("min-h-40 border-0 p-6", className)}>
        <EmptyHeader>
          <EmptyTitle className="text-destructive">Data unavailable</EmptyTitle>
          <EmptyDescription>
            {error instanceof Error ? error.message : errorFallback}
          </EmptyDescription>
        </EmptyHeader>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={() => void onRetry()}>
            Try again
          </Button>
        ) : null}
      </Empty>
    );
  }

  if (isEmpty) {
    return (
      <Empty className={cn("min-h-40 border-0 p-6", className)}>
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    );
  }

  return null;
}

export function ConsoleDataTable({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      {children}
      {footer ? <div className="border-t px-4 py-3">{footer}</div> : null}
    </div>
  );
}

export function ConsoleTablePagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

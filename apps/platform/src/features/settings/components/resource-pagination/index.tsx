import { Button } from "@repo/ui/components/button";
import { Pagination, PaginationContent, PaginationItem } from "@repo/ui/components/pagination";
import type { ResourcePaginationProps } from "./index.types";

/** Prev/next pager for an in-memory (already-fetched) resource list. */
export default function ResourcePagination({ page, pageCount, onPageChange }: ResourcePaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <Pagination className="justify-between border-t px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
        </PaginationItem>
        <PaginationItem>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

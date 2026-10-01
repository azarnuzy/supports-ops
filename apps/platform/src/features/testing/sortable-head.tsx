import type { ComponentProps } from "react";
import { TableHead } from "@repo/ui/components/table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import type { TableSort } from "@repo/shared/table-sort";

export function SortableHead({ column, sort, onSort, children, ...props }: ComponentProps<typeof TableHead> & {
  column: string;
  sort: TableSort;
  onSort: () => void;
}) {
  const direction = sort?.column === column ? sort.direction : null;
  const Icon =
    direction === "asc" ? ArrowUpIcon : direction === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
  return (
    <TableHead
      {...props}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        className="flex h-full w-full items-center gap-1 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        onClick={onSort}
      >
        {children}
        <Icon aria-hidden="true" className="size-3 shrink-0" />
      </button>
    </TableHead>
  );
}

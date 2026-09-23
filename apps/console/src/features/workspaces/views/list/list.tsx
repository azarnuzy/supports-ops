import { fetchOperatorWorkspaces } from "@repo/api-client";
import { Input } from "@repo/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleTablePagination,
} from "../../../console/components/console-patterns";
import { ConsoleShell } from "../../../console/shell";

const LIMIT = 20;

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export default function WorkspacesListView() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const workspaces = useQuery({
    queryKey: ["operator", "workspaces", debouncedSearch, page],
    queryFn: () =>
      fetchOperatorWorkspaces(api, { search: debouncedSearch || undefined, page, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });

  const total = workspaces.data?.total ?? 0;
  const workspaceRows = workspaces.data?.workspaces ?? [];
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <ConsoleShell>
      <ConsolePageHeader
        title="Workspaces"
        description="Search and monitor Workspace usage."
        actions={
          <Input
            className="w-full sm:w-80"
            placeholder="Search by name or slug"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />
      <ConsoleDataTable
        footer={
          !workspaces.isError && pageCount > 1 ? (
            <ConsoleTablePagination
              page={page}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null
        }
      >
        {workspaces.isPending || workspaces.isError || workspaceRows.length === 0 ? (
          <ConsoleQueryState
            isPending={workspaces.isPending}
            isError={workspaces.isError}
            error={workspaces.error}
            errorFallback="Failed to load Workspaces."
            isEmpty={
              !workspaces.isPending &&
              !workspaces.isError &&
              workspaceRows.length === 0
            }
            emptyTitle={debouncedSearch ? "No Workspaces match your search" : "No Workspaces yet"}
            emptyDescription={
              debouncedSearch ? "Try another Workspace name or slug." : undefined
            }
            onRetry={() => void workspaces.refetch()}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Unlimited Period</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">30-day spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaceRows.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell>
                    <Link
                      to="/workspaces/$workspaceId"
                      params={{ workspaceId: workspace.id }}
                      className="font-medium hover:underline"
                    >
                      {workspace.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{workspace.slug}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numberFormat.format(workspace.userCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numberFormat.format(workspace.balance)}
                  </TableCell>
                  <TableCell>
                    {workspace.activeUnlimitedPeriod
                      ? `Until ${formatDate(workspace.activeUnlimitedPeriod.endAt)}`
                      : "—"}
                  </TableCell>
                  <TableCell>{formatDate(workspace.lastCustomerActivityAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {numberFormat.format(workspace.creditSpend30Days)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleDataTable>
    </ConsoleShell>
  );
}

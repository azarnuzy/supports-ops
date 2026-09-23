import { fetchOperatorWorkspaces } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
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
import { ConsoleShell } from "../../../console/shell";
import { api } from "../../../../lib/auth";

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
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <ConsoleShell>
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <Input
          className="mt-6 max-w-sm"
          placeholder="Search by name or slug"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Unlimited Period</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>30-day spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.isPending ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : workspaces.isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-destructive">
                    Failed to load Workspaces.
                  </TableCell>
                </TableRow>
              ) : workspaces.data.workspaces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No Workspaces match.
                  </TableCell>
                </TableRow>
              ) : (
                workspaces.data.workspaces.map((workspace) => (
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
                    <TableCell>{numberFormat.format(workspace.userCount)}</TableCell>
                    <TableCell>{numberFormat.format(workspace.balance)}</TableCell>
                    <TableCell>
                      {workspace.activeUnlimitedPeriod
                        ? `Until ${formatDate(workspace.activeUnlimitedPeriod.endAt)}`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatDate(workspace.lastCustomerActivityAt)}</TableCell>
                    <TableCell>{numberFormat.format(workspace.creditSpend30Days)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </ConsoleShell>
  );
}

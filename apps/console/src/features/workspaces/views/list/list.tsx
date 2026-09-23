import { fetchOperatorWorkspaces, type OperatorAttentionCondition } from "@repo/api-client";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
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
  attentionConditionLabel,
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleTablePagination,
} from "../../../console/components/console-patterns";
import { ConsoleShell } from "../../../console/shell";

const LIMIT = 20;
const ALL_ATTENTION = "ALL";
const sortOptions = [
  { value: "createdAt", label: "Newest first" },
  { value: "name", label: "Name (A–Z)" },
] as const;
const attentionOptions: OperatorAttentionCondition[] = [
  "CREDIT_EXHAUSTED",
  "LOW_BALANCE",
  "UNLIMITED_ENDING_SOON",
  "INACTIVE",
];

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export default function WorkspacesListView() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<(typeof sortOptions)[number]["value"]>("createdAt");
  const [attention, setAttention] = useState<OperatorAttentionCondition | typeof ALL_ATTENTION>(
    ALL_ATTENTION,
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const workspaces = useQuery({
    queryKey: ["operator", "workspaces", debouncedSearch, sortBy, attention, page],
    queryFn: () =>
      fetchOperatorWorkspaces(api, {
        search: debouncedSearch || undefined,
        page,
        limit: LIMIT,
        sortBy,
        attention: attention === ALL_ATTENTION ? undefined : attention,
      }),
    placeholderData: keepPreviousData,
  });

  const total = workspaces.data?.total ?? 0;
  const workspaceRows = workspaces.data?.workspaces ?? [];
  const pageCount = Math.max(1, Math.ceil(total / LIMIT));
  const isFiltered = Boolean(debouncedSearch) || attention !== ALL_ATTENTION;

  return (
    <ConsoleShell>
      <ConsolePageHeader
        title="Workspaces"
        description="Search and monitor Workspace usage."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-full sm:w-64"
              placeholder="Search by name or slug"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <NativeSelect
              aria-label="Sort by"
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as (typeof sortOptions)[number]["value"]);
                setPage(1);
              }}
            >
              {sortOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Attention filter"
              value={attention}
              onChange={(event) => {
                setAttention(
                  event.target.value as OperatorAttentionCondition | typeof ALL_ATTENTION,
                );
                setPage(1);
              }}
            >
              <NativeSelectOption value={ALL_ATTENTION}>All Workspaces</NativeSelectOption>
              {attentionOptions.map((condition) => (
                <NativeSelectOption key={condition} value={condition}>
                  {attentionConditionLabel[condition]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Link
              to="/$section"
              params={{ section: "billing-credits" }}
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              Billing & Credits →
            </Link>
          </div>
        }
      />
      <ConsoleDataTable
        footer={
          !workspaces.isError && pageCount > 1 ? (
            <ConsoleTablePagination page={page} pageCount={pageCount} onPageChange={setPage} />
          ) : null
        }
      >
        {workspaces.isPending || workspaces.isError || workspaceRows.length === 0 ? (
          <ConsoleQueryState
            isPending={workspaces.isPending}
            isError={workspaces.isError}
            error={workspaces.error}
            errorFallback="Failed to load Workspaces."
            isEmpty={!workspaces.isPending && !workspaces.isError && workspaceRows.length === 0}
            emptyTitle={
              isFiltered ? "No Workspaces match this search and filter" : "No Workspaces yet"
            }
            emptyDescription={
              isFiltered ? "Try another Workspace name, slug, or attention filter." : undefined
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
                <TableHead className="text-right">Credit spend (30d)</TableHead>
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

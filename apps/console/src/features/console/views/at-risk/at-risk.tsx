import { changeOrganizationUnlimitedPeriod } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CalendarClockIcon,
  LinkIcon,
  MessageSquareIcon,
  WalletIcon,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../../../lib/api";
import { TopUpDialog } from "../../../workspaces/views/detail/components/top-up-dialog";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
  ConsoleTablePagination,
} from "../../components/console-patterns";
import DateRangePicker, {
  trailingRange,
  type ConsoleDateRange,
} from "../../components/date-range-picker";

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const LIMIT = 10;

const financialTypes = ["CREDIT_EXHAUSTED", "LOW_BALANCE", "UNLIMITED_ENDING_SOON"] as const;
type FinancialIssue = (typeof financialTypes)[number];
const operationalTypes = ["INACTIVE", "CHANNEL_ISSUE", "KNOWLEDGE_INGESTION_ISSUE"] as const;
type OperationalIssue = (typeof operationalTypes)[number];

export type AtRiskWorkspace = Awaited<ReturnType<typeof fetchAtRisk>>["workspaces"][number];
export type AtRiskOrganization = Awaited<ReturnType<typeof fetchAtRisk>>["organizations"][number];
type Workspace = AtRiskWorkspace;
type Organization = AtRiskOrganization;
type Row = { workspace: Workspace; issue: OperationalIssue };
type OrgRow = { organization: Organization; issue: FinancialIssue };
type Sort = "severity" | "workspace" | "issue" | "sessions" | "lastMessage";
type OrgSort = "severity" | "organization" | "issue" | "balance";

const financialCards = [
  {
    key: "credits",
    title: "Low or exhausted credits",
    hint: "Balance below 100 credits",
    issues: ["CREDIT_EXHAUSTED", "LOW_BALANCE"],
    icon: WalletIcon,
  },
  {
    key: "unlimited",
    title: "Unlimited period expiring",
    hint: "Ending within 7 days",
    issues: ["UNLIMITED_ENDING_SOON"],
    icon: CalendarClockIcon,
  },
] as const;
const operationalCards = [
  {
    key: "inactive",
    title: "No customer activity",
    hint: "No customer message for 14+ days",
    issues: ["INACTIVE"],
    icon: MessageSquareIcon,
  },
  {
    key: "channel",
    title: "Channel issues",
    hint: "Inactive or connection error",
    issues: ["CHANNEL_ISSUE"],
    icon: LinkIcon,
  },
  {
    key: "knowledge",
    title: "Knowledge ingestion issue",
    hint: "Failed ingestion",
    issues: ["KNOWLEDGE_INGESTION_ISSUE"],
    icon: BookOpenIcon,
  },
] as const;
const highFinancial = (issue: FinancialIssue) => issue === "CREDIT_EXHAUSTED";
const highOperational = (issue: OperationalIssue) => issue === "CHANNEL_ISSUE";
const date = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "Never");
const externalStatus = (status: number | null) =>
  status === 429
    ? "Rate limited"
    : status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status && status >= 500
          ? "Provider error"
          : "Request failed";

async function fetchAtRisk(query?: ConsoleDateRange) {
  const response = await api.operator["at-risk"].$get({ query: query ?? {} });
  if (!response.ok) throw new Error("Failed to load at-risk workspaces.");
  return response.json();
}

export const operatorAtRiskQueryOptions = queryOptions({
  queryKey: ["operator", "at-risk"] as const,
  queryFn: () => fetchAtRisk(),
  refetchInterval: 60_000,
});
export const conditionLabel: Record<string, string> = {
  CREDIT_EXHAUSTED: "Credits exhausted",
  LOW_BALANCE: "Credits low",
  UNLIMITED_ENDING_SOON: "Unlimited period ending soon",
  INACTIVE: "No customer activity",
  CHANNEL_ISSUE: "Channel issue",
  KNOWLEDGE_INGESTION_ISSUE: "Knowledge ingestion failed",
};
export const conditionTone: Record<string, "danger" | "warning" | "neutral"> = {
  CREDIT_EXHAUSTED: "danger",
  LOW_BALANCE: "warning",
  UNLIMITED_ENDING_SOON: "warning",
  INACTIVE: "neutral",
  CHANNEL_ISSUE: "danger",
  KNOWLEDGE_INGESTION_ISSUE: "warning",
};

function ExtendOrganizationDialog({
  organization,
  close,
}: {
  organization: Organization;
  close: () => void;
}) {
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => changeOrganizationUnlimitedPeriod(api, organization.id, "extend", endDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["operator", "at-risk"] });
      void queryClient.invalidateQueries({ queryKey: ["operator", "organizations"] });
      close();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend Unlimited Period</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {organization.name} · Current end:{" "}
          {date(organization.activeUnlimitedPeriod?.endAt ?? null)}
        </p>
        <Input
          aria-label="New end date"
          type="date"
          min={
            organization.activeUnlimitedPeriod?.endAt
              ? new Date(new Date(organization.activeUnlimitedPeriod.endAt).getTime() + 86_400_000)
                  .toISOString()
                  .slice(0, 10)
              : new Date().toISOString().slice(0, 10)
          }
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        {mutation.isError && (
          <p className="text-sm text-destructive">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Could not extend the period."}
          </p>
        )}
        <Button disabled={!endDate || mutation.isPending} onClick={() => mutation.mutate()}>
          Extend period
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function FinancialRiskSection({
  organizations,
  isPending,
  isError,
  error,
  onRetry,
}: {
  organizations: Organization[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<OrgSort>("severity");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [topUp, setTopUp] = useState<Organization | null>(null);
  const [extend, setExtend] = useState<Organization | null>(null);

  const rows: OrgRow[] = organizations.flatMap((organization) =>
    organization.conditions.map((issue) => ({ organization, issue })),
  );
  const count = (issues: readonly string[]) =>
    new Set(rows.filter((row) => issues.includes(row.issue)).map((row) => row.organization.id))
      .size;
  const filtered = rows.filter(
    ({ organization, issue }) =>
      (category === "all" ||
        financialCards
          .find((card) => card.key === category)
          ?.issues.some((value) => value === issue)) &&
      organization.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const value = (row: OrgRow) =>
    sort === "organization"
      ? row.organization.name
      : sort === "issue"
        ? conditionLabel[row.issue]
        : sort === "balance"
          ? row.organization.balance
          : highFinancial(row.issue)
            ? 0
            : 1;
  const sorted = [...filtered].sort((a, b) => {
    const left = value(a),
      right = value(b);
    const difference =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return (
      (direction === "asc" ? difference : -difference) ||
      a.organization.name.localeCompare(b.organization.name) ||
      a.issue.localeCompare(b.issue)
    );
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / LIMIT));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * LIMIT, currentPage * LIMIT);
  const heading = (label: string, key: OrgSort) => (
    <button
      type="button"
      onClick={() => {
        if (sort === key) setDirection(direction === "asc" ? "desc" : "asc");
        else {
          setSort(key);
          setDirection("asc");
        }
        setPage(1);
      }}
    >
      {label} {sort === key ? (direction === "asc" ? "↑" : "↓") : "↕"}
    </button>
  );
  const detail = (organization: Organization, issue: FinancialIssue) =>
    issue === "UNLIMITED_ENDING_SOON"
      ? `Ends ${date(organization.activeUnlimitedPeriod?.endAt ?? null)}`
      : `${numberFormat.format(organization.balance)} credits shared across ${organization.workspaceCount} Workspace${organization.workspaceCount === 1 ? "" : "s"}`;

  return (
    <>
      <h2 className="text-lg font-semibold">Organization financial risk</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {financialCards.map((card) => (
          <Card key={card.key} className="gap-0 py-0">
            <CardContent className="flex min-h-28 items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{count(card.issues)}</p>
                <p className="mt-1 text-sm font-medium">{card.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={category === "all" ? "secondary" : "outline"}
          onClick={() => {
            setCategory("all");
            setPage(1);
          }}
        >
          All {rows.length}
        </Button>
        {financialCards.map((card) => (
          <Button
            key={card.key}
            size="sm"
            variant={category === card.key ? "secondary" : "outline"}
            onClick={() => {
              setCategory(card.key);
              setPage(1);
            }}
          >
            {card.title} {count(card.issues)}
          </Button>
        ))}
      </div>
      <Input
        className="max-w-sm"
        aria-label="Search organization"
        placeholder="Search Organization by name..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      <ConsoleDataTable>
        {isPending || isError || !visible.length ? (
          <ConsoleQueryState
            isPending={isPending}
            isError={isError}
            error={error}
            isEmpty={!isPending && !isError && !visible.length}
            emptyTitle="No matching issues"
            emptyDescription="No Organization needs financial review right now."
            onRetry={onRetry}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{heading("Organization", "organization")}</TableHead>
                  <TableHead>{heading("Issue", "issue")}</TableHead>
                  <TableHead>Current status</TableHead>
                  <TableHead>{heading("Balance", "balance")}</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ organization, issue }) => (
                  <TableRow key={`${organization.id}-${issue}`}>
                    <TableCell>
                      <Link
                        to="/organizations/$organizationId"
                        params={{ organizationId: organization.id }}
                        className="font-medium hover:underline"
                      >
                        {organization.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {conditionLabel[issue]}
                      <p className="text-xs text-muted-foreground">{detail(organization, issue)}</p>
                    </TableCell>
                    <TableCell>
                      <ConsoleStatusBadge tone={conditionTone[issue]}>
                        {conditionLabel[issue]}
                      </ConsoleStatusBadge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {numberFormat.format(organization.balance)}
                    </TableCell>
                    <TableCell>
                      {issue === "UNLIMITED_ENDING_SOON" ? (
                        <Button size="sm" variant="outline" onClick={() => setExtend(organization)}>
                          Extend period
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setTopUp(organization)}>
                          Top up credits
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ConsoleDataTable>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Showing {visible.length} of {sorted.length} results
        </span>
        <ConsoleTablePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      </div>
      {topUp && (
        <TopUpDialog
          organizationId={topUp.id}
          balance={topUp.balance}
          open
          onOpenChange={(open) => {
            if (!open) setTopUp(null);
          }}
        />
      )}
      {extend && <ExtendOrganizationDialog organization={extend} close={() => setExtend(null)} />}
    </>
  );
}

export default function AtRiskView() {
  const [range, setRange] = useState(() => trailingRange(30));
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<Sort>("severity");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["operator", "at-risk", range],
    queryFn: () => fetchAtRisk(range),
    refetchInterval: 60_000,
  });
  const organizations = query.data?.organizations ?? [];
  const rows: Row[] = (query.data?.workspaces ?? []).flatMap((workspace) =>
    workspace.conditions.map((issue) => ({ workspace, issue: issue as OperationalIssue })),
  );
  const externalGroups = new Map<string, NonNullable<typeof query.data>["externalErrors"]>();
  for (const error of query.data?.externalErrors ?? []) {
    const key = JSON.stringify([
      error.provider,
      error.operation,
      error.modelId,
      error.code,
      error.httpStatus,
    ]);
    externalGroups.set(key, [...(externalGroups.get(key) ?? []), error]);
  }
  const count = (issues: readonly string[]) =>
    new Set(rows.filter((row) => issues.includes(row.issue)).map((row) => row.workspace.id)).size;
  const filtered = rows.filter(
    ({ workspace, issue }) =>
      (category === "all" ||
        operationalCards
          .find((card) => card.key === category)
          ?.issues.some((value) => value === issue)) &&
      (severity === "all" || (highOperational(issue) ? "high" : "medium") === severity) &&
      (channel === "all" ||
        (issue === "CHANNEL_ISSUE"
          ? workspace.channelIssues.some((item) => item.type === channel)
          : workspace.channels.includes(channel as "WEB" | "WHATSAPP"))) &&
      `${workspace.name} ${workspace.slug}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const value = (row: Row) =>
    sort === "workspace"
      ? row.workspace.name
      : sort === "issue"
        ? conditionLabel[row.issue]
        : sort === "sessions"
          ? row.workspace.sessionCount
          : sort === "lastMessage"
            ? row.workspace.lastCustomerActivityAt
              ? new Date(row.workspace.lastCustomerActivityAt).getTime()
              : -1
            : highOperational(row.issue)
              ? 0
              : 1;
  const sorted = [...filtered].sort((a, b) => {
    const left = value(a),
      right = value(b);
    const difference =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return (
      (direction === "asc" ? difference : -difference) ||
      a.workspace.name.localeCompare(b.workspace.name) ||
      a.issue.localeCompare(b.issue)
    );
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / LIMIT));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * LIMIT, currentPage * LIMIT);
  const reset = () => {
    setCategory("all");
    setSearch("");
    setSeverity("all");
    setChannel("all");
    setPage(1);
  };
  const heading = (label: string, key: Sort) => (
    <button
      type="button"
      onClick={() => {
        if (sort === key) setDirection(direction === "asc" ? "desc" : "asc");
        else {
          setSort(key);
          setDirection("asc");
        }
        setPage(1);
      }}
    >
      {label} {sort === key ? (direction === "asc" ? "↑" : "↓") : "↕"}
    </button>
  );
  const detail = (workspace: Workspace, issue: OperationalIssue) =>
    issue === "INACTIVE"
      ? `Last message ${date(workspace.lastCustomerActivityAt)}`
      : issue === "KNOWLEDGE_INGESTION_ISSUE"
        ? `${workspace.failedKnowledgeSources} failed sources`
        : workspace.channelIssues.map((item) => `${item.type}: ${item.reason}`).join(", ");

  return (
    <>
      <ConsolePageHeader
        title="Needs attention"
        description="Organizations and Workspaces that require operator action or monitoring."
        actions={
          <DateRangePicker
            range={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
        }
      />
      <section aria-label="External service errors" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">External service errors</h2>
          <p className="text-sm text-muted-foreground">
            All-time failures remain here until a recovery rule is defined. This error log stores
            metadata only.
          </p>
        </div>
        <ConsoleDataTable>
          {query.isPending || query.isError || !externalGroups.size ? (
            <ConsoleQueryState
              isPending={query.isPending}
              isError={query.isError}
              error={query.error}
              isEmpty={!query.isPending && !query.isError && !externalGroups.size}
              emptyTitle="No external errors recorded"
              onRetry={() => void query.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[850px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider / operation</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Occurrences</TableHead>
                    <TableHead>Workspaces</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...externalGroups.entries()].map(([key, group]) => {
                    const first = group[0];
                    if (!first) return null;
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          {first.provider}
                          <p className="text-xs text-muted-foreground">
                            {first.operation}
                            {first.modelId ? ` · ${first.modelId}` : ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{externalStatus(first.httpStatus)}</span>
                          <br />
                          {first.httpStatus
                            ? `HTTP ${first.httpStatus}`
                            : (first.code ?? "Unknown")}
                          {first.httpStatus && first.code && first.code !== "Error"
                            ? ` · ${first.code}`
                            : ""}
                        </TableCell>
                        <TableCell>
                          {numberFormat.format(group.reduce((sum, item) => sum + item.count, 0))}
                        </TableCell>
                        <TableCell>
                          {new Set(group.map((item) => item.workspaceId).filter(Boolean)).size ||
                            "Platform"}
                        </TableCell>
                        <TableCell>
                          {new Date(
                            Math.max(
                              ...group.map((item) => new Date(String(item.lastAt)).getTime()),
                            ),
                          ).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer">Details</summary>
                            <div className="mt-2 space-y-1 text-xs">
                              {group.map((item) => (
                                <p key={`${item.workspaceId}-${item.resourceId}`}>
                                  {item.workspaceId ? (
                                    <Link
                                      to="/workspaces/$workspaceId"
                                      params={{ workspaceId: item.workspaceId }}
                                      className="underline"
                                    >
                                      Workspace {item.workspaceId}
                                    </Link>
                                  ) : (
                                    "Platform"
                                  )}
                                  {` · ${item.count} times · first ${new Date(String(item.firstAt)).toLocaleString()} · last ${new Date(String(item.lastAt)).toLocaleString()}`}
                                  {item.resourceType && item.resourceId
                                    ? ` · ${item.resourceType} ${item.resourceId}`
                                    : ""}
                                </p>
                              ))}
                            </div>
                          </details>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </ConsoleDataTable>
        {(query.data?.externalEvents.length ?? 0) > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Latest 100 error occurrences
            </summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Provider / operation</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Workspace / resource</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data?.externalEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{new Date(String(event.createdAt)).toLocaleString()}</TableCell>
                      <TableCell>
                        {event.provider} · {event.operation}
                        {event.modelId ? ` · ${event.modelId}` : ""}
                      </TableCell>
                      <TableCell>
                        {externalStatus(event.httpStatus)} ·{" "}
                        {event.httpStatus ? `HTTP ${event.httpStatus}` : (event.code ?? "Unknown")}
                        {event.httpStatus && event.code && event.code !== "Error"
                          ? ` · ${event.code}`
                          : ""}
                      </TableCell>
                      <TableCell>
                        {event.workspaceId ? (
                          <Link
                            to="/workspaces/$workspaceId"
                            params={{ workspaceId: event.workspaceId }}
                            className="underline"
                          >
                            {event.workspaceId}
                          </Link>
                        ) : (
                          "Platform"
                        )}
                        {event.resourceType && event.resourceId
                          ? ` · ${event.resourceType} ${event.resourceId}`
                          : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}
      </section>
      <FinancialRiskSection
        organizations={organizations}
        isPending={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      <h2 className="text-lg font-semibold">Workspace operations</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {operationalCards.map((card) => (
          <Card key={card.key} className="gap-0 py-0">
            <CardContent className="flex min-h-28 items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{count(card.issues)}</p>
                <p className="mt-1 text-sm font-medium">{card.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={category === "all" ? "secondary" : "outline"}
          onClick={() => {
            setCategory("all");
            setPage(1);
          }}
        >
          All {rows.length}
        </Button>
        {operationalCards.map((card) => (
          <Button
            key={card.key}
            size="sm"
            variant={category === card.key ? "secondary" : "outline"}
            onClick={() => {
              setCategory(card.key);
              setPage(1);
            }}
          >
            {card.title} {count(card.issues)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-56 flex-1"
          aria-label="Search workspace"
          placeholder="Search workspace by name or slug..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          value={severity}
          onValueChange={(value) => {
            setSeverity(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Severity filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={channel}
          onValueChange={(value) => {
            setChannel(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Channel filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="WEB">Web Widget</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={reset}>
          Clear filters
        </Button>
      </div>
      <ConsoleDataTable>
        {query.isPending || query.isError || !visible.length ? (
          <ConsoleQueryState
            isPending={query.isPending}
            isError={query.isError}
            error={query.error}
            isEmpty={!query.isPending && !query.isError && !visible.length}
            emptyTitle="No matching issues"
            onRetry={() => void query.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[1050px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{heading("Workspace", "workspace")}</TableHead>
                  <TableHead>{heading("Issue", "issue")}</TableHead>
                  <TableHead>Current status</TableHead>
                  <TableHead>{heading("Key metrics", "sessions")}</TableHead>
                  <TableHead>{heading("Last customer message", "lastMessage")}</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ workspace, issue }) => (
                  <TableRow key={`${workspace.id}-${issue}`}>
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
                    <TableCell>
                      {conditionLabel[issue]}
                      <p className="text-xs text-muted-foreground">{detail(workspace, issue)}</p>
                    </TableCell>
                    <TableCell>
                      <ConsoleStatusBadge tone={conditionTone[issue]}>
                        {conditionLabel[issue]}
                      </ConsoleStatusBadge>
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">
                        {numberFormat.format(workspace.sessionCount)} sessions
                      </span>
                      <p className="text-xs text-muted-foreground">selected range</p>
                    </TableCell>
                    <TableCell>{date(workspace.lastCustomerActivityAt)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }}>
                          View workspace
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ConsoleDataTable>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Showing {visible.length} of {sorted.length} results
        </span>
        <ConsoleTablePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </>
  );
}

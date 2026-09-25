import { extendUnlimitedPeriod } from "@repo/api-client";
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
const types = [
  "CREDIT_EXHAUSTED",
  "LOW_BALANCE",
  "UNLIMITED_ENDING_SOON",
  "INACTIVE",
  "CHANNEL_ISSUE",
  "KNOWLEDGE_INGESTION_ISSUE",
] as const;
type Issue = (typeof types)[number];
export type AtRiskWorkspace = Awaited<ReturnType<typeof fetchAtRisk>>["workspaces"][number];
type Workspace = AtRiskWorkspace;
type Row = { workspace: Workspace; issue: Issue };
type Sort = "severity" | "workspace" | "issue" | "balance" | "sessions" | "lastMessage";
const cards = [
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
const high = (issue: Issue) => issue === "CREDIT_EXHAUSTED" || issue === "CHANNEL_ISSUE";
const date = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "Never");

async function fetchAtRisk(query?: ConsoleDateRange) {
  const response = await api.operator["at-risk"].$get({ query: query ?? {} });
  if (!response.ok) throw new Error("Failed to load at-risk workspaces.");
  return response.json();
}

export const operatorAtRiskQueryOptions = queryOptions({
  queryKey: ["operator", "at-risk"] as const,
  queryFn: () => fetchAtRisk(),
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

function ExtendDialog({ workspace, close }: { workspace: Workspace; close: () => void }) {
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => extendUnlimitedPeriod(api, workspace.id, endDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["operator", "at-risk"] });
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
          {workspace.name} · Current end: {date(workspace.activeUnlimitedPeriod?.endAt ?? null)}
        </p>
        <Input
          aria-label="New end date"
          type="date"
          min={
            workspace.activeUnlimitedPeriod?.endAt
              ? new Date(new Date(workspace.activeUnlimitedPeriod.endAt).getTime() + 86_400_000)
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

export default function AtRiskView() {
  const [range, setRange] = useState(() => trailingRange(30));
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<Sort>("severity");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [topUp, setTopUp] = useState<Workspace | null>(null);
  const [extend, setExtend] = useState<Workspace | null>(null);
  const query = useQuery({
    queryKey: ["operator", "at-risk", range],
    queryFn: () => fetchAtRisk(range),
  });
  const rows: Row[] = (query.data?.workspaces ?? []).flatMap((workspace) =>
    workspace.conditions.map((issue) => ({ workspace, issue: issue as Issue })),
  );
  const count = (issues: readonly string[]) =>
    new Set(rows.filter((row) => issues.includes(row.issue)).map((row) => row.workspace.id)).size;
  const filtered = rows.filter(
    ({ workspace, issue }) =>
      (category === "all" ||
        cards.find((card) => card.key === category)?.issues.some((value) => value === issue)) &&
      (severity === "all" || (high(issue) ? "high" : "medium") === severity) &&
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
        : sort === "balance"
          ? row.workspace.balance
          : sort === "sessions"
            ? row.workspace.sessionCount
            : sort === "lastMessage"
              ? row.workspace.lastCustomerActivityAt
                ? new Date(row.workspace.lastCustomerActivityAt).getTime()
                : -1
              : high(row.issue)
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
  const detail = (workspace: Workspace, issue: Issue) =>
    issue === "UNLIMITED_ENDING_SOON"
      ? `Ends ${date(workspace.activeUnlimitedPeriod?.endAt ?? null)}`
      : issue === "INACTIVE"
        ? `Last message ${date(workspace.lastCustomerActivityAt)}`
        : issue === "KNOWLEDGE_INGESTION_ISSUE"
          ? `${workspace.failedKnowledgeSources} failed sources`
          : issue === "CHANNEL_ISSUE"
            ? workspace.channelIssues.map((item) => `${item.type}: ${item.reason}`).join(", ")
            : `${numberFormat.format(workspace.balance)} credits remaining`;

  return (
    <>
      <ConsolePageHeader
        title="Needs attention"
        description="Workspaces that require operator action or monitoring."
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
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
        {cards.map((card) => (
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
                        {numberFormat.format(workspace.balance)} credits
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {numberFormat.format(workspace.sessionCount)} sessions · selected range
                      </p>
                    </TableCell>
                    <TableCell>{date(workspace.lastCustomerActivityAt)}</TableCell>
                    <TableCell>
                      {issue === "CREDIT_EXHAUSTED" || issue === "LOW_BALANCE" ? (
                        <Button size="sm" variant="outline" onClick={() => setTopUp(workspace)}>
                          Top up credits
                        </Button>
                      ) : issue === "UNLIMITED_ENDING_SOON" ? (
                        <Button size="sm" variant="outline" onClick={() => setExtend(workspace)}>
                          Extend period
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to="/workspaces/$workspaceId"
                            params={{ workspaceId: workspace.id }}
                          >
                            View workspace
                          </Link>
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
          workspaceId={topUp.id}
          balance={topUp.balance}
          open
          onOpenChange={(open) => {
            if (!open) setTopUp(null);
          }}
        />
      )}
      {extend && <ExtendDialog workspace={extend} close={() => setExtend(null)} />}
    </>
  );
}

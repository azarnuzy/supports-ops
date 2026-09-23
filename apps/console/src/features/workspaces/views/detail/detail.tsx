import {
  endUnlimitedPeriodEarly,
  extendUnlimitedPeriod,
  fetchOperatorWorkspaceDetail,
  grantUnlimitedPeriod,
  type UnlimitedPeriod,
} from "@repo/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConsoleShell } from "../../../console/shell";
import { api } from "../../../../lib/api";
import { TopUpDialog } from "./components/top-up-dialog";

const RANGE_PRESETS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormat.format(new Date(value)) : "Never";
}

/** Trailing `days` calendar days ending today, inclusive local dates. */
function trailingRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  const iso = (date: Date) => new Intl.DateTimeFormat("en-CA").format(date);
  return { from: iso(from), to: iso(to) };
}

export default function WorkspaceDetailView({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState<7 | 14 | 30>(30);
  const range = trailingRange(days);

  const detail = useQuery({
    queryKey: ["operator", "workspace", workspaceId, range.from, range.to],
    queryFn: () => fetchOperatorWorkspaceDetail(api, workspaceId, range),
  });

  return (
    <ConsoleShell>
      <main className="mx-auto max-w-6xl p-6">
        {detail.isPending ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : detail.isError || detail.data === null ? (
          <p className="text-destructive">
            {detail.data === null ? "Workspace not found." : "Failed to load the Workspace."}
          </p>
        ) : (
          <WorkspaceDetail
            workspaceId={workspaceId}
            detail={detail.data}
            days={days}
            onDaysChange={setDays}
          />
        )}
      </main>
    </ConsoleShell>
  );
}

function WorkspaceDetail({
  workspaceId,
  detail,
  days,
  onDaysChange,
}: {
  workspaceId: string;
  detail: NonNullable<Awaited<ReturnType<typeof fetchOperatorWorkspaceDetail>>>;
  days: 7 | 14 | 30;
  onDaysChange: (days: 7 | 14 | 30) => void;
}) {
  const { workspace, unlimitedPeriod, users, channels, knowledgeSources, aiAgents, analytics, aiUsage } =
    detail;
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <div className="grid gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            {workspace.slug} · Created {formatDate(workspace.createdAt)}
          </p>
        </div>
        <Button onClick={() => setTopUpOpen(true)}>Top-Up</Button>
        <TopUpDialog
          workspaceId={workspace.id}
          balance={aiUsage.summary.balance}
          open={topUpOpen}
          onOpenChange={setTopUpOpen}
        />
      </div>

      <div className="flex gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.days}
            size="sm"
            variant={days === preset.days ? "secondary" : "outline"}
            onClick={() => onDaysChange(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <UnlimitedPeriodCard workspaceId={workspaceId} unlimitedPeriod={unlimitedPeriod} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Web Widget</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={channels.webWidgetActive ? "default" : "outline"}>
              {channels.webWidgetActive ? "Active" : "Inactive"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={channels.whatsAppConnected ? "default" : "outline"}>
              {channels.whatsAppConnected ? "Connected" : "Not connected"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tickets ({days}d)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {numberFormat.format(analytics.overview.totalTickets)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {numberFormat.format(aiUsage.summary.balance)}
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold">AI Usage ({days}d)</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {numberFormat.format(aiUsage.summary.totals.sessionCount)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AI Turns</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {numberFormat.format(aiUsage.summary.totals.turnCount)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Credits spent</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {numberFormat.format(aiUsage.summary.totals.creditsSpent)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tokens (in / out)</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {numberFormat.format(aiUsage.summary.totals.inputTokens)} /{" "}
              {numberFormat.format(aiUsage.summary.totals.outputTokens)}
            </CardContent>
          </Card>
        </div>
        {aiUsage.summary.byModel.length > 0 && (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Agent Model</TableHead>
                <TableHead>Turns</TableHead>
                <TableHead>Credits spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aiUsage.summary.byModel.map((row) => (
                <TableRow key={row.agentModel}>
                  <TableCell>{row.agentModel}</TableCell>
                  <TableCell>{numberFormat.format(row.turnCount)}</TableCell>
                  <TableCell>{numberFormat.format(row.creditsSpent)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">AI Agents</h2>
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agent Model</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aiAgents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No AI Agents.
                </TableCell>
              </TableRow>
            ) : (
              aiAgents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>{agent.name}</TableCell>
                  <TableCell>
                    <Badge variant={agent.status === "ACTIVE" ? "default" : "outline"}>
                      {agent.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{agent.agentModel}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Knowledge Sources</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {knowledgeSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Knowledge Sources.</p>
          ) : (
            knowledgeSources.map((group) => (
              <Badge key={group.status} variant={group.status === "FAILED" ? "destructive" : "outline"}>
                {group.status}: {numberFormat.format(group.count)}
              </Badge>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Users</h2>
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last sign-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{formatDateTime(user.lastSignInAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function isActive(period: UnlimitedPeriod | null): period is UnlimitedPeriod {
  return Boolean(period) && !period!.endedEarlyAt && new Date(period!.endAt) > new Date();
}

function UnlimitedPeriodCard({
  workspaceId,
  unlimitedPeriod,
}: {
  workspaceId: string;
  unlimitedPeriod: UnlimitedPeriod | null;
}) {
  const queryClient = useQueryClient();
  const active = isActive(unlimitedPeriod);
  const [endDate, setEndDate] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["operator", "workspace", workspaceId] });

  const grant = useMutation({
    mutationFn: (date: string) => grantUnlimitedPeriod(api, workspaceId, date),
    onSuccess: () => {
      setEndDate("");
      invalidate();
    },
  });
  const extend = useMutation({
    mutationFn: (date: string) => extendUnlimitedPeriod(api, workspaceId, date),
    onSuccess: () => {
      setEndDate("");
      invalidate();
    },
  });
  const endEarly = useMutation({
    mutationFn: () => endUnlimitedPeriodEarly(api, workspaceId),
    onSuccess: invalidate,
  });

  const mutation = active ? extend : grant;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlimited Period</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm">
          {active ? (
            <>
              Active until <span className="font-medium">{formatDate(unlimitedPeriod!.endAt)}</span>
            </>
          ) : (
            "No active Unlimited Period."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="Unlimited Period end date"
            className="w-40"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <Button
            size="sm"
            disabled={!endDate || mutation.isPending}
            onClick={() => mutation.mutate(endDate)}
          >
            {active ? "Extend" : "Grant"}
          </Button>
          {active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={endEarly.isPending}>
                  End early
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>End this Unlimited Period now?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The Workspace goes back to spending its own Credits immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => endEarly.mutate()}>End early</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {(grant.isError || extend.isError || endEarly.isError) && (
          <p className="text-sm text-destructive">
            {(grant.error ?? extend.error ?? endEarly.error) instanceof Error
              ? ((grant.error ?? extend.error ?? endEarly.error) as Error).message
              : "Something went wrong."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

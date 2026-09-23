import { fetchOperatorWorkspaceDetail } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ConsoleShell } from "../../../console/shell";
import { api } from "../../../../lib/auth";

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
  detail,
  days,
  onDaysChange,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof fetchOperatorWorkspaceDetail>>>;
  days: 7 | 14 | 30;
  onDaysChange: (days: 7 | 14 | 30) => void;
}) {
  const { workspace, users, channels, knowledgeSources, aiAgents, analytics, aiUsage } = detail;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{workspace.name}</h1>
        <p className="text-sm text-muted-foreground">
          {workspace.slug} · Created {formatDate(workspace.createdAt)}
        </p>
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

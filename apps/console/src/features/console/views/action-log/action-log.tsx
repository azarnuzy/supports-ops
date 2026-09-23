import { fetchOperatorActions, fetchOperatorWorkspaces, type OperatorAction } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../../lib/api";

const ALL = "ALL";
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const actionLabel: Record<OperatorAction["type"], string> = {
  TOP_UP: "Top-Up",
  UNLIMITED_PERIOD_GRANTED: "Unlimited Period granted",
  UNLIMITED_PERIOD_EXTENDED: "Unlimited Period extended",
  UNLIMITED_PERIOD_ENDED: "Unlimited Period ended early",
};

function actionDetail(action: OperatorAction) {
  const payload = action.payload;
  if (action.type === "TOP_UP") {
    const credits = payload.credits;
    const note = payload.note;
    return [typeof credits === "number" ? `+${credits} Credits` : null, typeof note === "string" ? note : null]
      .filter(Boolean)
      .join(" — ");
  }
  const endAt = payload.endAt;
  return typeof endAt === "string" ? `Ends ${dateFormat.format(new Date(endAt))}` : "";
}

export default function ActionLogView() {
  const [workspaceId, setWorkspaceId] = useState<string>(ALL);

  const workspaces = useQuery({
    queryKey: ["operator", "workspaces", "action-log-filter"],
    queryFn: () => fetchOperatorWorkspaces(api, { limit: 100 }),
  });

  const actions = useQuery({
    queryKey: ["operator", "actions", workspaceId],
    queryFn: () =>
      fetchOperatorActions(api, { workspaceId: workspaceId === ALL ? undefined : workspaceId }),
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Action log</h1>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Operator Actions</CardTitle>
          <NativeSelect
            aria-label="Filter by Workspace"
            className="w-64"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            <NativeSelectOption value={ALL}>All Workspaces</NativeSelectOption>
            {workspaces.data?.workspaces.map((workspace) => (
              <NativeSelectOption key={workspace.id} value={workspace.id}>
                {workspace.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </CardHeader>
        <CardContent>
          {actions.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">Loading actions…</p>
          ) : actions.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">Failed to load the Action log.</p>
              <Button size="sm" variant="outline" onClick={() => actions.refetch()}>
                Try again
              </Button>
            </div>
          ) : actions.data.actions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No Operator Actions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.data.actions.map((action) => (
                  <TableRow key={action.id}>
                    <TableCell className="text-muted-foreground">
                      {dateFormat.format(new Date(action.createdAt))}
                    </TableCell>
                    <TableCell>{action.operator.name}</TableCell>
                    <TableCell>
                      {action.workspace ? (
                        <Link
                          to="/workspaces/$workspaceId"
                          params={{ workspaceId: action.workspace.id }}
                          className="text-primary hover:underline"
                        >
                          {action.workspace.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{actionLabel[action.type]}</TableCell>
                    <TableCell className="text-muted-foreground">{actionDetail(action)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

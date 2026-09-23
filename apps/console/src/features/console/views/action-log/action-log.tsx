import {
  fetchOperatorActions,
  fetchOperatorWorkspaces,
  type OperatorAction,
} from "@repo/api-client";
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
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
} from "../../components/console-patterns";

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
    return [
      typeof credits === "number" ? `+${credits} Credits` : null,
      typeof note === "string" ? note : null,
    ]
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
  const actionRows = actions.data?.actions ?? [];

  return (
    <>
      <ConsolePageHeader
        title="Audit Log"
        description="Operator actions across all Workspaces."
        actions={
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
        }
      />
      <ConsoleDataTable>
        {actions.isPending || actions.isError || actionRows.length === 0 ? (
          <ConsoleQueryState
            isPending={actions.isPending}
            isError={actions.isError}
            error={actions.error}
            errorFallback="Failed to load the Action log."
            isEmpty={!actions.isPending && !actions.isError && actionRows.length === 0}
            emptyTitle={
              workspaceId === ALL
                ? "No Operator Actions yet"
                : "No Operator Actions for this Workspace"
            }
            onRetry={() => void actions.refetch()}
          />
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
              {actionRows.map((action) => (
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
                  <TableCell className="text-muted-foreground">
                    {actionDetail(action)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleDataTable>
    </>
  );
}

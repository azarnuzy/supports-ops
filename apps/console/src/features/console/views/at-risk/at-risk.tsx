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
import { api } from "../../../../lib/api";
import {
  attentionConditionLabel,
  attentionConditionTone,
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
} from "../../components/console-patterns";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function AtRiskView() {
  const query = useQuery({
    queryKey: ["operator", "at-risk"],
    queryFn: async () => {
      const response = await api.operator["at-risk"].$get();
      if (!response.ok) throw new Error("Failed to load at-risk workspaces.");
      return response.json();
    },
  });

  const workspaces = query.data?.workspaces ?? [];

  return (
    <>
      <ConsolePageHeader
        title="Needs Attention"
        description="Workspaces meeting one or more existing attention conditions."
      />
      <ConsoleDataTable>
        {query.isPending || query.isError || workspaces.length === 0 ? (
          <ConsoleQueryState
            isPending={query.isPending}
            isError={query.isError}
            error={query.error}
            errorFallback="Failed to load at-risk workspaces."
            isEmpty={!query.isPending && !query.isError && workspaces.length === 0}
            emptyTitle="No Workspaces need attention"
            onRetry={() => void query.refetch()}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Unlimited Period ends</TableHead>
                <TableHead>Last Customer activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell>
                    <Link
                      to="/workspaces/$workspaceId"
                      params={{ workspaceId: workspace.id }}
                      className="text-primary hover:underline"
                    >
                      {workspace.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{workspace.balance}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {workspace.conditions.map((condition) => (
                        <ConsoleStatusBadge
                          key={condition}
                          tone={attentionConditionTone[condition]}
                        >
                          {attentionConditionLabel[condition] ?? condition}
                        </ConsoleStatusBadge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {workspace.activeUnlimitedPeriod
                      ? dateFormat.format(new Date(workspace.activeUnlimitedPeriod.endAt))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {workspace.lastCustomerActivityAt
                      ? dateFormat.format(new Date(workspace.lastCustomerActivityAt))
                      : "—"}
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

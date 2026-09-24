import { Button } from "@repo/ui/components/button";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import {
  ConsoleDataTable,
  ConsolePageHeader,
  ConsoleQueryState,
  ConsoleStatusBadge,
} from "../../components/console-patterns";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const operatorAtRiskQueryOptions = queryOptions({
  queryKey: ["operator", "at-risk"] as const,
  queryFn: async () => {
    const response = await api.operator["at-risk"].$get();
    if (!response.ok) throw new Error("Failed to load at-risk workspaces.");
    return response.json();
  },
});

const conditions = [
  "CREDIT_EXHAUSTED",
  "LOW_BALANCE",
  "UNLIMITED_ENDING_SOON",
  "INACTIVE",
] as const;

const financialConditions = new Set<(typeof conditions)[number]>([
  "CREDIT_EXHAUSTED",
  "LOW_BALANCE",
  "UNLIMITED_ENDING_SOON",
]);

export const conditionLabel: Record<string, string> = {
  CREDIT_EXHAUSTED: "Credit exhausted",
  LOW_BALANCE: "Low balance",
  UNLIMITED_ENDING_SOON: "Unlimited ending soon",
  INACTIVE: "Inactive 14+ days",
};

export const conditionTone: Record<string, "danger" | "warning" | "neutral"> = {
  CREDIT_EXHAUSTED: "danger",
  LOW_BALANCE: "warning",
  UNLIMITED_ENDING_SOON: "warning",
  INACTIVE: "neutral",
};

const ALL = "ALL";

export default function AtRiskView() {
  const [condition, setCondition] = useState<(typeof conditions)[number] | typeof ALL>(ALL);
  const query = useQuery(operatorAtRiskQueryOptions);

  const workspaces = query.data?.workspaces ?? [];
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const workspace of workspaces) {
      for (const workspaceCondition of workspace.conditions) {
        result[workspaceCondition] = (result[workspaceCondition] ?? 0) + 1;
      }
    }
    return result;
  }, [workspaces]);

  const filteredWorkspaces =
    condition === ALL
      ? workspaces
      : workspaces.filter((workspace) => workspace.conditions.includes(condition));

  return (
    <>
      <ConsolePageHeader
        title="Needs Attention"
        description="Workspaces meeting one or more existing attention conditions."
        actions={
          <NativeSelect
            aria-label="Filter by condition"
            className="w-56"
            value={condition}
            onChange={(event) => setCondition(event.target.value as typeof condition)}
          >
            <NativeSelectOption value={ALL}>All conditions</NativeSelectOption>
            {conditions.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {conditionLabel[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
      />
      {workspaces.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {conditions
            .filter((value) => counts[value])
            .map((value) => (
              <ConsoleStatusBadge key={value} tone={conditionTone[value]}>
                {conditionLabel[value]}: {counts[value]}
              </ConsoleStatusBadge>
            ))}
        </div>
      ) : null}
      <ConsoleDataTable>
        {query.isPending || query.isError || filteredWorkspaces.length === 0 ? (
          <ConsoleQueryState
            isPending={query.isPending}
            isError={query.isError}
            error={query.error}
            errorFallback="Failed to load at-risk workspaces."
            isEmpty={!query.isPending && !query.isError && filteredWorkspaces.length === 0}
            emptyTitle={
              condition === ALL
                ? "No Workspaces need attention"
                : "No Workspaces match this condition"
            }
            emptyDescription={
              condition === ALL || workspaces.length === 0 ? undefined : "Try another condition."
            }
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
                <TableHead>Last customer activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell className="font-medium">{workspace.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {workspace.balance} Credits
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {workspace.conditions.map((workspaceCondition) => (
                        <ConsoleStatusBadge
                          key={workspaceCondition}
                          tone={conditionTone[workspaceCondition]}
                        >
                          {conditionLabel[workspaceCondition] ?? workspaceCondition}
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
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {workspace.conditions.some((value) => financialConditions.has(value)) ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/$section" params={{ section: "billing-credits" }}>
                            Billing & Credits
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }}>
                          Review
                        </Link>
                      </Button>
                    </div>
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

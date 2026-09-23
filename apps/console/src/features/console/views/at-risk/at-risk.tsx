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
import { Link } from "@tanstack/react-router";
import { api } from "../../../../lib/api";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const conditionLabel: Record<string, string> = {
  CREDIT_EXHAUSTED: "Credit exhausted",
  LOW_BALANCE: "Low balance",
  UNLIMITED_ENDING_SOON: "Unlimited ending soon",
  INACTIVE: "No activity 14d",
};

const conditionVariant: Record<string, "default" | "outline" | "secondary"> = {
  CREDIT_EXHAUSTED: "default",
  LOW_BALANCE: "outline",
  UNLIMITED_ENDING_SOON: "secondary",
  INACTIVE: "secondary",
};

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
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">At-risk Workspaces</h1>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Workspaces needing attention</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <p className="p-6 text-sm text-muted-foreground">Loading at-risk workspaces…</p>
          ) : query.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">
                {query.error instanceof Error
                  ? query.error.message
                  : "Failed to load at-risk workspaces."}
              </p>
              <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                Try again
              </Button>
            </div>
          ) : workspaces.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No at-risk workspaces.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Balance</TableHead>
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
                    <TableCell className="tabular-nums">{workspace.balance}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {workspace.conditions.map((condition) => (
                          <Badge key={condition} variant={conditionVariant[condition]}>
                            {conditionLabel[condition] ?? condition}
                          </Badge>
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
        </CardContent>
      </Card>
    </main>
  );
}

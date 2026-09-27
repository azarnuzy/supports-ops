import { fetchOperatorOrganizationDetail } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleShell } from "../features/console/shell";
import { TopUpDialog } from "../features/workspaces/views/detail/components/top-up-dialog";
import { api } from "../lib/api";

export const Route = createFileRoute("/organizations_/$organizationId")({ component: OrganizationDetail });

function OrganizationDetail() {
  const { organizationId } = Route.useParams();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const result = useQuery({
    queryKey: ["operator", "organizations", organizationId],
    queryFn: () => fetchOperatorOrganizationDetail(api, organizationId),
  });
  const detail = result.data;
  return <ConsoleShell>
    <div className="space-y-6 p-6">
      <Link to="/organizations" className="text-sm text-primary">← Organizations</Link>
      {result.isPending ? <p>Loading Organization...</p> : result.isError ? <p role="alert">Failed to load Organization.</p> : !detail ? <p>Organization not found.</p> : <>
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">{detail.name}</h1><p className="text-muted-foreground">Shared balance: {detail.balance.toLocaleString()} Credits</p></div>
          {detail.workspaces.length > 0 && <Button onClick={() => setTopUpOpen(true)}>Record Top-Up</Button>}
        </div>
        <section><h2 className="mb-2 text-lg font-medium">Organization Admins</h2><div className="divide-y rounded-md border">{detail.users.map((user) => <p key={user.id} className="p-3">{user.name} · {user.email}</p>)}{detail.users.length === 0 && <p className="p-3">No active Organization Admins.</p>}</div></section>
        <section><h2 className="mb-2 text-lg font-medium">Workspaces</h2><div className="divide-y rounded-md border">{detail.workspaces.map((workspace) => <Link key={workspace.id} to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="block p-3 text-primary hover:bg-muted">{workspace.name} · {workspace.slug} →</Link>)}{detail.workspaces.length === 0 && <p className="p-3">No active Workspaces.</p>}</div></section>
        <section><h2 className="mb-2 text-lg font-medium">Payments</h2><div className="divide-y rounded-md border">{detail.payments.map((payment) => <p key={payment.id} className="flex justify-between gap-4 p-3"><span>{payment.status} · {new Date(payment.createdAt).toLocaleDateString()} · Rp {payment.amountIdr.toLocaleString()}</span><span>{payment.credits.toLocaleString()} Credits</span></p>)}{detail.payments.length === 0 && <p className="p-3">No payments.</p>}</div></section>
        <section><h2 className="mb-2 text-lg font-medium">Credit Ledger</h2><div className="divide-y rounded-md border">{detail.ledger.map((entry) => <p key={entry.id} className="flex justify-between gap-4 p-3"><span>{entry.type} · {new Date(entry.createdAt).toLocaleDateString()}{entry.note ? ` · ${entry.note}` : ""}</span><span className="tabular-nums">{entry.credits > 0 ? "+" : ""}{entry.credits.toLocaleString()}</span></p>)}{detail.ledger.length === 0 && <p className="p-3">No ledger entries.</p>}</div></section>
        <TopUpDialog organizationId={organizationId} balance={detail.balance} open={topUpOpen} onOpenChange={setTopUpOpen} />
      </>}
    </div>
  </ConsoleShell>;
}

import { changeOrganizationUnlimitedPeriod, fetchOperatorOrganizationDetail } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleShell } from "../features/console/shell";
import { TopUpDialog } from "../features/workspaces/views/detail/components/top-up-dialog";
import { api } from "../lib/api";

export const Route = createFileRoute("/organizations_/$organizationId")({ component: OrganizationDetail });

function OrganizationDetail() {
  const { organizationId } = Route.useParams();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [indefinite, setIndefinite] = useState(false);
  const queryClient = useQueryClient();
  const periodMutation = useMutation({
    mutationFn: (action: "grant" | "extend" | "end") => changeOrganizationUnlimitedPeriod(api, organizationId, action, indefinite ? null : endDate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operator"] }),
  });
  const result = useQuery({
    queryKey: ["operator", "organizations", organizationId],
    queryFn: () => fetchOperatorOrganizationDetail(api, organizationId),
  });
  const detail = result.data;
  const activePeriod = Boolean(detail?.unlimitedPeriod && !detail.unlimitedPeriod.endedEarlyAt && (!detail.unlimitedPeriod.endAt || new Date(detail.unlimitedPeriod.endAt) > new Date()));
  return <ConsoleShell>
    <div className="space-y-6 p-6">
      <Link to="/organizations" className="text-sm text-primary">← Organizations</Link>
      {result.isPending ? <p>Loading Organization...</p> : result.isError ? <p role="alert">Failed to load Organization.</p> : !detail ? <p>Organization not found.</p> : <>
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">{detail.name}</h1><p className="text-muted-foreground">Shared balance: {detail.balance.toLocaleString()} Credits</p></div>
          {detail.workspaces.length > 0 && <Button onClick={() => setTopUpOpen(true)}>Record Top-Up</Button>}
        </div>
        <section className="space-y-2 rounded-md border p-4">
          <h2 className="text-lg font-medium">Organization Unlimited Period</h2>
          <p>{activePeriod ? detail.unlimitedPeriod?.endAt ? `Active until ${new Date(detail.unlimitedPeriod.endAt).toLocaleDateString()}` : "Active without an end date" : "No active period"}. Applies to every current and future Workspace.</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={indefinite} onChange={(event) => setIndefinite(event.target.checked)} />No end date</label>
            {!indefinite && <label className="flex items-center gap-2">End date <input type="date" min={new Date().toISOString().slice(0, 10)} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded border p-1" /></label>}
            <Button disabled={periodMutation.isPending || (!indefinite && !endDate)} onClick={() => periodMutation.mutate(activePeriod ? "extend" : "grant")}>{activePeriod ? "Update period" : "Grant period"}</Button>
            {activePeriod && <Button variant="outline" disabled={periodMutation.isPending} onClick={() => { if (window.confirm("End this Organization's Unlimited Period now?")) periodMutation.mutate("end"); }}>End early</Button>}
          </div>
          {periodMutation.isError && <p role="alert" className="text-destructive">{periodMutation.error.message}</p>}
        </section>
        <section><h2 className="mb-2 text-lg font-medium">Organization Admins</h2><div className="divide-y rounded-md border">{detail.users.map((user) => <p key={user.id} className="p-3">{user.name} · {user.email}</p>)}{detail.users.length === 0 && <p className="p-3">No active Organization Admins.</p>}</div></section>
        <section><h2 className="mb-2 text-lg font-medium">Workspaces</h2><div className="divide-y rounded-md border">{detail.workspaces.map((workspace) => <Link key={workspace.id} to="/workspaces/$workspaceId" params={{ workspaceId: workspace.id }} className="block p-3 text-primary hover:bg-muted">{workspace.name} · {workspace.slug} →</Link>)}{detail.workspaces.length === 0 && <p className="p-3">No active Workspaces.</p>}</div></section>
        <section><h2 className="mb-2 text-lg font-medium">Payments</h2><div className="divide-y rounded-md border">{detail.payments.map((payment) => <p key={payment.id} className="flex justify-between gap-4 p-3"><span>{payment.status} · {new Date(payment.createdAt).toLocaleDateString()} · Rp {payment.amountIdr.toLocaleString()}</span><span>{payment.credits.toLocaleString()} Credits</span></p>)}{detail.payments.length === 0 && <p className="p-3">No payments.</p>}</div></section>
        <section><h2 className="mb-2 text-lg font-medium">Credit Ledger</h2><div className="divide-y rounded-md border">{detail.ledger.map((entry) => <p key={entry.id} className="flex justify-between gap-4 p-3"><span>{entry.type} · {new Date(entry.createdAt).toLocaleDateString()}{entry.note ? ` · ${entry.note}` : ""}</span><span className="tabular-nums">{entry.credits > 0 ? "+" : ""}{entry.credits.toLocaleString()}</span></p>)}{detail.ledger.length === 0 && <p className="p-3">No ledger entries.</p>}</div></section>
        <TopUpDialog organizationId={organizationId} balance={detail.balance} open={topUpOpen} onOpenChange={setTopUpOpen} />
      </>}
    </div>
  </ConsoleShell>;
}

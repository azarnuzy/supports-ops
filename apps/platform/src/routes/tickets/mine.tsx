import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../features/auth";
import { pageMetadata } from "../../lib/seo";
import { PlatformAppShell } from "../../modules/app-shell/app-shell";

export const Route = createFileRoute("/tickets/mine")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "My tickets",
      description: "View Tickets assigned to you in SupportOps.",
      path: "/tickets/mine",
      noIndex: true,
    }),
  component: MyTicketsPage,
});

function MyTicketsPage() {
  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Human Agent workspace</p>
          <h1 className="text-3xl font-semibold text-balance">My tickets</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Assigned tickets</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tickets you claim will appear here.
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
}

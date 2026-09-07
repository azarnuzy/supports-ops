import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../features/auth";
import { pageMetadata } from "../lib/seo";
import { PlatformAppShell } from "../modules/app-shell/app-shell";

export const Route = createFileRoute("/knowledge")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Knowledge",
      description: "Manage Knowledge Sources for your SupportOps Workspace.",
      path: "/knowledge",
      noIndex: true,
    }),
  component: KnowledgePage,
});

function KnowledgePage() {
  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Workspace knowledge</p>
          <h1 className="text-3xl font-semibold text-balance">Knowledge Sources</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Sources</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Knowledge Source management will appear here.
          </CardContent>
        </Card>
      </section>
    </PlatformAppShell>
  );
}

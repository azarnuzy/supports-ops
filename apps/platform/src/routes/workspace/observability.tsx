import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { PlatformAppShell } from "../../features/app-shell";
import { DestinationForm } from "../../features/observability/destination-form";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/workspace/observability")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Observability",
      description: "Configure this Workspace's evaluation and production chat Telemetry.",
      path: "/workspace/observability",
      noIndex: true,
    }),
  component: () => (
    <PlatformAppShell>
      <section className="grid gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Observability</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Langfuse or Anvia Lens for this Workspace's evaluations and production chat
            traces.
          </p>
        </div>
        <DestinationForm />
      </section>
    </PlatformAppShell>
  ),
});

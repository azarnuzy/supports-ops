import { createFileRoute, notFound } from "@tanstack/react-router";
import ActionLogView from "../features/console/views/action-log/action-log";
import AtRiskView from "../features/console/views/at-risk/at-risk";
import ConsoleView from "../features/console/views/console/console";
import MarginView from "../features/console/views/margin/margin";
import PaymentsView from "../features/console/views/payments/payments";
import PlatformAnalyticsView from "../features/console/views/platform-analytics/platform-analytics";
import { ConsoleShell, legacySectionAliases, sections } from "../features/console/shell";

export const Route = createFileRoute("/$section")({
  beforeLoad: ({ params }) => {
    const isSection = sections.some((section) => section.slug === params.section);
    const isLegacySection = Object.keys(legacySectionAliases).includes(params.section);
    if (!isSection && !isLegacySection) throw notFound();
  },
  component: Section,
});

function Section() {
  const { section } = Route.useParams();
  const slug = legacySectionAliases[section] ?? section;

  if (slug === "billing-credits") {
    return (
      <ConsoleShell>
        <PaymentsView />
      </ConsoleShell>
    );
  }
  if (slug === "needs-attention") {
    return (
      <ConsoleShell>
        <AtRiskView />
      </ConsoleShell>
    );
  }
  if (slug === "ai-usage-economics") {
    return (
      <ConsoleShell>
        <MarginView />
      </ConsoleShell>
    );
  }
  if (slug === "audit-log") {
    return (
      <ConsoleShell>
        <ActionLogView />
      </ConsoleShell>
    );
  }
  if (slug === "platform-analytics") {
    return (
      <ConsoleShell>
        <PlatformAnalyticsView />
      </ConsoleShell>
    );
  }
  const sectionPage = sections.find((item) => item.slug === slug);
  return (
    <ConsoleShell>
      <ConsoleView title={sectionPage?.label ?? ""} />
    </ConsoleShell>
  );
}

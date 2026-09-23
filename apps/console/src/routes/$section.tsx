import { createFileRoute, notFound } from "@tanstack/react-router";
import ConsoleView from "../features/console/views/console/console";
import PaymentsView from "../features/console/views/payments/payments";
import { ConsoleShell, sections } from "../features/console/shell";

export const Route = createFileRoute("/$section")({
  beforeLoad: ({ params }) => {
    if (!sections.some((section) => section.slug === params.section)) throw notFound();
  },
  component: Section,
});

function Section() {
  const { section } = Route.useParams();
  if (section === "payments") {
    return (
      <ConsoleShell>
        <PaymentsView />
      </ConsoleShell>
    );
  }
  const title = sections.find((item) => item.slug === section)?.label ?? "";
  return (
    <ConsoleShell>
      <ConsoleView title={title} />
    </ConsoleShell>
  );
}

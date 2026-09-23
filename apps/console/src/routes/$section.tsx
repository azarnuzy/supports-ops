import { createFileRoute, notFound } from "@tanstack/react-router";
import ConsoleView from "../features/console/views/console/console";
import { ConsoleShell, sections } from "../features/console/shell";

export const Route = createFileRoute("/$section")({
  beforeLoad: ({ params }) => {
    if (!sections.some((section) => section.slug === params.section)) throw notFound();
  },
  component: Section,
});

function Section() {
  const { section } = Route.useParams();
  const title = sections.find((item) => item.slug === section)?.label ?? "";
  return (
    <ConsoleShell>
      <ConsoleView title={title} />
    </ConsoleShell>
  );
}

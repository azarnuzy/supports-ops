import { createFileRoute } from "@tanstack/react-router";
import ConsoleView from "../features/console/views/console/console";
import { ConsoleShell } from "../features/console/shell";

export const Route = createFileRoute("/")({
  component: () => (
    <ConsoleShell>
      <ConsoleView title="Overview" />
    </ConsoleShell>
  ),
});

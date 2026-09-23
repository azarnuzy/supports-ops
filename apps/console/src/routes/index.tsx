import { createFileRoute } from "@tanstack/react-router";
import OverviewView from "../features/console/views/overview/overview";
import { ConsoleShell } from "../features/console/shell";

export const Route = createFileRoute("/")({
  component: () => (
    <ConsoleShell>
      <OverviewView />
    </ConsoleShell>
  ),
});

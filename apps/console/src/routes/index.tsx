import { createFileRoute } from "@tanstack/react-router";
import { ConsoleView } from "../features/console";

export const Route = createFileRoute("/")({
  component: ConsoleView,
});

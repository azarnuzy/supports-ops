import { createFileRoute } from "@tanstack/react-router";
import { RegisterView } from "../features/auth";

export const Route = createFileRoute("/register")({
  component: RegisterView,
});

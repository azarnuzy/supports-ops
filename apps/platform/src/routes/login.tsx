import { createFileRoute } from "@tanstack/react-router";
import { LoginView } from "../features/auth";

export const Route = createFileRoute("/login")({
  component: LoginView,
});

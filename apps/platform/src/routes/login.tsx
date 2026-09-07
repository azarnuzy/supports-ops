import { createFileRoute } from "@tanstack/react-router";
import { LoginView } from "../features/auth";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/login")({
  head: () => pageMetadata({ title: "Login", description: "Sign in to your SupportOps Workspace.", path: "/login", noIndex: true }),
  component: LoginView,
});

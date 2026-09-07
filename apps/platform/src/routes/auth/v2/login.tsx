import { createFileRoute } from "@tanstack/react-router";
import { LoginView } from "../../../features/auth";
import { pageMetadata } from "../../../lib/seo";
export const Route = createFileRoute("/auth/v2/login")({ head: () => pageMetadata({ title: "Login", description: "Sign in to your SupportOps Workspace.", path: "/auth/v2/login", noIndex: true }), component: LoginView });

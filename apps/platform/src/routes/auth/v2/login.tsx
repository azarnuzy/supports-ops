import { createFileRoute } from "@tanstack/react-router";
import { LoginView } from "../../../features/auth";
export const Route = createFileRoute("/auth/v2/login")({ component: LoginView });

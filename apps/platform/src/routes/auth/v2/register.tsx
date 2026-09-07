import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "../../../modules/auth/auth-page";
export const Route = createFileRoute("/auth/v2/register")({ component: () => <AuthPage mode="register" /> });

import { createFileRoute } from "@tanstack/react-router";
import { RegisterView } from "../../../features/auth";
export const Route = createFileRoute("/auth/v2/register")({ component: RegisterView });

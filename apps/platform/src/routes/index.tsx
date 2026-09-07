import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { PlatformAppShell } from "../modules/app-shell/app-shell";
import { meQueryOptions, UnauthorizedError } from "../features/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(meQueryOptions);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw redirect({ to: "/login" });
      }

      throw error;
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const user = useQuery(meQueryOptions);

  if (!user.data) {
    return null;
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">Workspace overview</p>
            <h1 className="text-3xl font-semibold text-balance">Workspace dashboard</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Review your Workspace status and keep your profile ready for support work.
            </p>
          </div>
          <Button asChild className="w-fit">
            <Link to="/profile">Edit profile</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>This is the profile other product surfaces can use.</CardDescription>
              <CardAction>
                <Badge variant={user.data.emailVerified ? "default" : "secondary"}>
                  {user.data.emailVerified
                    ? "Email verified"
                    : "Email unverified"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <Avatar className="size-20 rounded-xl">
                {user.data.image ? (
                  <AvatarImage src={user.data.image} alt={`${user.data.name} avatar`} />
                ) : null}
                <AvatarFallback className="rounded-xl text-lg">
                  {getInitials(user.data.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 gap-2">
                <div>
                  <p className="text-xl font-semibold">{user.data.name}</p>
                  <p className="text-sm text-muted-foreground">{user.data.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{user.data.role ?? "user"}</Badge>
                  <Badge variant="secondary">Active Workspace</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workspace details</CardTitle>
              <CardDescription>Basic metadata for this Workspace.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <MetadataRow label="Joined" value={formatDate(user.data.createdAt)} />
              <MetadataRow
                label="Last updated"
                value={formatDate(user.data.updatedAt)}
              />
              <MetadataRow label="User ID" value={user.data.id} />
            </CardContent>
          </Card>
        </div>
      </section>
    </PlatformAppShell>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

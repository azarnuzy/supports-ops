import { useTranslation } from "@repo/ui/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminAppShell } from "../modules/app-shell/app-shell";
import { AdminForbiddenState } from "../modules/app-shell/forbidden-state";
import { meQueryOptions } from "../modules/auth/hooks/use-auth";
import { UnauthorizedError } from "../modules/auth/services";
import { listRecentUsers } from "../modules/users/services";

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
  const { t } = useTranslation();
  const user = useQuery(meQueryOptions);
  const users = useQuery({
    enabled: isAdminRole(user.data?.role),
    queryFn: () => listRecentUsers({ limit: 5 }),
    queryKey: ["admin", "users", "recent"],
    retry: false,
  });

  if (!user.data) {
    return null;
  }

  if (!isAdminRole(user.data.role)) {
    return <AdminForbiddenState />;
  }

  const recentUsers = users.data?.users ?? [];

  return (
    <AdminAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">{t("dashboard.eyebrow")}</p>
          <h1 className="text-3xl font-semibold text-balance">{t("dashboard.title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("dashboard.description")}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label={t("dashboard.stats.visibleUsers")} value={String(recentUsers.length)} />
          <StatCard
            label={t("dashboard.stats.admins")}
            value={String(recentUsers.filter((item) => isAdminRole(item.role)).length)}
          />
          <StatCard
            label={t("dashboard.stats.nextPage")}
            value={users.data?.nextCursor ? "1" : "0"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.identity.title")}</CardTitle>
              <CardDescription>{t("dashboard.identity.description")}</CardDescription>
              <CardAction>
                <Badge>{user.data.role ?? "admin"}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Avatar className="size-14 rounded-xl">
                {user.data.image ? (
                  <AvatarImage src={user.data.image} alt={`${user.data.name} avatar`} />
                ) : null}
                <AvatarFallback className="rounded-xl">
                  {getInitials(user.data.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 gap-1">
                <p className="truncate font-semibold">{user.data.name}</p>
                <p className="truncate text-sm text-muted-foreground">{user.data.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.users.title")}</CardTitle>
              <CardDescription>{t("dashboard.users.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {users.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("dashboard.users.loading")}</p>
              ) : users.isError ? (
                <p className="text-sm text-destructive">{t("dashboard.users.error")}</p>
              ) : recentUsers.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dashboard.users.name")}</TableHead>
                      <TableHead>{t("dashboard.users.role")}</TableHead>
                      <TableHead>{t("dashboard.users.joined")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentUsers.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="grid gap-1">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-xs text-muted-foreground">{item.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.role}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">{t("dashboard.users.empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </AdminAppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
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

function isAdminRole(role: string | null | undefined) {
  return role?.split(",").includes("admin") ?? false;
}

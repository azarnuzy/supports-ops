import { useTranslation } from "@repo/ui/i18n";
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
import { meQueryOptions } from "../modules/auth/hooks/use-auth";
import { UnauthorizedError } from "../modules/auth/services";

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

  if (!user.data) {
    return null;
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">{t("dashboard.eyebrow")}</p>
            <h1 className="text-3xl font-semibold text-balance">{t("dashboard.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("dashboard.description")}
            </p>
          </div>
          <Button asChild className="w-fit">
            <Link to="/profile">{t("dashboard.editProfile")}</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.profileCard.title")}</CardTitle>
              <CardDescription>{t("dashboard.profileCard.description")}</CardDescription>
              <CardAction>
                <Badge variant={user.data.emailVerified ? "default" : "secondary"}>
                  {user.data.emailVerified
                    ? t("dashboard.emailVerified")
                    : t("dashboard.emailUnverified")}
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
                  <Badge variant="secondary">{t("dashboard.accountActive")}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.accountCard.title")}</CardTitle>
              <CardDescription>{t("dashboard.accountCard.description")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <MetadataRow label={t("dashboard.joined")} value={formatDate(user.data.createdAt)} />
              <MetadataRow
                label={t("dashboard.lastUpdated")}
                value={formatDate(user.data.updatedAt)}
              />
              <MetadataRow label={t("dashboard.userId")} value={user.data.id} />
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

import { useTranslation } from "@repo/ui/i18n";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { toast } from "@repo/ui/components/sonner";
import { useLogoutMutation } from "../auth/hooks/use-auth";
import { HeaderControls } from "./header-controls";

export function AdminForbiddenState() {
  const { t } = useTranslation();
  const logoutMutation = useLogoutMutation();

  function handleLogout() {
    logoutMutation.mutate(undefined, {
      onError: (error) => {
        const message = error instanceof Error ? error.message : t("dashboard.logoutFallbackError");
        toast.error(message);
      },
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <span className="font-semibold">{t("nav.brand")}</span>
        <HeaderControls />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("dashboard.forbidden.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("dashboard.forbidden.description")}</p>
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={logoutMutation.isPending}
              onClick={handleLogout}
            >
              {logoutMutation.isPending ? t("dashboard.logoutPending") : t("dashboard.logout")}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

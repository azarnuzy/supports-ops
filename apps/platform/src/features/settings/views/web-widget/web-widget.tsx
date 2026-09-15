import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import { useWidgetSettingsForm } from "../widget/widget.hooks";
import { ConfigForm, InstallationCard, PreviewCard } from "../widget/components";

const WebWidgetChannelView = () => {
  const form = useWidgetSettingsForm();
  const {
    allowedDomains,
    botName,
    config,
    copySnippet,
    current,
    embedSnippet,
    primaryColor,
    welcomeMessage,
  } = form;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="Web Widget"
          description="Configure the Web Widget Customers use to reach you from your site."
        />

        {config.isPending ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_26rem]">
            <Skeleton className="h-[32rem] w-full rounded-xl" />
            <Skeleton className="h-[32rem] w-full rounded-xl" />
          </div>
        ) : null}

        {config.isError ? (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-destructive">Unable to load the Web Widget configuration.</p>
            <Button size="sm" variant="outline" onClick={() => void config.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {current ? (
          <>
            <div className="grid items-start gap-5 lg:grid-cols-[1fr_26rem]">
              <ConfigForm form={form} />
              <PreviewCard
                allowedDomains={allowedDomains}
                botName={botName}
                logoUrl={current.logoUrl}
                primaryColor={primaryColor}
                welcomeMessage={welcomeMessage}
              />
            </div>

            <InstallationCard
              copySnippet={copySnippet}
              embedSnippet={embedSnippet}
              widgetKey={current.widgetKey}
            />
          </>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default WebWidgetChannelView;

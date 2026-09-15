import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import { ConfigForm, PreviewCard } from "./components";
import { useAiSettingsForm } from "./ai.hooks";

const AiAgentView = () => {
  const form = useAiSettingsForm();
  const { current, settings } = form;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="AI Agent"
          description="Set the instructions your agent follows and the messages Customers see when it transfers or resolves a Ticket."
        />

        {settings.isPending ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_26rem]">
            <Skeleton className="h-[32rem] w-full rounded-xl" />
            <Skeleton className="h-[24rem] w-full rounded-xl" />
          </div>
        ) : null}

        {settings.isError ? (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <p className="text-sm text-destructive">
              {settings.error instanceof Error
                ? settings.error.message
                : "Unable to load AI Agent settings."}
            </p>
            <Button size="sm" variant="outline" onClick={() => void settings.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {current ? (
          <div className="grid items-start gap-5 lg:grid-cols-[1fr_26rem]">
            <ConfigForm form={form} />
            <PreviewCard
              handoffMessage={form.form?.handoffMessage ?? current.handoffMessage}
              resolutionMessage={form.form?.resolutionMessage ?? current.resolutionMessage}
            />
          </div>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default AiAgentView;

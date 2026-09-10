import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CopyIcon } from "lucide-react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { useWidgetSettingsForm } from "./widget.hooks";
import { ConfigForm, PreviewCard } from "./components";

const WebWidgetSettingsView = () => {
  const form = useWidgetSettingsForm();
  const { botName, config, copySnippet, current, embedSnippet, primaryColor, welcomeMessage } =
    form;

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Workspace settings</p>
          <h1 className="text-3xl font-semibold text-balance">Web Widget</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Set how support looks and behaves on your website, then copy the embed snippet.
          </p>
        </div>

        <SettingsNav />

        {config.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {config.isError ? (
          <p className="text-sm text-destructive">Unable to load the Web Widget configuration.</p>
        ) : null}

        {current ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
            <ConfigForm form={form} />
            <PreviewCard
              logoUrl={current.logoUrl}
              botName={botName}
              welcomeMessage={welcomeMessage}
              primaryColor={primaryColor}
            />
          </div>
        ) : null}

        {current ? (
          <Card>
            <CardHeader>
              <CardTitle>Embed snippet</CardTitle>
              <CardDescription>Paste this before the closing &lt;/body&gt; tag.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">
                {embedSnippet}
              </pre>
              <Button type="button" variant="outline" onClick={copySnippet}>
                <CopyIcon className="size-4" />
                Copy snippet
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default WebWidgetSettingsView;

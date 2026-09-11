import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import { useWidgetSettingsForm } from "./widget.hooks";
import { ConfigForm, PreviewCard } from "./components";

const WebWidgetView = () => {
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    if (await copySnippet()) setCopied(true);
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="Web Widget"
          description="Match the widget to your brand, control where it can load, then drop the snippet into your site."
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

            <Card className="gap-5">
              <CardHeader>
                <CardTitle className="text-base">Install the widget</CardTitle>
                <CardDescription>
                  Paste this snippet just before the closing &lt;/body&gt; tag on every page that
                  should show support. It loads asynchronously and adds nothing to your bundle.
                </CardDescription>
                <CardAction>
                  <Button
                    className="min-w-[8.5rem]"
                    type="button"
                    variant={copied ? "secondary" : "outline"}
                    onClick={() => void handleCopy()}
                  >
                    {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                    {copied ? "Copied" : "Copy snippet"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border bg-muted/40">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/60 px-3 py-2">
                    <span className="font-mono text-[11px] text-muted-foreground">index.html</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      key · {current.widgetKey.slice(0, 8)}
                      ••••
                    </span>
                  </div>
                  <pre className="overflow-x-auto px-4 py-3.5 font-mono text-xs leading-6 text-foreground">
                    {embedSnippet}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default WebWidgetView;

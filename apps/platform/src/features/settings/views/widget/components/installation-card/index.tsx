import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { InstallationCardProps } from "./index.types";

export default function InstallationCard({
  copySnippet,
  embedSnippet,
  widgetKey,
}: InstallationCardProps) {
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
    <Card className="gap-5">
      <CardHeader>
        <CardTitle className="text-base">Install the widget</CardTitle>
        <CardDescription>
          Paste this snippet just before the closing &lt;/body&gt; tag on every page that should
          show support. It loads asynchronously and adds nothing to your bundle.
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
              key · {widgetKey.slice(0, 8)}
              ••••
            </span>
          </div>
          <pre className="overflow-x-auto px-4 py-3.5 font-mono text-xs leading-6 text-foreground">
            {embedSnippet}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

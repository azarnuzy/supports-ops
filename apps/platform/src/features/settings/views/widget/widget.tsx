import { Badge } from "@repo/ui/components/badge";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon, MessageCircleIcon, XIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import {
  useUpdateWebWidgetConfigMutation,
  webWidgetConfigQueryOptions,
} from "../../widget-config.hooks";

const widgetScriptUrl = (import.meta.env.VITE_WIDGET_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);
const domainPattern =
  /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?::\d{1,5})?$/i;
const hexColorPattern = /^#[0-9a-f]{6}$/i;

const WebWidgetSettingsView = () => {
  const config = useQuery(webWidgetConfigQueryOptions);
  const updateConfig = useUpdateWebWidgetConfigMutation();

  const [botName, setBotName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);

  const current = config.data;

  useEffect(() => {
    if (current) {
      setBotName(current.botName);
      setWelcomeMessage(current.welcomeMessage);
      setPrimaryColor(current.primaryColor);
      setAllowedDomains(current.allowedDomains);
    }
  }, [current]);

  const validationError = useMemo(
    () => validateWidgetConfig(botName, welcomeMessage, primaryColor),
    [botName, welcomeMessage, primaryColor],
  );

  const isDirty =
    !!current &&
    (botName !== current.botName ||
      welcomeMessage !== current.welcomeMessage ||
      primaryColor !== current.primaryColor ||
      !domainsAreEqual(allowedDomains, current.allowedDomains));

  const embedSnippet = current
    ? `<script\n  src="${widgetScriptUrl}/widget.js"\n  data-widget-key="${current.widgetKey}">\n</script>`
    : "";

  function addDomain() {
    const normalized = domainDraft.trim().toLowerCase();

    if (!normalized) {
      return;
    }

    if (!domainPattern.test(normalized)) {
      setDomainError("Enter a valid domain, e.g. example.com.");
      return;
    }

    if (allowedDomains.includes(normalized)) {
      setDomainError("That domain is already allowed.");
      return;
    }

    setAllowedDomains((domains) => [...domains, normalized]);
    setDomainDraft("");
    setDomainError(null);
  }

  function removeDomain(domain: string) {
    setAllowedDomains((domains) => domains.filter((existing) => existing !== domain));
  }

  function handleDomainKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addDomain();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validationError) {
      return;
    }

    updateConfig.mutate(
      {
        allowedDomains,
        botName: botName.trim(),
        primaryColor,
        welcomeMessage: welcomeMessage.trim(),
      },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to save Web Widget.");
        },
        onSuccess: () => {
          toast.success("Web Widget saved.");
        },
      },
    );
  }

  function handleReset() {
    if (!current) {
      return;
    }

    setBotName(current.botName);
    setWelcomeMessage(current.welcomeMessage);
    setPrimaryColor(current.primaryColor);
    setAllowedDomains(current.allowedDomains);
    setDomainDraft("");
    setDomainError(null);
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      toast.success("Embed snippet copied.");
    } catch {
      toast.error("Failed to copy embed snippet.");
    }
  }

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
            <Card>
              <form onSubmit={handleSubmit}>
                <CardHeader>
                  <CardTitle>Configure the Web Widget</CardTitle>
                  <CardDescription>
                    These details are read by the widget when it loads on your site.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <Field>
                    <FieldLabel htmlFor="widget-bot-name">Bot name</FieldLabel>
                    <Input
                      id="widget-bot-name"
                      value={botName}
                      onChange={(event) => setBotName(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="widget-welcome-message">Welcome message</FieldLabel>
                    <Textarea
                      id="widget-welcome-message"
                      rows={3}
                      value={welcomeMessage}
                      onChange={(event) => setWelcomeMessage(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="widget-primary-color">Primary colour</FieldLabel>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="Primary colour picker"
                        className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                        type="color"
                        value={hexColorPattern.test(primaryColor) ? primaryColor : "#2563eb"}
                        onChange={(event) => setPrimaryColor(event.target.value)}
                      />
                      <Input
                        id="widget-primary-color"
                        aria-invalid={!hexColorPattern.test(primaryColor)}
                        value={primaryColor}
                        onChange={(event) => setPrimaryColor(event.target.value)}
                      />
                    </div>
                    <FieldDescription>Shown on the launcher and header.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="widget-allowed-domain">Allowed domains</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="widget-allowed-domain"
                        placeholder="example.com"
                        value={domainDraft}
                        onChange={(event) => {
                          setDomainDraft(event.target.value);
                          setDomainError(null);
                        }}
                        onKeyDown={handleDomainKeyDown}
                      />
                      <Button type="button" variant="outline" onClick={addDomain}>
                        Add
                      </Button>
                    </div>
                    <FieldError>{domainError}</FieldError>
                    <FieldDescription>
                      The widget is refused on any domain not listed here.
                    </FieldDescription>
                    {allowedDomains.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {allowedDomains.map((domain) => (
                          <Badge key={domain} variant="secondary" className="gap-1 pr-1 font-mono">
                            {domain}
                            <button
                              type="button"
                              aria-label={`Remove ${domain}`}
                              className="rounded-full p-0.5 hover:bg-background/60"
                              onClick={() => removeDomain(domain)}
                            >
                              <XIcon className="size-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No domains allowed yet.</p>
                    )}
                  </Field>
                  <FieldError>{validationError}</FieldError>
                </CardContent>
                <CardFooter className="mt-6 gap-3">
                  <Button
                    type="submit"
                    disabled={!isDirty || Boolean(validationError) || updateConfig.isPending}
                  >
                    {updateConfig.isPending ? "Saving..." : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" disabled={!isDirty} onClick={handleReset}>
                    Cancel
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <div className="grid gap-4">
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

              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>A rough idea of how Customers will see it.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-xl border">
                    <div
                      className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-white"
                      style={{
                        backgroundColor: hexColorPattern.test(primaryColor)
                          ? primaryColor
                          : "#2563eb",
                      }}
                    >
                      <MessageCircleIcon className="size-4" />
                      <span className="truncate">{botName || "Support Bot"}</span>
                    </div>
                    <div className="bg-card p-4">
                      <Bubble variant="ai">
                        <BubbleContent>
                          {welcomeMessage || "Hi! How can we help you today?"}
                        </BubbleContent>
                      </Bubble>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

function validateWidgetConfig(botName: string, welcomeMessage: string, primaryColor: string) {
  if (!botName.trim()) {
    return "Bot name is required.";
  }

  if (botName.trim().length > 60) {
    return "Bot name must be 60 characters or fewer.";
  }

  if (!welcomeMessage.trim()) {
    return "Welcome message is required.";
  }

  if (welcomeMessage.trim().length > 500) {
    return "Welcome message must be 500 characters or fewer.";
  }

  if (!hexColorPattern.test(primaryColor)) {
    return "Enter a hex colour, e.g. #2563eb.";
  }

  return null;
}

function domainsAreEqual(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((domain, index) => domain === b[index]);
}

export default WebWidgetSettingsView;

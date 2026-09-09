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
import { Textarea } from "@repo/ui/components/textarea";
import { CopyIcon, MessageCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { useWidgetSettingsForm } from "./widget.hooks";
import { hexColorPattern } from "./widget.services";

const WebWidgetSettingsView = () => {
  const {
    addDomain,
    allowedDomains,
    botName,
    closingMessage,
    config,
    copySnippet,
    current,
    domainDraft,
    domainError,
    embedSnippet,
    handleDomainKeyDown,
    handleLogoRemove,
    handleLogoUpload,
    handleReset,
    handleSubmit,
    isDirty,
    primaryColor,
    removeDomain,
    setBotName,
    setClosingMessage,
    setDomainDraft,
    setDomainError,
    setPrimaryColor,
    setWelcomeMessage,
    updateConfig,
    uploadLogo,
    validationError,
    welcomeMessage,
  } = useWidgetSettingsForm();
  const [logoFile, setLogoFile] = useState<File | null>(null);

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
                    <FieldLabel htmlFor="widget-closing-message">Closing message</FieldLabel>
                    <Textarea
                      id="widget-closing-message"
                      rows={2}
                      placeholder="Glad we could help! Reach out anytime."
                      value={closingMessage}
                      onChange={(event) => setClosingMessage(event.target.value)}
                    />
                    <FieldDescription>Sent when a Ticket is resolved.</FieldDescription>
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
                  <CardTitle>Logo</CardTitle>
                  <CardDescription>Shown on the widget launcher and header.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {current.logoUrl ? (
                    <img
                      alt="Web Widget logo"
                      className="h-16 w-16 rounded-md border object-contain"
                      src={current.logoUrl}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
                  )}
                  <Input
                    accept="image/png,image/jpeg,image/svg+xml"
                    aria-label="Web Widget logo"
                    type="file"
                    onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={!logoFile || uploadLogo.isPending}
                      onClick={() => {
                        if (!logoFile) return;
                        handleLogoUpload(logoFile);
                        setLogoFile(null);
                      }}
                    >
                      {uploadLogo.isPending ? "Uploading..." : "Upload logo"}
                    </Button>
                    {current.logoUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updateConfig.isPending}
                        onClick={handleLogoRemove}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Embed snippet</CardTitle>
                  <CardDescription>
                    Paste this before the closing &lt;/body&gt; tag.
                  </CardDescription>
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

export default WebWidgetSettingsView;

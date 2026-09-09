import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
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
import { CopyIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { useWidgetSettingsForm } from "./widget.hooks";
import { hexColorPattern } from "./widget.services";

// Mirrors apps/widget's genericIcon() so the header avatar and launcher fallback
// match the real widget pixel-for-pixel.
const WidgetChatIcon = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2h11A2.5 2.5 0 0 1 20 4.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4.4A2.5 2.5 0 0 1 4 12.5z" />
  </svg>
);

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
                    <FieldLabel htmlFor="widget-logo">Logo</FieldLabel>
                    <div className="flex items-center gap-4">
                      <Avatar className="size-16 border">
                        <AvatarImage alt="Web Widget logo" src={current.logoUrl ?? undefined} />
                        <AvatarFallback>
                          <WidgetChatIcon className="size-6 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid gap-2">
                        <Input
                          accept="image/png,image/jpeg,image/svg+xml"
                          aria-label="Web Widget logo"
                          className="max-w-64"
                          id="widget-logo"
                          type="file"
                          onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                        />
                        <div className="flex gap-2">
                          <Button
                            disabled={!logoFile || uploadLogo.isPending}
                            size="sm"
                            type="button"
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
                              disabled={updateConfig.isPending}
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={handleLogoRemove}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <FieldDescription>
                      Shown on the widget header. PNG, JPG, or SVG.
                    </FieldDescription>
                  </Field>
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

            <Card className="border-none bg-[#0b1220] text-white">
              <CardHeader>
                <CardTitle className="text-white">Preview</CardTitle>
                <CardDescription className="text-white/60">
                  Mirrors how Customers will see the widget on your site.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="overflow-hidden rounded-2xl bg-white text-[#172033] shadow-lg">
                  <div
                    className="flex items-center gap-2.5 px-4 py-4"
                    style={{
                      backgroundColor: hexColorPattern.test(primaryColor)
                        ? primaryColor
                        : "#2563eb",
                    }}
                  >
                    <Avatar className="size-7 border-0 bg-white/20">
                      <AvatarImage alt="" src={current.logoUrl ?? undefined} />
                      <AvatarFallback className="bg-transparent">
                        <WidgetChatIcon className="size-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-semibold text-white">
                      {botName || "Support Bot"}
                    </span>
                  </div>
                  <div className="p-4">
                    <Bubble variant="ai">
                      <BubbleContent>
                        {welcomeMessage || "Hi! How can we help you today?"}
                      </BubbleContent>
                    </Bubble>
                  </div>
                </div>
                <div className="flex justify-end">
                  <div
                    className="grid size-14 shrink-0 place-items-center rounded-full text-white shadow-lg"
                    style={{
                      backgroundColor: hexColorPattern.test(primaryColor)
                        ? primaryColor
                        : "#2563eb",
                    }}
                  >
                    <WidgetChatIcon className="size-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
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

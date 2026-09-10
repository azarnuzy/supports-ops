import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { hexColorPattern } from "../../widget.utils";
import WidgetChatIcon from "../widget-chat-icon";
import type { ConfigFormProps } from "./index.types";

export default function ConfigForm({ form }: ConfigFormProps) {
  const {
    addDomain,
    allowedDomains,
    botName,
    closingMessage,
    current,
    domainDraft,
    domainError,
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
  } = form;
  const [logoFile, setLogoFile] = useState<File | null>(null);

  if (!current) return null;

  return (
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
            <FieldDescription>Shown on the widget header. PNG, JPG, or SVG.</FieldDescription>
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
  );
}

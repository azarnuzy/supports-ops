import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
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
import { Separator } from "@repo/ui/components/separator";
import { Textarea } from "@repo/ui/components/textarea";
import { GlobeIcon, PlusIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { hexColorPattern } from "../../widget.utils";
import WidgetBotIcon from "../widget-bot-icon";
import type { ConfigFormProps } from "./index.types";

function SectionHeading({ description, title }: { description: string; title: string }) {
  return (
    <div className="grid gap-1">
      <h3 className="text-[13px] font-semibold tracking-wide text-foreground uppercase">{title}</h3>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorIsValid = hexColorPattern.test(primaryColor);

  if (!current) return null;

  return (
    <Card className="gap-5">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-base">Widget configuration</CardTitle>
          <CardDescription>
            The widget reads these values every time it loads on your site — changes go live as soon
            as you save.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          <Separator />

          <SectionHeading
            title="Branding"
            description="How the widget introduces itself in the launcher and panel header."
          />

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="widget-logo">
              Logo
            </FieldLabel>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="size-14 shrink-0 rounded-xl border">
                <AvatarImage alt="Web Widget logo" src={current.logoUrl ?? undefined} />
                <AvatarFallback className="rounded-xl bg-muted">
                  <WidgetBotIcon className="size-6 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadIcon className="size-4" />
                    Choose file
                  </Button>
                  <Button
                    disabled={!logoFile || uploadLogo.isPending}
                    size="sm"
                    type="button"
                    onClick={() => {
                      if (!logoFile) return;
                      handleLogoUpload(logoFile);
                      setLogoFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    {uploadLogo.isPending ? "Uploading…" : "Upload"}
                  </Button>
                  {current.logoUrl ? (
                    <Button
                      className="text-muted-foreground hover:text-destructive"
                      disabled={updateConfig.isPending}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={handleLogoRemove}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="truncate text-[13px] text-muted-foreground">
                  {logoFile ? logoFile.name : "PNG, JPG, or SVG — square, at least 128×128px."}
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/svg+xml"
              aria-label="Web Widget logo"
              className="sr-only"
              id="widget-logo"
              type="file"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel className="text-sm font-medium" htmlFor="widget-bot-name">
                Display name
              </FieldLabel>
              <Input
                id="widget-bot-name"
                maxLength={60}
                placeholder="Acme Support"
                value={botName}
                onChange={(event) => setBotName(event.target.value)}
              />
              <FieldDescription>Shown in the panel header, up to 60 characters.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel className="text-sm font-medium" htmlFor="widget-primary-color">
                Brand colour
              </FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Brand colour picker"
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1 transition-shadow hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  type="color"
                  value={colorIsValid ? primaryColor : "#2563eb"}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                />
                <Input
                  id="widget-primary-color"
                  aria-invalid={!colorIsValid}
                  className="font-mono uppercase"
                  placeholder="#2563EB"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                />
              </div>
              <FieldDescription>Used for the launcher, header, and sent messages.</FieldDescription>
            </Field>
          </div>

          <Separator />

          <SectionHeading
            title="Messages"
            description="The copy Customers read at the start and end of a conversation."
          />

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="widget-welcome-message">
              Welcome message
            </FieldLabel>
            <Textarea
              id="widget-welcome-message"
              maxLength={500}
              placeholder="Hi! Ask us anything about billing, orders, or your account — we usually reply in a few minutes."
              rows={3}
              value={welcomeMessage}
              onChange={(event) => setWelcomeMessage(event.target.value)}
            />
            <FieldDescription>
              First thing a Customer sees when the panel opens. {welcomeMessage.length}/500
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="widget-closing-message">
              Closing message
            </FieldLabel>
            <Textarea
              id="widget-closing-message"
              maxLength={1000}
              placeholder="Glad we could help! Reopen this chat any time if anything else comes up."
              rows={2}
              value={closingMessage}
              onChange={(event) => setClosingMessage(event.target.value)}
            />
            <FieldDescription>Sent automatically when a Ticket is resolved.</FieldDescription>
          </Field>

          <Separator />

          <SectionHeading
            title="Security"
            description="Where this widget is allowed to load. Requests from anywhere else are refused."
          />

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="widget-allowed-domain">
              Allowed domains
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="widget-allowed-domain"
                aria-invalid={Boolean(domainError)}
                placeholder="app.yourcompany.com"
                value={domainDraft}
                onChange={(event) => {
                  setDomainDraft(event.target.value);
                  setDomainError(null);
                }}
                onKeyDown={handleDomainKeyDown}
              />
              <Button
                disabled={!domainDraft.trim()}
                type="button"
                variant="outline"
                onClick={addDomain}
              >
                <PlusIcon className="size-4" />
                Add
              </Button>
            </div>
            <FieldError>{domainError}</FieldError>
            <FieldDescription>
              Press Enter or comma to add. Include every subdomain you embed on —
              <span className="font-mono">yourcompany.com</span> does not cover{" "}
              <span className="font-mono">app.yourcompany.com</span>.
            </FieldDescription>
            {allowedDomains.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {allowedDomains.map((domain) => (
                  <Badge
                    key={domain}
                    variant="secondary"
                    className="gap-1 py-1 pr-1 pl-2 font-mono text-[11px]"
                  >
                    {domain}
                    <button
                      type="button"
                      aria-label={`Remove ${domain}`}
                      className="rounded-full p-0.5 text-muted-foreground outline-none transition-colors hover:bg-background hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      onClick={() => removeDomain(domain)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
                <GlobeIcon className="size-4 shrink-0" />
                No domains allowed yet — the widget will not load anywhere.
              </div>
            )}
          </Field>

          <FieldError>{validationError}</FieldError>
        </CardContent>

        <CardFooter className="mt-6 flex-wrap justify-between gap-3 border-t pt-5">
          <p className="text-[13px] text-muted-foreground">
            {isDirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={!isDirty} onClick={handleReset}>
              Discard
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || Boolean(validationError) || updateConfig.isPending}
            >
              {updateConfig.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

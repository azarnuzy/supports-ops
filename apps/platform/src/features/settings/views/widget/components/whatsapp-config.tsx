import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { Switch } from "@repo/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import {
  useReplaceWhatsAppCredentialsMutation,
  useUpdateWhatsAppConfigMutation,
  useVerifyWhatsAppConfigMutation,
  whatsAppConfigQueryOptions,
} from "../../../widget-config.hooks";

export default function WhatsAppConfig() {
  const query = useQuery(whatsAppConfigQueryOptions);
  const verify = useVerifyWhatsAppConfigMutation();
  const replaceCredentials = useReplaceWhatsAppCredentialsMutation();
  const update = useUpdateWhatsAppConfigMutation();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const current = query.data?.whatsAppConfig;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    verify.mutate(
      { accessToken, appSecret, businessAccountId, phoneNumberId },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
          setAccessToken("");
          setAppSecret("");
          toast.success("WhatsApp credentials verified and saved.");
        },
      },
    );
  }

  function setEnabled(enabled: boolean) {
    update.mutate(enabled, {
      onError: (error) => toast.error(error.message),
      onSuccess: () => toast.success(`WhatsApp Channel ${enabled ? "enabled" : "disabled"}.`),
    });
  }

  function handleReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    replaceCredentials.mutate(
      { accessToken, ...(appSecret ? { appSecret } : {}) },
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => {
          setAccessToken("");
          setAppSecret("");
          toast.success("WhatsApp credentials replaced.");
        },
      },
    );
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  }

  if (query.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (query.isError) {
    return (
      <div className="grid place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <p className="text-sm text-destructive">Unable to load the WhatsApp configuration.</p>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Card className="gap-5">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle className="text-base">WhatsApp</CardTitle>
            <CardDescription>
              Connect your Workspace's own Meta App and WhatsApp Business number.
            </CardDescription>
          </div>
          {current ? (
            <Badge
              variant={
                current.health === "HEALTHY"
                  ? "default"
                  : current.health === "TOKEN_INVALID"
                    ? "destructive"
                    : "secondary"
              }
            >
              {current.health.replaceAll("_", " ")}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        {current ? (
          <div className="grid gap-5">
            {current.health === "TOKEN_INVALID" ? (
              <p className="text-sm text-destructive" role="alert">
                Meta rejected the access token, so replies are not reaching Customers. Generate a
                new permanent token in Meta Business Settings and reconnect this number.
              </p>
            ) : null}
            <div className="grid gap-1">
              <p className="text-sm font-medium">
                {current.verifiedName ?? "Connected number"} · {current.displayPhoneNumber}
              </p>
              <p className="text-sm text-muted-foreground">
                Access token ending in ••••{current.accessTokenLastFour}
              </p>
            </div>

            <Field orientation="horizontal">
              <div className="grid gap-1">
                <FieldLabel htmlFor="whatsapp-enabled">Channel enabled</FieldLabel>
                <FieldDescription>
                  Disable delivery without deleting the configuration.
                </FieldDescription>
              </div>
              <Switch
                id="whatsapp-enabled"
                checked={current.enabled}
                disabled={update.isPending}
                onCheckedChange={setEnabled}
              />
            </Field>

            <Credential label="Callback URL" value={current.callbackUrl} onCopy={copy} />
            <Credential label="Verify token" value={current.verifyToken} onCopy={copy} />

            <form className="grid gap-4 border-t pt-5" onSubmit={handleReplacement}>
              <Field>
                <FieldLabel htmlFor="whatsapp-replacement-access-token">
                  New permanent access token
                </FieldLabel>
                <Input
                  required
                  autoComplete="off"
                  id="whatsapp-replacement-access-token"
                  type="password"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="whatsapp-replacement-app-secret">
                  New App Secret (optional)
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="whatsapp-replacement-app-secret"
                  type="password"
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                />
              </Field>
              <Button disabled={replaceCredentials.isPending} type="submit">
                {replaceCredentials.isPending ? "Verifying…" : "Replace credentials"}
              </Button>
            </form>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="whatsapp-phone-number-id">Phone Number ID</FieldLabel>
              <Input
                required
                id="whatsapp-phone-number-id"
                value={phoneNumberId}
                onChange={(event) => setPhoneNumberId(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="whatsapp-business-account-id">
                WhatsApp Business Account ID
              </FieldLabel>
              <Input
                required
                id="whatsapp-business-account-id"
                value={businessAccountId}
                onChange={(event) => setBusinessAccountId(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="whatsapp-access-token">Permanent access token</FieldLabel>
              <Input
                required
                autoComplete="off"
                id="whatsapp-access-token"
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="whatsapp-app-secret">App Secret</FieldLabel>
              <Input
                required
                autoComplete="off"
                id="whatsapp-app-secret"
                type="password"
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
              />
            </Field>
            <Button disabled={verify.isPending} type="submit">
              {verify.isPending ? "Verifying…" : "Verify credentials"}
            </Button>
          </form>
        )}

        <ol className="grid list-decimal gap-3 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Create a Business app in Meta and add the WhatsApp product.</li>
          <li>Copy the four values shown in WhatsApp API Setup and App Settings into this form.</li>
          <li>Verify the credentials here. Nothing is saved until Meta accepts them.</li>
          <li>
            After verification, copy the revealed callback URL and verify token into Meta's webhook
            configuration, then subscribe to messages.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}

function Credential({
  label,
  onCopy,
  value,
}: {
  label: string;
  onCopy: (value: string, label: string) => Promise<void>;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input className="font-mono text-xs" readOnly value={value} />
        <Button type="button" variant="outline" onClick={() => void onCopy(value, label)}>
          Copy
        </Button>
      </div>
    </Field>
  );
}

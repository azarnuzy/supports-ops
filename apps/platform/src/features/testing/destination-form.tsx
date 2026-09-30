import type { EvalBackend, EvalDestinationReadiness } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { toast } from "@repo/ui/components/sonner";
import { type FormEvent, useEffect, useState } from "react";
import {
  useCheckDestinationMutation,
  useDestinationQuery,
  useSaveDestinationMutation,
} from "./hooks";

const keyLabels: Record<EvalBackend, [string, string]> = {
  LANGFUSE: ["Public key", "Secret key"],
  LENS: ["Ingestion key", "Ingestion secret"],
};

const endpointLabels: Record<EvalDestinationReadiness["endpoint"], string> = {
  accepted: "Endpoint accepted the request",
  blocked: "Endpoint is not allowed (private or unsafe address)",
  rejected: "Endpoint rejected the request",
  unauthorized: "Endpoint rejected the credentials",
  unreachable: "Endpoint could not be reached",
};

const reportLabels: Record<EvalDestinationReadiness["reports"], string> = {
  compatible: "Evaluation reports are supported",
  unchecked: "Report support was not checked",
  unsupported: "Evaluation reports are not supported",
};

const onError = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : "Something went wrong.");

/** Secrets live only in component state until saved; the API returns just their last four. */
export function DestinationForm() {
  const query = useDestinationQuery();
  const save = useSaveDestinationMutation();
  const check = useCheckDestinationMutation();
  const saved = query.data?.evalDestination;
  const [backend, setBackend] = useState<EvalBackend>("LENS");
  const [endpoint, setEndpoint] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  useEffect(() => {
    if (!saved) return;
    setBackend(saved.backend);
    setEndpoint(saved.endpoint);
    setDashboardUrl(saved.dashboardUrl);
  }, [saved]);

  const [publicLabel, secretLabel] = keyLabels[backend];
  const readiness = check.data?.readiness;

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(
      {
        backend,
        dashboardUrl,
        endpoint,
        publicKey: publicKey || undefined,
        secretKey: secretKey || undefined,
      },
      {
        onError,
        onSuccess: () => {
          setPublicKey("");
          setSecretKey("");
          check.reset();
          toast.success("Evaluation destination saved.");
        },
      },
    );
  }

  return (
    <form className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm" onSubmit={submit}>
      <div>
        <h2 className="font-medium">Evaluation destination</h2>
        <p className="text-sm text-muted-foreground">
          Where Eval Run reports are sent. Credentials are stored encrypted and never shown again.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="eval-backend">Backend</FieldLabel>
        <NativeSelect
          id="eval-backend"
          value={backend}
          onChange={(e) => setBackend(e.target.value as EvalBackend)}
        >
          <NativeSelectOption value="LENS">Anvia Lens</NativeSelectOption>
          <NativeSelectOption value="LANGFUSE">Langfuse</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="eval-endpoint">Endpoint</FieldLabel>
        <Input
          id="eval-endpoint"
          type="url"
          required
          placeholder="https://…"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
        <FieldDescription>HTTPS OTLP endpoint of your backend.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="eval-dashboard">Dashboard URL</FieldLabel>
        <Input
          id="eval-dashboard"
          type="url"
          required
          placeholder="https://…"
          value={dashboardUrl}
          onChange={(e) => setDashboardUrl(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="eval-public">{publicLabel}</FieldLabel>
          <Input
            id="eval-public"
            autoComplete="off"
            required={!saved}
            placeholder={saved ? `••••${saved.publicKeyLastFour}` : ""}
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="eval-secret">{secretLabel}</FieldLabel>
          <Input
            id="eval-secret"
            type="password"
            autoComplete="new-password"
            required={!saved}
            placeholder={saved ? `••••${saved.secretKeyLastFour}` : ""}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
          />
        </Field>
      </div>
      {saved ? (
        <FieldDescription>Leave both keys empty to keep the saved credentials.</FieldDescription>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!saved || check.isPending}
          onClick={() => check.mutate(undefined, { onError })}
        >
          {check.isPending ? "Checking…" : "Check connection"}
        </Button>
        {saved ? (
          <a
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href={saved.dashboardUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open dashboard
          </a>
        ) : null}
      </div>
      {readiness ? (
        <ul className="grid gap-1 text-sm" aria-live="polite">
          <li>Credentials configured</li>
          <li>{endpointLabels[readiness.endpoint]}</li>
          <li>{reportLabels[readiness.reports]}</li>
        </ul>
      ) : null}
    </form>
  );
}

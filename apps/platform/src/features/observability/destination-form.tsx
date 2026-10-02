import type { EvalBackend, EvalDestinationReadiness } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Settings2Icon } from "lucide-react";
import { formatTestingDate } from "../testing/format";
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
} from "../testing/hooks";

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
  const [open, setOpen] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [backend, setBackend] = useState<EvalBackend>("LENS");
  const [endpoint, setEndpoint] = useState("");
  const [dashboardUrl, setDashboardUrl] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [productionTracingEnabled, setProductionTracingEnabled] = useState(false);

  useEffect(() => {
    if (!saved) return;
    setBackend(saved.backend);
    setEndpoint(saved.endpoint);
    setDashboardUrl(saved.dashboardUrl);
    setProductionTracingEnabled(saved.productionTracingEnabled);
  }, [saved]);

  const [publicLabel, secretLabel] = keyLabels[backend];
  const readiness = check.data?.readiness;

  let connectionLabel = "Not checked";
  if (query.isPending) connectionLabel = "Loading…";
  else if (query.isError) connectionLabel = "Unavailable";
  else if (!saved) connectionLabel = "Not configured";
  else if (check.isPending) connectionLabel = "Checking…";
  else if (check.isError) connectionLabel = "Check failed";
  else if (readiness) {
    if (readiness.endpoint !== "accepted") connectionLabel = "Connection failed";
    else if (readiness.reports === "compatible") connectionLabel = "Connected";
    else if (readiness.reports === "unsupported") connectionLabel = "Reports unsupported";
    else connectionLabel = "Endpoint accepted · reports not checked";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(
      {
        backend,
        dashboardUrl,
        endpoint,
        publicKey: publicKey || undefined,
        secretKey: secretKey || undefined,
        productionTracingEnabled,
      },
      {
        onError,
        onSuccess: () => {
          setPublicKey("");
          setSecretKey("");
          check.reset();
          setCheckedAt(null);
          setOpen(false);
          toast.success("Observability destination saved.");
        },
      },
    );
  }

  function toggleOpen(next: boolean) {
    if (save.isPending) return;
    setOpen(next);
    setPublicKey("");
    setSecretKey("");
    setBackend(saved?.backend ?? "LENS");
    setEndpoint(saved?.endpoint ?? "");
    setDashboardUrl(saved?.dashboardUrl ?? "");
    setProductionTracingEnabled(saved?.productionTracingEnabled ?? false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">Observability destination</h2>
            {saved && (
              <span className="text-xs text-muted-foreground">
                {saved.backend === "LENS" ? "Anvia Lens" : "Langfuse"}
              </span>
            )}
            <Badge
              variant={
                check.isError ||
                (readiness &&
                  (readiness.endpoint !== "accepted" || readiness.reports === "unsupported"))
                  ? "destructive"
                  : "outline"
              }
            >
              {connectionLabel}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground" title={saved?.endpoint}>
            {saved
              ? saved.endpoint.replace(/^https?:\/\//, "")
              : "Connect a destination for Workspace evaluations and chat Telemetry."}
            {checkedAt ? ` · Last checked ${formatTestingDate(checkedAt)}` : ""}
          </p>
          {saved && (
            <p className="text-xs text-muted-foreground">
              Production chat Telemetry: {saved.productionTracingEnabled ? "On" : "Off"}
            </p>
          )}
          {check.isError && (
            <p className="text-xs text-destructive" role="alert">
              Unable to check this destination. Try again.
            </p>
          )}
          {readiness &&
            (readiness.endpoint !== "accepted" || readiness.reports !== "compatible") && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {endpointLabels[readiness.endpoint]} · {reportLabels[readiness.reports]}
              </p>
            )}
          {query.isError && (
            <Button
              size="sm"
              variant="link"
              className="justify-self-start px-0"
              onClick={() => void query.refetch()}
            >
              Retry loading destination
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved && (
            <Button
              size="sm"
              variant="ghost"
              disabled={check.isPending || save.isPending}
              onClick={() =>
                check.mutate(undefined, { onError, onSettled: () => setCheckedAt(Date.now()) })
              }
            >
              {check.isPending ? "Checking…" : "Check connection"}
            </Button>
          )}
          {saved && (
            <Button size="sm" variant="ghost" asChild>
              <a href={saved.dashboardUrl} rel="noreferrer" target="_blank">
                Open dashboard
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={query.isPending || query.isError || check.isPending}
            onClick={() => toggleOpen(true)}
          >
            <Settings2Icon className="size-3.5" />
            {saved ? "Edit" : "Configure"}
          </Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={toggleOpen}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
          showCloseButton={!save.isPending}
        >
          <DialogHeader>
            <DialogTitle>Observability destination</DialogTitle>
            <DialogDescription>
              Shared by Testing and this Workspace's production chat Telemetry. Credentials are
              encrypted and masked after saving.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit}>
            <fieldset disabled={save.isPending} className="grid gap-4">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="eval-backend">Backend</FieldLabel>
                <NativeSelect
                  id="eval-backend"
                  value={backend}
                  onChange={(e) => setBackend(e.target.value as EvalBackend)}
                >
                  <NativeSelectOption value="LENS">Anvia Lens</NativeSelectOption>
                  <NativeSelectOption value="LANGFUSE">Langfuse</NativeSelectOption>
                </NativeSelect>
                <FieldDescription className="text-xs">
                  Select the backend that receives this Workspace's evaluations and Telemetry.
                </FieldDescription>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="eval-endpoint">Endpoint</FieldLabel>
                <Input
                  id="eval-endpoint"
                  type="url"
                  required
                  placeholder="https://your-backend.example.com/v1/traces"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  HTTPS OTLP endpoint of your backend.
                </FieldDescription>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="eval-dashboard">Dashboard URL</FieldLabel>
                <Input
                  id="eval-dashboard"
                  type="url"
                  required
                  placeholder="https://your-backend.example.com"
                  value={dashboardUrl}
                  onChange={(e) => setDashboardUrl(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  URL to open when reviewing answers, scores and traces.
                </FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="eval-public">{publicLabel}</FieldLabel>
                  <Input
                    id="eval-public"
                    autoComplete="off"
                    required={!saved || backend !== saved.backend}
                    type="password"
                    placeholder={
                      saved && backend === saved.backend
                        ? `••••${saved.publicKeyLastFour}`
                        : `Enter ${publicLabel.toLowerCase()}`
                    }
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                  />
                  <FieldDescription className="text-xs">
                    Provided by your selected backend.
                  </FieldDescription>
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="eval-secret">{secretLabel}</FieldLabel>
                  <Input
                    id="eval-secret"
                    type="password"
                    autoComplete="new-password"
                    required={!saved || backend !== saved.backend}
                    placeholder={
                      saved && backend === saved.backend
                        ? `••••${saved.secretKeyLastFour}`
                        : `Enter ${secretLabel.toLowerCase()}`
                    }
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                  />
                  <FieldDescription className="text-xs">
                    Provided by your backend; stored securely after saving.
                  </FieldDescription>
                </Field>
              </div>
              {saved && backend === saved.backend ? (
                <FieldDescription className="text-xs">
                  Leave both keys empty to keep the saved credentials.
                </FieldDescription>
              ) : null}
              <Field className="gap-1.5">
                <FieldLabel htmlFor="production-tracing">
                  <input
                    id="production-tracing"
                    type="checkbox"
                    checked={productionTracingEnabled}
                    onChange={(event) => setProductionTracingEnabled(event.target.checked)}
                  />
                  Send production chat Telemetry
                </FieldLabel>
                <FieldDescription className="text-xs">
                  Send live chat traces for this Workspace only. Testing uses this destination even
                  when this is off. Changes apply to new operations.
                </FieldDescription>
              </Field>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => toggleOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

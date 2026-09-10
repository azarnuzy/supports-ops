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
import { Switch } from "@repo/ui/components/switch";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { useAiSettingsForm } from "./ai.hooks";

const AiSettingsView = () => {
  const { form, handleSubmit, save, settings, update } = useAiSettingsForm();

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Workspace settings</p>
          <h1 className="text-3xl font-semibold text-balance">AI Agent</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Set when the AI Agent checks in after Customer silence and when it can resolve an
            inactive Ticket.
          </p>
        </div>
        <SettingsNav />
        {settings.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {form ? (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Follow-Up and Auto-Resolution</CardTitle>
              <CardDescription>
                These timers only run while the AI Agent owns the Ticket.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="follow-up-delay">Follow-Up delay (seconds)</FieldLabel>
                  <Input
                    id="follow-up-delay"
                    type="number"
                    min={1}
                    value={form.followUpAfterSeconds}
                    onChange={(event) => update("followUpAfterSeconds", Number(event.target.value))}
                  />
                  <FieldDescription>
                    After this silence, the AI Agent asks whether its answer helped.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="auto-resolve-delay">
                    Auto-Resolution delay (seconds)
                  </FieldLabel>
                  <Input
                    id="auto-resolve-delay"
                    type="number"
                    min={1}
                    value={form.autoResolveAfterSeconds}
                    onChange={(event) =>
                      update("autoResolveAfterSeconds", Number(event.target.value))
                    }
                  />
                </Field>
                <Field>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <FieldLabel htmlFor="auto-resolve-enabled">Enable Auto-Resolution</FieldLabel>
                      <FieldDescription>
                        Resolve only after a sent Follow-Up also receives no reply.
                      </FieldDescription>
                    </div>
                    <Switch
                      id="auto-resolve-enabled"
                      checked={form.autoResolveEnabled}
                      onCheckedChange={(checked) => update("autoResolveEnabled", checked)}
                    />
                  </div>
                </Field>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default AiSettingsView;

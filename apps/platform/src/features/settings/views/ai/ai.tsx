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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import { useAiSettingsForm } from "./ai.hooks";

const AiAgentView = () => {
  const { form, handleSubmit, save, settings, update } = useAiSettingsForm();

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="AI Agent"
          description="Set the instructions your agent follows and the messages it sends when it transfers or ends a conversation. Its tools live on the Tools page."
        />
        {settings.isPending ? (
          <div className="grid max-w-3xl gap-5">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : null}
        {form ? (
          <div className="grid max-w-3xl gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Instructions and messages</CardTitle>
                <CardDescription>Platform safety rules always remain in effect.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field>
                  <FieldLabel className="text-sm font-medium" htmlFor="ai-instructions">
                    Instructions
                  </FieldLabel>
                  <Textarea
                    id="ai-instructions"
                    maxLength={10000}
                    rows={8}
                    placeholder="You are the support assistant for Acme. Answer from the Knowledge Base, keep replies to two short paragraphs, and hand off to a Human Agent for refunds or account deletion."
                    value={form.instructions}
                    onChange={(event) => update("instructions", event.target.value)}
                  />
                  <FieldDescription>
                    Tone, scope, and escalation rules. {form.instructions.length}/10000
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel className="text-sm font-medium" htmlFor="handoff-message">
                    Transfer to human message
                  </FieldLabel>
                  <Textarea
                    id="handoff-message"
                    maxLength={1000}
                    rows={2}
                    placeholder="{humanAgentName} from our team is picking this up now — thanks for your patience."
                    value={form.handoffMessage}
                    onChange={(event) => update("handoffMessage", event.target.value)}
                  />
                  <FieldDescription>
                    Sent the moment a teammate takes over the Ticket. Use{" "}
                    <span className="font-mono">{"{humanAgentName}"}</span> to insert their name.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel className="text-sm font-medium" htmlFor="resolution-message">
                    End conversation message
                  </FieldLabel>
                  <Textarea
                    id="resolution-message"
                    maxLength={1000}
                    rows={2}
                    placeholder="I've marked this as resolved. Reply any time if it comes back."
                    value={form.resolutionMessage}
                    onChange={(event) => update("resolutionMessage", event.target.value)}
                  />
                  <FieldDescription>
                    Sent when the agent closes a Ticket on its own.
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-Up and Auto-Resolution</CardTitle>
                <CardDescription>
                  These timers only run while the AI Agent owns the Ticket.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-5" onSubmit={handleSubmit}>
                  <Field>
                    <FieldLabel className="text-sm font-medium" htmlFor="follow-up-delay">
                      Follow-Up delay (seconds)
                    </FieldLabel>
                    <Input
                      id="follow-up-delay"
                      type="number"
                      min={1}
                      value={form.followUpAfterSeconds}
                      onChange={(event) =>
                        update("followUpAfterSeconds", Number(event.target.value))
                      }
                    />
                    <FieldDescription>
                      After this much Customer silence, the AI Agent asks whether its answer helped.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel className="text-sm font-medium" htmlFor="auto-resolve-delay">
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
                    <FieldDescription>
                      Counted from the Follow-Up, not from the last Customer message.
                    </FieldDescription>
                  </Field>
                  <Field className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="grid gap-1">
                        <FieldLabel className="text-sm font-medium" htmlFor="auto-resolve-enabled">
                          Enable Auto-Resolution
                        </FieldLabel>
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
                  <Field>
                    <FieldLabel className="text-sm font-medium" htmlFor="idle-close-delay">
                      Human-owned Ticket silence limit (seconds)
                    </FieldLabel>
                    <Input
                      id="idle-close-delay"
                      type="number"
                      min={1}
                      value={form.idleCloseAfterSeconds}
                      onChange={(event) =>
                        update("idleCloseAfterSeconds", Number(event.target.value))
                      }
                    />
                    <FieldDescription>
                      Close a claimed or unclaimed Ticket after this much Customer silence. Human
                      replies do not reset the timer.
                    </FieldDescription>
                  </Field>
                  <div className="flex justify-end border-t pt-5">
                    <Button type="submit" disabled={save.isPending}>
                      {save.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default AiAgentView;

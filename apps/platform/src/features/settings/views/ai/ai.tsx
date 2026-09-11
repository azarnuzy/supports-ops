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
import { toast } from "@repo/ui/components/sonner";
import type { TicketCategory } from "@repo/api-client";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import { ToolPolicies } from "./components";
import {
  useAgentToolsQuery,
  useAiSettingsForm,
  useRemoveCategoryPolicyMutation,
  useSetCategoryPolicyMutation,
} from "./ai.hooks";

const AiAgentView = () => {
  const { form, handleSubmit, save, settings, update } = useAiSettingsForm();
  const aiAgentId = settings.data?.aiSettings.aiAgentId;
  const agentTools = useAgentToolsQuery(aiAgentId);
  const setCategoryPolicy = useSetCategoryPolicyMutation(aiAgentId);
  const removeCategoryPolicy = useRemoveCategoryPolicyMutation(aiAgentId);

  function handlePolicyChange(category: TicketCategory, toolId: string | null) {
    if (!aiAgentId) return;
    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to update the Tool Policy.");
    if (toolId) setCategoryPolicy.mutate({ aiAgentId, category, toolId }, { onError });
    else removeCategoryPolicy.mutate({ aiAgentId, category }, { onError });
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="AI Agent"
          description="Set the instructions your agent follows, the messages it sends when it transfers or ends a conversation, and the rules that pick a tool per category."
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
                  <div className="flex justify-end border-t pt-5">
                    <Button type="submit" disabled={save.isPending}>
                      {save.isPending ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Routing rules</CardTitle>
                <CardDescription>
                  Every conversation is sorted into one of five fixed categories automatically. A
                  rule guarantees that a tool runs and its result reaches the agent before it
                  answers that kind of ticket — and if the tool fails, the ticket goes to a
                  teammate instead of getting a guess. Categories without a rule are left to the
                  agent's own judgement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentTools.isPending ? (
                  <Skeleton className="h-24 w-full rounded-lg" />
                ) : (
                  <ToolPolicies
                    tools={agentTools.data?.tools ?? []}
                    onChange={handlePolicyChange}
                    isPending={setCategoryPolicy.isPending || removeCategoryPolicy.isPending}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>
    </PlatformAppShell>
  );
};

export default AiAgentView;

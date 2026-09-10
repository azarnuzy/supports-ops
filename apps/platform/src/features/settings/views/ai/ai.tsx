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
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import type { TicketCategory } from "@repo/api-client";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { ToolAssignments, ToolPolicies } from "./components";
import {
  useAgentToolsQuery,
  useAiSettingsForm,
  useAssignToolMutation,
  useRemoveCategoryPolicyMutation,
  useSetCategoryPolicyMutation,
} from "./ai.hooks";

const AiSettingsView = () => {
  const { form, handleSubmit, save, settings, update } = useAiSettingsForm();
  const aiAgentId = settings.data?.aiSettings.aiAgentId;
  const agentTools = useAgentToolsQuery(aiAgentId);
  const assignTool = useAssignToolMutation(aiAgentId);
  const setCategoryPolicy = useSetCategoryPolicyMutation(aiAgentId);
  const removeCategoryPolicy = useRemoveCategoryPolicyMutation(aiAgentId);

  function handleToggleAssignment(toolId: string, assigned: boolean) {
    if (!aiAgentId) return;
    assignTool.mutate(
      { aiAgentId, assigned, toolId },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to update the assignment."),
      },
    );
  }

  function handlePolicyChange(category: TicketCategory, toolId: string | null) {
    if (!aiAgentId) return;
    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to update the Tool Policy.");
    if (toolId) setCategoryPolicy.mutate({ aiAgentId, category, toolId }, { onError });
    else removeCategoryPolicy.mutate({ aiAgentId, category }, { onError });
  }

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Workspace settings</p>
          <h1 className="text-3xl font-semibold text-balance">AI Agent</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Configure how the AI Agent responds and handles Ticket lifecycle messages.
          </p>
        </div>
        <SettingsNav />
        {settings.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {form ? (
          <div className="grid max-w-xl gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Instructions and messages</CardTitle>
                <CardDescription>Platform safety rules always remain in effect.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Field>
                  <FieldLabel htmlFor="ai-instructions">Instructions</FieldLabel>
                  <Textarea
                    id="ai-instructions"
                    maxLength={10000}
                    value={form.instructions}
                    onChange={(event) => update("instructions", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="handoff-message">Claim-time Handoff Message</FieldLabel>
                  <Textarea
                    id="handoff-message"
                    maxLength={1000}
                    value={form.handoffMessage}
                    onChange={(event) => update("handoffMessage", event.target.value)}
                  />
                  <FieldDescription>
                    Use {"{humanAgentName}"} for the claiming Human Agent.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="resolution-message">AI Resolution Message</FieldLabel>
                  <Textarea
                    id="resolution-message"
                    maxLength={1000}
                    value={form.resolutionMessage}
                    onChange={(event) => update("resolutionMessage", event.target.value)}
                  />
                </Field>
              </CardContent>
            </Card>
            <Card>
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
                      onChange={(event) =>
                        update("followUpAfterSeconds", Number(event.target.value))
                      }
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
                        <FieldLabel htmlFor="auto-resolve-enabled">
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
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tool assignments</CardTitle>
                <CardDescription>
                  Only assigned Tools can be called for this AI Agent, from any Workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentTools.isPending ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <ToolAssignments
                    tools={agentTools.data?.tools ?? []}
                    onToggle={handleToggleAssignment}
                    isPending={assignTool.isPending}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tool Policies</CardTitle>
                <CardDescription>
                  A required Tool runs before the response is generated for that Ticket Category.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentTools.isPending ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
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

export default AiSettingsView;

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Separator } from "@repo/ui/components/separator";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { Link } from "@tanstack/react-router";
import { ShieldCheckIcon } from "lucide-react";
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
  const { form: values, handleReset, handleSubmit, isDirty, save, update, validationError } = form;

  if (!values) return null;

  return (
    <Card className="gap-5">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-base">AI Agent configuration</CardTitle>
          <CardDescription>
            Tone, scope, and the messages Customers see when the agent hands off or resolves a
            Ticket.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          <Separator />

          <SectionHeading
            title="Instructions"
            description="How the agent should behave: tone, scope, and what it should and shouldn't do."
          />

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="ai-instructions">
              Instructions
            </FieldLabel>
            <Textarea
              id="ai-instructions"
              maxLength={10000}
              rows={8}
              placeholder="You are the support assistant for Acme. Answer from the Knowledge Base, keep replies to two short paragraphs, and hand off to a Human Agent for refunds or account deletion."
              value={values.instructions}
              onChange={(event) => update("instructions", event.target.value)}
            />
            <FieldDescription>
              Tone, scope, and escalation rules. {values.instructions.length}/10000
            </FieldDescription>
          </Field>

          <Separator />

          <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,1fr)] sm:items-center sm:p-5">
            <div className="grid gap-1.5">
              <FieldLabel className="text-sm font-semibold" htmlFor="agent-model">
                Agent Model
              </FieldLabel>
              <FieldDescription className="leading-relaxed">
                Choose the model used for Customer replies, Follow-Ups, and AI Agent assistance.
                Changes apply from the next reply.
              </FieldDescription>
            </div>
            <Select
              value={values.agentModel}
              onValueChange={(value) => update("agentModel", value)}
            >
              <SelectTrigger id="agent-model" className="h-10 w-full">
                <SelectValue placeholder="Select a model">
                  {values.modelCatalog.find((model) => model.id === values.agentModel)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-[min(28rem,var(--radix-select-trigger-width))]">
                {values.modelCatalog.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="py-2.5">
                    <span className="grid gap-0.5 text-left">
                      <span className="font-medium">{model.name}</span>
                      <span className="text-xs leading-snug text-muted-foreground">
                        {model.description} · {model.rate} Credit{model.rate === 1 ? "" : "s"} per
                        reply
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <SectionHeading
            title="Customer messages"
            description="The copy Customers read when the agent transfers or ends a conversation."
          />

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="handoff-message">
              Transfer to human message
            </FieldLabel>
            <Textarea
              id="handoff-message"
              maxLength={1000}
              rows={2}
              placeholder="{humanAgentName} from our team is picking this up now — thanks for your patience."
              value={values.handoffMessage}
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
              value={values.resolutionMessage}
              onChange={(event) => update("resolutionMessage", event.target.value)}
            />
            <FieldDescription>Sent when the agent closes a Ticket on its own.</FieldDescription>
          </Field>

          <Separator />

          <SectionHeading
            title="Follow-Up and Auto-Resolution"
            description="These timers only run while the AI Agent owns the Ticket."
          />

          <Field>
            <FieldLabel className="text-sm font-medium" htmlFor="follow-up-delay">
              Follow-Up delay (seconds)
            </FieldLabel>
            <Input
              id="follow-up-delay"
              type="number"
              min={1}
              value={values.followUpAfterSeconds}
              onChange={(event) => update("followUpAfterSeconds", Number(event.target.value))}
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
              value={values.autoResolveAfterSeconds}
              onChange={(event) => update("autoResolveAfterSeconds", Number(event.target.value))}
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
                checked={values.autoResolveEnabled}
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
              value={values.idleCloseAfterSeconds}
              onChange={(event) => update("idleCloseAfterSeconds", Number(event.target.value))}
            />
            <FieldDescription>
              Close a claimed or unclaimed Ticket after this much Customer silence. Human replies do
              not reset the timer.
            </FieldDescription>
          </Field>

          <Separator />

          <SectionHeading
            title="Knowledge, tools, and safety"
            description="What the agent can draw on and the limits it always operates within."
          />

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-[13px] leading-relaxed text-muted-foreground">
            <p className="flex items-start gap-2">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
              Platform safety rules always remain in effect and cannot be turned off here.
            </p>
            <p>
              Knowledge Sources and Tools are managed on their own pages —{" "}
              <Link
                className="font-medium text-foreground underline underline-offset-2"
                to="/knowledge"
              >
                Knowledge
              </Link>{" "}
              and{" "}
              <Link
                className="font-medium text-foreground underline underline-offset-2"
                to="/agent/tools"
              >
                Tools
              </Link>
              . Escalation to a Human Agent uses the transfer message above.
            </p>
          </div>

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
            <Button type="submit" disabled={!isDirty || Boolean(validationError) || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

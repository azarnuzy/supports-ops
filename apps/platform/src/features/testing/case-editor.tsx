import { type EvalCase, type EvalCaseInput, type EvalMetric, evalMetrics } from "@repo/api-client";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";

const decisions = ["REPLY", "CLARIFY", "ESCALATE", "RESOLVE"] as const;

export const metricLabels: Record<EvalMetric, string> = {
  contains: "Contains",
  decision: "Decision",
  exactMatch: "Exact match",
  faithfulness: "Faithfulness",
  gEval: "gEval",
  language: "Language",
  negativeControl: "Negative control",
  relevancy: "Relevance",
  retrieval: "Retrieval",
  tool: "Tool",
  visibility: "Visibility",
};

const metricDescriptions: Record<EvalMetric, string> = {
  contains: "Check that the reply contains the expected text.",
  exactMatch: "Compare the reply with the exact reference answer.",
  decision: "Check the AI Agent decision against the selected acceptable actions.",
  faithfulness: "Judge whether claims are supported by retrieved context.",
  gEval: "Judge the answer against your reference answer and grading criteria.",
  language: "Check that the reply uses the expected language.",
  negativeControl: "Check evaluator health with a case designed to fail.",
  relevancy: "Judge how well the reply addresses the Customer Message.",
  retrieval: "Check retrieval against expected passages and sources.",
  tool: "Check whether a named Tool is called or avoided.",
  visibility: "Check that the reply never contains forbidden phrases.",
};

/** Turns one-per-line text into a list; empty means "not set" so the API sees no expectation. */
const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Retrieval passages are edited as `source | fragment | grade(optional 1 or 2)` lines. */
function parsePassages(text: string) {
  return lines(text).map((line) => {
    const [source = "", fragment = "", grade] = line.split("|").map((part) => part.trim());
    return {
      fragment,
      grade: grade === "1" ? (1 as const) : grade === "2" ? (2 as const) : undefined,
      source,
    };
  });
}

const passagesText = (passages: NonNullable<EvalCaseInput["metadata"]["expectedPassages"]>) =>
  passages.map((p) => [p.source, p.fragment, p.grade].filter(Boolean).join(" | ")).join("\n");

/** Which metric-specific inputs make sense for a metric (mirrors the API's `caseIssues`). */
const needsExpected = (metric: EvalMetric | "") =>
  ["contains", "exactMatch", "gEval"].includes(metric);

export function CaseEditor({
  existing,
  isSaving,
  nextKey,
  onClose,
  onSave,
}: {
  existing: EvalCase | null;
  isSaving: boolean;
  nextKey: string;
  onClose: () => void;
  onSave: (input: EvalCaseInput) => void;
}) {
  const [caseKey, setCaseKey] = useState(existing?.caseKey ?? nextKey);
  const [category, setCategory] = useState(existing?.category ?? "");
  const [message, setMessage] = useState(existing?.message ?? "");
  const [history, setHistory] = useState(() =>
    (existing?.history ?? []).map((turn) => ({ ...turn, key: crypto.randomUUID() })),
  );
  const [clarificationCount, setClarificationCount] = useState(existing?.clarificationCount ?? 0);
  const [attachments, setAttachments] = useState(() =>
    (existing?.attachments ?? []).map((attachment) => ({
      ...attachment,
      key: crypto.randomUUID(),
    })),
  );
  const [expected, setExpected] = useState(existing?.expected ?? "");
  const [metric, setMetric] = useState<EvalMetric | "">(existing?.metric ?? "");
  const meta = existing?.metadata ?? {};
  const [decisionSet, setDecisionSet] = useState<string[]>(meta.decisions ?? []);
  const [tool, setTool] = useState(meta.tool ?? "");
  const [toolMustNotBeCalled, setToolMustNotBeCalled] = useState(meta.toolMustNotBeCalled ?? false);
  const [canaries, setCanaries] = useState((meta.canaries ?? []).join("\n"));
  const [language, setLanguage] = useState(meta.language ?? "");
  const [passages, setPassages] = useState(passagesText(meta.expectedPassages ?? []));
  const [retrievalTarget, setRetrievalTarget] = useState(meta.retrievalTarget ?? "agent");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const metadata: EvalCaseInput["metadata"] = {};
    if (metric === "decision") metadata.decisions = decisionSet as never;
    if (metric === "tool") {
      metadata.tool = tool;
      metadata.toolMustNotBeCalled = toolMustNotBeCalled;
    }
    if (metric === "visibility") metadata.canaries = lines(canaries);
    if (metric === "language" && language) metadata.language = language as "en" | "id";
    if (metric === "retrieval") {
      metadata.expectedPassages = parsePassages(passages);
      metadata.retrievalTarget = retrievalTarget;
    }
    onSave({
      attachments: attachments
        .filter((a) => a.id.trim())
        .map(({ id, content }) => ({ id, content })),
      caseKey,
      category,
      clarificationCount,
      expected,
      history: history
        .filter((turn) => turn.content.trim())
        .map(({ role, content }) => ({ role, content })),
      message,
      metadata,
      metric: metric || null,
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl" showCloseButton={false}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b">
            <div>
              <SheetTitle>{existing ? "Edit case" : "Add case"}</SheetTitle>
              <SheetDescription className="sr-only">
                One fixed input and what a correct AI Agent response looks like.
              </SheetDescription>
            </div>
            <div className="flex gap-2">
              <Button disabled={isSaving} type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={isSaving || !message.trim() || !caseKey.trim()} type="submit">
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="case-key">Case ID</FieldLabel>
                <Input
                  id="case-key"
                  placeholder="e.g. refund-policy-1"
                  maxLength={100}
                  required
                  value={caseKey}
                  onChange={(e) => setCaseKey(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  Unique in this Workspace. Use letters, digits, dots, underscores, colons or
                  hyphens.
                </FieldDescription>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="case-category">Category</FieldLabel>
                <Input
                  id="case-category"
                  maxLength={60}
                  placeholder="e.g. grounding"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  Optional requirement group, such as grounding or escalation.
                </FieldDescription>
              </Field>
            </div>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="case-message">Customer Message</FieldLabel>
              <Textarea
                id="case-message"
                placeholder="e.g. Can I get a refund for my annual subscription?"
                maxLength={4000}
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <FieldDescription className="text-xs">
                The new Customer Message evaluated in one AI Turn.
              </FieldDescription>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="case-metric">Evaluation type</FieldLabel>
              <NativeSelect
                id="case-metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value as EvalMetric | "")}
              >
                <NativeSelectOption value="">Choose an evaluation type…</NativeSelectOption>
                {evalMetrics.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {metricLabels[m]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription className="text-xs">
                {metric
                  ? metricDescriptions[metric]
                  : "Choose what this case checks. Only relevant expectations appear below."}
              </FieldDescription>
              {metric === "negativeControl" ? (
                <FieldDescription className="text-xs">
                  An evaluator-health check: it is expected to fail, and that is not a regression.
                </FieldDescription>
              ) : null}
            </Field>

            {needsExpected(metric) && (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="case-expected">Expected answer or behaviour</FieldLabel>
                <Textarea
                  id="case-expected"
                  placeholder="e.g. Explain how to reset a password using the published help article."
                  maxLength={4000}
                  rows={3}
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  {metric === "contains"
                    ? "Text that must appear in the reply."
                    : metric === "exactMatch"
                      ? "The exact reference reply this case should produce."
                      : "The reference answer or behaviour the Judge should use."}{" "}
                  Required to run this case.
                </FieldDescription>
              </Field>
            )}

            {metric === "decision" ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Accepted decisions</legend>
                <FieldDescription className="text-xs">
                  Select one or more acceptable AI Agent actions.
                </FieldDescription>
                {decisions.map((decision) => (
                  <label
                    htmlFor={`case-decision-${decision}`}
                    className="flex items-center gap-2 text-sm"
                    key={decision}
                  >
                    <Checkbox
                      id={`case-decision-${decision}`}
                      checked={decisionSet.includes(decision)}
                      onCheckedChange={(checked) =>
                        setDecisionSet(
                          checked === true
                            ? [...decisionSet, decision]
                            : decisionSet.filter((item) => item !== decision),
                        )
                      }
                    />
                    {decision.charAt(0) + decision.slice(1).toLowerCase()}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {metric === "tool" ? (
              <div className="grid gap-3">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="case-tool">Tool name</FieldLabel>
                  <Input
                    placeholder="e.g. lookup-order"
                    maxLength={200}
                    id="case-tool"
                    value={tool}
                    onChange={(e) => setTool(e.target.value)}
                  />
                  <FieldDescription className="text-xs">
                    Use the exact name of a Tool assigned to your AI Agent.
                  </FieldDescription>
                </Field>
                <label
                  htmlFor="case-tool-must-not-be-called"
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    id="case-tool-must-not-be-called"
                    checked={toolMustNotBeCalled}
                    onCheckedChange={(checked) => setToolMustNotBeCalled(checked === true)}
                  />
                  The Tool must not be called
                </label>
              </div>
            ) : null}
            {metric === "visibility" ? (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="case-canaries">Forbidden phrases</FieldLabel>
                <Textarea
                  placeholder={"internal-only phrase\nconfidential policy"}
                  id="case-canaries"
                  rows={3}
                  value={canaries}
                  onChange={(e) => setCanaries(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  One per line. The reply must never contain them.
                </FieldDescription>
              </Field>
            ) : null}
            {metric === "language" ? (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="case-language">Expected language</FieldLabel>
                <NativeSelect
                  id="case-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "" | "en" | "id")}
                >
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                  <NativeSelectOption value="id">Indonesian</NativeSelectOption>
                </NativeSelect>
                <FieldDescription className="text-xs">
                  The language the AI Agent should use in its reply.
                </FieldDescription>
              </Field>
            ) : null}
            {metric === "retrieval" ? (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="case-retrieval-target">Retrieval path</FieldLabel>
                <NativeSelect
                  id="case-retrieval-target"
                  value={retrievalTarget}
                  onChange={(e) => setRetrievalTarget(e.target.value as "agent" | "retriever")}
                >
                  <NativeSelectOption value="agent">
                    Full AI Agent turn (charged)
                  </NativeSelectOption>
                  <NativeSelectOption value="retriever">
                    Retriever only (no AI Agent call)
                  </NativeSelectOption>
                </NativeSelect>
                <FieldDescription className="text-xs">
                  Retriever only searches with the Customer Message and charges no AI Turn.
                </FieldDescription>
                <FieldLabel htmlFor="case-passages">Expected passages</FieldLabel>
                <Textarea
                  placeholder="refund-policy | Refunds are available within 30 days | 2"
                  id="case-passages"
                  rows={4}
                  value={passages}
                  onChange={(e) => setPassages(e.target.value)}
                />
                <FieldDescription className="text-xs">
                  One per line: <code>source | fragment | grade</code>. Grade is 1 or 2 and
                  optional.
                </FieldDescription>
              </Field>
            ) : null}
            <Collapsible className="rounded-lg border">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-sm font-medium">
                <span>
                  Conversation context{" "}
                  <span className="font-normal text-muted-foreground">
                    · {history.length} turns · {attachments.length} attachments
                  </span>
                </span>
                <ChevronDownIcon className="size-4 shrink-0" />
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4 border-t p-3">
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Fixed history</legend>
                  <FieldDescription className="text-xs">
                    Earlier turns the AI Agent sees as already said. They are replayed as written,
                    not simulated. Previous AI replies are context only, never expected answers.
                  </FieldDescription>
                  {history.map((turn, index) => (
                    <div className="flex items-start gap-2" key={turn.key}>
                      <NativeSelect
                        aria-label={`Turn ${index + 1} speaker`}
                        value={turn.role}
                        onChange={(e) =>
                          setHistory(
                            history.map((t, i) =>
                              i === index
                                ? { ...t, role: e.target.value as "user" | "assistant" }
                                : t,
                            ),
                          )
                        }
                      >
                        <NativeSelectOption value="user">Customer</NativeSelectOption>
                        <NativeSelectOption value="assistant">AI Agent</NativeSelectOption>
                      </NativeSelect>
                      <Textarea
                        aria-label={`Turn ${index + 1} text`}
                        placeholder="An earlier Customer or AI Agent message"
                        maxLength={4000}
                        rows={2}
                        value={turn.content}
                        onChange={(e) =>
                          setHistory(
                            history.map((t, i) =>
                              i === index ? { ...t, content: e.target.value } : t,
                            ),
                          )
                        }
                      />
                      <Button
                        aria-label={`Remove turn ${index + 1}`}
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setHistory(history.filter((_, i) => i !== index))}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    className="justify-self-start"
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={history.length >= 50}
                    onClick={() =>
                      setHistory([
                        ...history,
                        {
                          content: "",
                          key: crypto.randomUUID(),
                          role: history.at(-1)?.role === "user" ? "assistant" : "user",
                        },
                      ])
                    }
                  >
                    <PlusIcon className="size-4" /> Add turn
                  </Button>
                </fieldset>

                <Field className="gap-1.5">
                  <FieldLabel htmlFor="case-clarifications">Prior clarification count</FieldLabel>
                  <Input
                    id="case-clarifications"
                    placeholder="0"
                    max={10}
                    min={0}
                    type="number"
                    value={clarificationCount}
                    onChange={(e) =>
                      setClarificationCount(Math.min(10, Math.max(0, Number(e.target.value) || 0)))
                    }
                  />
                  <FieldDescription className="text-xs">
                    Number of clarifications already asked before this message (0–10).
                  </FieldDescription>
                </Field>

                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">Attachment content</legend>
                  <FieldDescription className="text-xs">
                    Text already extracted from an Attachment (OCR or transcript).
                  </FieldDescription>
                  {attachments.map((attachment, index) => (
                    <div className="flex items-start gap-2" key={attachment.key}>
                      <Input
                        aria-label={`Attachment ${index + 1} name`}
                        className="w-40"
                        placeholder="e.g. receipt.pdf"
                        maxLength={200}
                        value={attachment.id}
                        onChange={(e) =>
                          setAttachments(
                            attachments.map((a, i) =>
                              i === index ? { ...a, id: e.target.value } : a,
                            ),
                          )
                        }
                      />
                      <Textarea
                        aria-label={`Attachment ${index + 1} content`}
                        placeholder="Extracted document text or transcript"
                        maxLength={50_000}
                        rows={2}
                        value={attachment.content}
                        onChange={(e) =>
                          setAttachments(
                            attachments.map((a, i) =>
                              i === index ? { ...a, content: e.target.value } : a,
                            ),
                          )
                        }
                      />
                      <Button
                        aria-label={`Remove attachment ${index + 1}`}
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    className="justify-self-start"
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={attachments.length >= 10}
                    onClick={() =>
                      setAttachments([
                        ...attachments,
                        { content: "", id: "", key: crypto.randomUUID() },
                      ])
                    }
                  >
                    <PlusIcon className="size-4" /> Add attachment content
                  </Button>
                </fieldset>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

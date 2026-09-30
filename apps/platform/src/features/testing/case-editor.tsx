import {
  type EvalCase,
  type EvalCaseInput,
  type EvalMetric,
  evalMetrics,
} from "@repo/api-client";
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
import { PlusIcon, Trash2Icon } from "lucide-react";
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
    return { fragment, grade: grade === "1" ? (1 as const) : grade === "2" ? (2 as const) : undefined, source };
  });
}

const passagesText = (passages: NonNullable<EvalCaseInput["metadata"]["expectedPassages"]>) =>
  passages.map((p) => [p.source, p.fragment, p.grade].filter(Boolean).join(" | ")).join("\n");

/** Which metric-specific inputs make sense for a metric (mirrors the API's `caseIssues`). */
const needsExpected = (metric: EvalMetric | "") => ["contains", "exactMatch", "gEval"].includes(metric);

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
  const [history, setHistory] = useState(existing?.history ?? []);
  const [clarificationCount, setClarificationCount] = useState(existing?.clarificationCount ?? 0);
  const [attachments, setAttachments] = useState(existing?.attachments ?? []);
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
      attachments: attachments.filter((a) => a.id.trim()),
      caseKey,
      category,
      clarificationCount,
      expected,
      history: history.filter((turn) => turn.content.trim()),
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
              <Field>
                <FieldLabel htmlFor="case-key">Case ID</FieldLabel>
                <Input id="case-key" required value={caseKey} onChange={(e) => setCaseKey(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="case-category">Category</FieldLabel>
                <Input
                  id="case-category"
                  maxLength={60}
                  placeholder="e.g. grounding"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="case-message">Customer Message</FieldLabel>
              <Textarea
                id="case-message"
                maxLength={4000}
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Fixed history</legend>
              <FieldDescription>
                Earlier turns the AI Agent sees as already said. They are replayed as written, not
                simulated.
              </FieldDescription>
              {history.map((turn, index) => (
                <div className="flex items-start gap-2" key={index}>
                  <NativeSelect
                    aria-label={`Turn ${index + 1} speaker`}
                    value={turn.role}
                    onChange={(e) =>
                      setHistory(history.map((t, i) => (i === index ? { ...t, role: e.target.value as "user" | "assistant" } : t)))
                    }
                  >
                    <NativeSelectOption value="user">Customer</NativeSelectOption>
                    <NativeSelectOption value="assistant">AI Agent</NativeSelectOption>
                  </NativeSelect>
                  <Textarea
                    aria-label={`Turn ${index + 1} text`}
                    maxLength={4000}
                    rows={2}
                    value={turn.content}
                    onChange={(e) => setHistory(history.map((t, i) => (i === index ? { ...t, content: e.target.value } : t)))}
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
                onClick={() => setHistory([...history, { content: "", role: history.at(-1)?.role === "user" ? "assistant" : "user" }])}
              >
                <PlusIcon className="size-4" /> Add turn
              </Button>
            </fieldset>

            <Field>
              <FieldLabel htmlFor="case-clarifications">Prior clarification count</FieldLabel>
              <Input
                id="case-clarifications"
                max={10}
                min={0}
                type="number"
                value={clarificationCount}
                onChange={(e) => setClarificationCount(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
              />
            </Field>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Attachment content</legend>
              <FieldDescription>
                Text already extracted from an Attachment (OCR or transcript).
              </FieldDescription>
              {attachments.map((attachment, index) => (
                <div className="flex items-start gap-2" key={index}>
                  <Input
                    aria-label={`Attachment ${index + 1} name`}
                    className="w-40"
                    placeholder="Name"
                    value={attachment.id}
                    onChange={(e) => setAttachments(attachments.map((a, i) => (i === index ? { ...a, id: e.target.value } : a)))}
                  />
                  <Textarea
                    aria-label={`Attachment ${index + 1} content`}
                    rows={2}
                    value={attachment.content}
                    onChange={(e) => setAttachments(attachments.map((a, i) => (i === index ? { ...a, content: e.target.value } : a)))}
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
                onClick={() => setAttachments([...attachments, { content: "", id: "" }])}
              >
                <PlusIcon className="size-4" /> Add attachment content
              </Button>
            </fieldset>

            <Field>
              <FieldLabel htmlFor="case-expected">Expected answer or behaviour</FieldLabel>
              <Textarea
                id="case-expected"
                maxLength={4000}
                rows={3}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
              {needsExpected(metric) ? (
                <FieldDescription>Required for this metric.</FieldDescription>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="case-metric">Metric</FieldLabel>
              <NativeSelect id="case-metric" value={metric} onChange={(e) => setMetric(e.target.value as EvalMetric | "")}>
                <NativeSelectOption value="">Choose a metric…</NativeSelectOption>
                {evalMetrics.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {metricLabels[m]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {metric === "negativeControl" ? (
                <FieldDescription>
                  An evaluator-health check: it is expected to fail, and that is not a regression.
                </FieldDescription>
              ) : null}
            </Field>

            {metric === "decision" ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Accepted decisions</legend>
                {decisions.map((decision) => (
                  <label className="flex items-center gap-2 text-sm" key={decision}>
                    <input
                      checked={decisionSet.includes(decision)}
                      type="checkbox"
                      onChange={(e) =>
                        setDecisionSet(e.target.checked ? [...decisionSet, decision] : decisionSet.filter((d) => d !== decision))
                      }
                    />
                    {decision.charAt(0) + decision.slice(1).toLowerCase()}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {metric === "tool" ? (
              <div className="grid gap-3">
                <Field>
                  <FieldLabel htmlFor="case-tool">Tool name</FieldLabel>
                  <Input id="case-tool" value={tool} onChange={(e) => setTool(e.target.value)} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input checked={toolMustNotBeCalled} type="checkbox" onChange={(e) => setToolMustNotBeCalled(e.target.checked)} />
                  The Tool must not be called
                </label>
              </div>
            ) : null}
            {metric === "visibility" ? (
              <Field>
                <FieldLabel htmlFor="case-canaries">Forbidden phrases</FieldLabel>
                <Textarea id="case-canaries" rows={3} value={canaries} onChange={(e) => setCanaries(e.target.value)} />
                <FieldDescription>One per line. The reply must never contain them.</FieldDescription>
              </Field>
            ) : null}
            {metric === "language" ? (
              <Field>
                <FieldLabel htmlFor="case-language">Expected language</FieldLabel>
                <NativeSelect id="case-language" value={language} onChange={(e) => setLanguage(e.target.value as "" | "en" | "id")}>
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                  <NativeSelectOption value="id">Indonesian</NativeSelectOption>
                </NativeSelect>
              </Field>
            ) : null}
            {metric === "retrieval" ? (
              <Field>
                <FieldLabel htmlFor="case-retrieval-target">Retrieval path</FieldLabel>
                <NativeSelect
                  id="case-retrieval-target"
                  value={retrievalTarget}
                  onChange={(e) => setRetrievalTarget(e.target.value as "agent" | "retriever")}
                >
                  <NativeSelectOption value="agent">Full AI Agent turn (charged)</NativeSelectOption>
                  <NativeSelectOption value="retriever">
                    Retriever only (no AI Agent call)
                  </NativeSelectOption>
                </NativeSelect>
                <FieldDescription>
                  Retriever only searches with the Customer Message and charges no AI Turn.
                </FieldDescription>
                <FieldLabel htmlFor="case-passages">Expected passages</FieldLabel>
                <Textarea id="case-passages" rows={4} value={passages} onChange={(e) => setPassages(e.target.value)} />
                <FieldDescription>
                  One per line: <code>source | fragment | grade</code>. Grade is 1 or 2 and optional.
                </FieldDescription>
              </Field>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

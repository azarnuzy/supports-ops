import { Button } from "@repo/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@repo/ui/components/collapsible";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { toast } from "@repo/ui/components/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useCreateCaseMutation, useCreateDatasetMutation } from "./hooks";
import { nextCaseKeys, splitPastedMessages } from "./paste";

/** One paste creates the dataset, then one draft case per message; the Admin finishes each draft
 * (metric and expectations) on the detail page. */
export function CreateDatasetDrawer({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const navigate = useNavigate();
  const createDataset = useCreateDatasetMutation();
  const createCase = useCreateCaseMutation();
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [criteria, setCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const messages = splitPastedMessages(pasted);

  function close(next: boolean) {
    if (saving) return;
    onOpenChange(next);
    if (!next) {
      setName("");
      setPasted("");
      setCriteria("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { dataset } = await createDataset.mutateAsync({ criteria, name });
      const keys = nextCaseKeys([], messages.length);
      // Sequential so a failure leaves a predictable prefix rather than a random subset.
      for (const [index, message] of messages.entries()) {
        await createCase.mutateAsync({
          datasetId: dataset.id,
          input: {
            attachments: [],
            caseKey: keys[index] as string,
            category: "",
            clarificationCount: 0,
            expected: "",
            history: [],
            message: message.slice(0, 4000),
            metadata: {},
            metric: null,
          },
        });
      }
      toast.success("Dataset created.");
      close(false);
      void navigate({ params: { datasetId: dataset.id }, to: "/testing/$datasetId" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create the dataset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="w-full gap-0 sm:max-w-xl" showCloseButton={false}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b">
            <div>
              <SheetTitle>Create Dataset</SheetTitle>
              <SheetDescription className="sr-only">
                Name the dataset and optionally paste the first Customer Messages.
              </SheetDescription>
            </div>
            <div className="flex gap-2">
              <Button disabled={saving} type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={saving || !name.trim()} type="submit">
                {saving ? "Creating…" : "Create"}
              </Button>
            </div>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto p-4">
            <Field>
              <FieldLabel htmlFor="dataset-name">Dataset name</FieldLabel>
              <Input
                id="dataset-name"
                maxLength={120}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Tabs defaultValue="paste">
              <TabsList>
                <TabsTrigger value="paste">Paste messages</TabsTrigger>
                <TabsTrigger disabled value="sessions">
                  Recent Sessions
                </TabsTrigger>
                <TabsTrigger disabled value="csv">
                  Upload CSV
                </TabsTrigger>
              </TabsList>
              <TabsContent className="mt-3" value="paste">
                <Field>
                  <FieldLabel htmlFor="dataset-paste">Customer Messages</FieldLabel>
                  <Textarea
                    id="dataset-paste"
                    rows={8}
                    value={pasted}
                    onChange={(event) => setPasted(event.target.value)}
                  />
                  <FieldDescription>
                    Separate messages with a line containing only <code>---</code>.{" "}
                    {messages.length > 0
                      ? `${messages.length} draft ${messages.length === 1 ? "case" : "cases"} will be created.`
                      : "Optional — you can add cases later."}{" "}
                    Recent Sessions and CSV import are not available yet.
                  </FieldDescription>
                </Field>
              </TabsContent>
            </Tabs>
            <Collapsible className="rounded-lg border">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium">
                Evaluation criteria <ChevronDownIcon className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t p-3">
                <Field>
                  <FieldLabel htmlFor="dataset-criteria">Default grading criteria</FieldLabel>
                  <Textarea
                    id="dataset-criteria"
                    maxLength={4000}
                    rows={4}
                    value={criteria}
                    onChange={(event) => setCriteria(event.target.value)}
                  />
                  <FieldDescription>
                    Used by judged metrics; each case's expected answer stays authoritative.
                  </FieldDescription>
                </Field>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

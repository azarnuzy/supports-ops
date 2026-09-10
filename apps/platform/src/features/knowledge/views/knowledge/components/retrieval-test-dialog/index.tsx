import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { EmbeddingNotConfiguredApiError } from "@repo/api-client";
import { type FormEvent, useState } from "react";
import { useTestRetrievalMutation } from "../../knowledge.hooks";
import type { RetrievalTestResult } from "../../knowledge.types";
import type { RetrievalTestDialogProps } from "./index.types";

export default function RetrievalTestDialog({ onOpenChange, open }: RetrievalTestDialogProps) {
  const testRetrieval = useTestRetrievalMutation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RetrievalTestResult[] | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setResults(null);
      testRetrieval.reset();
    }
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    testRetrieval.mutate(trimmed, {
      onSuccess: (data) => setResults(data.results),
    });
  }

  const errorMessage =
    testRetrieval.error instanceof EmbeddingNotConfiguredApiError
      ? testRetrieval.error.message
      : testRetrieval.isError
        ? "Retrieval test failed."
        : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Test retrieval</DialogTitle>
            <DialogDescription>
              Search Published Knowledge Sources the same way the AI Agent does.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="retrieval-test-query">Query</FieldLabel>
            <Input
              autoFocus
              id="retrieval-test-query"
              placeholder="How do I reset my password?"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Published content matched this query.
              </p>
            ) : (
              <ol className="grid max-h-72 gap-3 overflow-y-auto">
                {results.map((result, index) => (
                  <li
                    key={`${result.knowledgeSourceId}-${index}`}
                    className="rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{result.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(result.similarity * 100)}% match
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-muted-foreground">{result.chunkContent}</p>
                  </li>
                ))}
              </ol>
            )
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
            <Button disabled={!query.trim() || testRetrieval.isPending} type="submit">
              {testRetrieval.isPending ? "Searching..." : "Search"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

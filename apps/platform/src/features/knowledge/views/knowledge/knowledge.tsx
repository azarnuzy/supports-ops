import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { useCreateDocumentationUrlMutation, useCreatePdfKnowledgeSourceMutation } from "../../knowledge.hooks";
import { useKnowledgeSourcesForm, useRetrievalTestPanel } from "./knowledge.hooks";
import {
  canEdit,
  canPublish,
  formatSimilarity,
  formatUpdatedAt,
  statusLabel,
  statusVariant,
  visibilityLabel,
} from "./knowledge.services";

const KnowledgeView = () => {
  const addDocumentationUrl = useCreateDocumentationUrlMutation();
  const addPdf = useCreatePdfKnowledgeSourceMutation();
  const [documentationUrl, setDocumentationUrl] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const {
    content,
    editingId,
    handleDelete,
    handlePublish,
    handleSubmit,
    isSaving,
    knowledgeSources,
    publishingId,
    resetForm,
    setContent,
    setTitle,
    setVisibility,
    startEditing,
    title,
    visibility,
  } = useKnowledgeSourcesForm();

  const retrievalTest = useRetrievalTestPanel();

  return (
    <PlatformAppShell>
      <section className="grid gap-8">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Workspace knowledge</p>
          <h1 className="text-3xl font-semibold text-balance">Knowledge Sources</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Write a Manual FAQ by hand, then publish it — the AI Agent and Copilot can only ever
            retrieve a Published source.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="grid gap-4">
            <Card>
              <form onSubmit={handleSubmit}>
                <CardHeader>
                  <CardTitle>{editingId ? "Edit Manual FAQ" : "Add a Manual FAQ"}</CardTitle>
                  <CardDescription>
                    {editingId
                      ? "Saved as a draft until you publish it again."
                      : "Saved as a draft — publish it when it's ready."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field>
                    <FieldLabel htmlFor="knowledge-title">Title</FieldLabel>
                    <Input
                      id="knowledge-title"
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="knowledge-content">Answer</FieldLabel>
                    <Textarea
                      id="knowledge-content"
                      required
                      rows={6}
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="knowledge-visibility">Visibility</FieldLabel>
                    <Select
                      value={visibility}
                      onValueChange={(value) => setVisibility(value as typeof visibility)}
                    >
                      <SelectTrigger id="knowledge-visibility" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CUSTOMER_SAFE">Customer-Safe</SelectItem>
                        <SelectItem value="INTERNAL_ONLY">Internal-Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
                <CardFooter className="gap-3">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving..." : editingId ? "Save changes" : "Create draft"}
                  </Button>
                  {editingId ? (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancel
                    </Button>
                  ) : null}
                </CardFooter>
              </form>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Import documentation</CardTitle>
                <CardDescription>PDFs and same-domain documentation pages are prepared in the worker.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); if (pdf) addPdf.mutate({ file: pdf, visibility }, { onSuccess: () => { setPdf(null); toast.success("PDF uploaded as a draft."); }, onError: (error) => toast.error(error instanceof Error ? error.message : "PDF upload failed.") }); }}>
                  <Input accept="application/pdf" aria-label="PDF Knowledge Source" type="file" onChange={(event) => setPdf(event.target.files?.[0] ?? null)} />
                  <Button disabled={!pdf || addPdf.isPending} type="submit">{addPdf.isPending ? "Uploading..." : "Upload PDF"}</Button>
                </form>
                <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); if (documentationUrl.trim()) addDocumentationUrl.mutate({ url: documentationUrl.trim(), visibility }, { onSuccess: () => { setDocumentationUrl(""); toast.success("Documentation crawl started."); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Crawl failed to start.") }); }}>
                  <Input aria-label="Documentation URL" placeholder="https://docs.example.com" type="url" value={documentationUrl} onChange={(event) => setDocumentationUrl(event.target.value)} />
                  <Button disabled={!documentationUrl.trim() || addDocumentationUrl.isPending} type="submit">{addDocumentationUrl.isPending ? "Starting..." : "Crawl documentation"}</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <form onSubmit={retrievalTest.handleSubmit}>
                <CardHeader>
                  <CardTitle>Retrieval test</CardTitle>
                  <CardDescription>
                    Ask a question the way a Customer would. Only Published sources can answer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex gap-2">
                    <Input
                      aria-label="Retrieval test query"
                      placeholder="How do I reset my password?"
                      value={retrievalTest.query}
                      onChange={(event) => retrievalTest.setQuery(event.target.value)}
                    />
                    <Button type="submit" disabled={retrievalTest.runTest.isPending}>
                      <SearchIcon className="size-4" />
                    </Button>
                  </div>

                  {retrievalTest.runTest.isPending ? (
                    <p className="text-sm text-muted-foreground">Searching…</p>
                  ) : null}

                  {retrievalTest.runTest.isSuccess ? (
                    retrievalTest.runTest.data.results.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No published source matched that query.
                      </p>
                    ) : (
                      <ul className="grid gap-2">
                        {retrievalTest.runTest.data.results.map((result) => (
                          <li
                            key={`${result.knowledgeSourceId}-${result.chunkContent}`}
                            className="rounded-md border p-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium">{result.title}</p>
                              <Badge variant="secondary">
                                {formatSimilarity(result.similarity)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-muted-foreground">{result.chunkContent}</p>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </CardContent>
              </form>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Knowledge Sources</CardTitle>
              <CardDescription>Draft, processing, ready, published, or failed.</CardDescription>
            </CardHeader>
            <CardContent>
              {knowledgeSources.isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : null}
              {knowledgeSources.isError ? (
                <p className="text-sm text-destructive">Unable to load Knowledge Sources.</p>
              ) : null}
              {!knowledgeSources.isPending &&
              !knowledgeSources.isError &&
              knowledgeSources.data.knowledgeSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Knowledge Sources yet.</p>
              ) : null}

              {knowledgeSources.data && knowledgeSources.data.knowledgeSources.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {knowledgeSources.data.knowledgeSources.map((knowledgeSource) => (
                      <TableRow key={knowledgeSource.id}>
                        <TableCell className="max-w-[16rem]">
                          <p className="truncate font-medium">{knowledgeSource.title}</p>
                          {knowledgeSource.status === "FAILED" && knowledgeSource.failureReason ? (
                            <p className="truncate text-xs text-destructive">
                              {knowledgeSource.failureReason}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {visibilityLabel(knowledgeSource.visibility)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(knowledgeSource.status)}>
                            {statusLabel(knowledgeSource.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatUpdatedAt(knowledgeSource.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canEdit(knowledgeSource.status)}
                              onClick={() => startEditing(knowledgeSource)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                !canPublish(knowledgeSource.status) ||
                                publishingId === knowledgeSource.id
                              }
                              onClick={() => handlePublish(knowledgeSource.id)}
                            >
                              {publishingId === knowledgeSource.id ? "Publishing..." : "Publish"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(knowledgeSource.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </PlatformAppShell>
  );
};

export default KnowledgeView;

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, Globe2Icon, PlusIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import {
  knowledgeSourcesQueryOptions,
  useCreateDocumentationUrlMutation,
  useCreateManualFaqMutation,
  useCreatePdfKnowledgeSourceMutation,
  useDeleteKnowledgeSourceMutation,
  useKnowledgeSourceEvents,
} from "./knowledge.hooks";
import { fileLimit } from "./knowledge.constants";
import type { DialogKind, KnowledgeVisibility, SourceFilter } from "./knowledge.types";
import {
  AddFileDialog,
  AddTextDialog,
  AddWebsiteDialog,
  KnowledgeDetailDrawer,
  KnowledgeSourceRow,
  RetrievalTestDialog,
} from "./components";

const KnowledgeView = () => {
  useKnowledgeSourceEvents();
  const knowledgeSources = useQuery(knowledgeSourcesQueryOptions);
  const addDocumentationUrl = useCreateDocumentationUrlMutation();
  const addManualFaq = useCreateManualFaqMutation();
  const addPdf = useCreatePdfKnowledgeSourceMutation();
  const deleteKnowledgeSource = useDeleteKnowledgeSourceMutation();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [retrievalTestOpen, setRetrievalTestOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>("ALL");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<KnowledgeVisibility>("CUSTOMER_SAFE");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const sources = knowledgeSources.data?.knowledgeSources ?? [];
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;
  const visibleSources = sources.filter(
    (source) =>
      (filter === "ALL" || source.sourceType === filter) &&
      `${source.title} ${source.sourceUrl ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function closeDialog() {
    setDialog(null);
    setVisibility("CUSTOMER_SAFE");
    setUrl("");
    setFile(null);
    setTitle("");
    setContent("");
  }

  function handleWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addDocumentationUrl.mutate(
      { url: url.trim(), visibility },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Crawl failed to start."),
        onSuccess: () => {
          toast.success("Website import started.");
          closeDialog();
        },
      },
    );
  }

  function handleFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Choose a PDF file.");
      return;
    }
    if (file.size > fileLimit) {
      toast.error("Choose a PDF smaller than 25 MB.");
      return;
    }
    addPdf.mutate(
      { file, visibility },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "PDF upload failed."),
        onSuccess: () => {
          toast.success("PDF upload started.");
          closeDialog();
        },
      },
    );
  }

  function handleText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addManualFaq.mutate(
      { content: content.trim(), title: title.trim(), visibility },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create."),
        onSuccess: () => {
          toast.success("Knowledge Source created.");
          closeDialog();
        },
      },
    );
  }

  function handleDeleteSource(id: string) {
    deleteKnowledgeSource.mutate(id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."),
      onSuccess: () => toast.success("Knowledge Source deleted."),
    });
  }

  return (
    <PlatformAppShell>
      <section className="mx-auto grid w-full max-w-6xl gap-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Workspace knowledge</p>
            <h1 className="mt-1 text-3xl font-semibold text-balance">Knowledge Base</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Add and manage the Knowledge Sources the AI Agent can use.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setRetrievalTestOpen(true)}>
              <SparklesIcon className="size-4" /> Test retrieval
            </Button>
            <Button variant="outline" onClick={() => setDialog("text")}>
              <PlusIcon className="size-4" /> Create Text
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="flex min-h-28 items-start gap-4 rounded-lg border p-5 text-left transition-colors hover:bg-accent"
            type="button"
            onClick={() => setDialog("website")}
          >
            <span className="rounded-md border bg-background p-2"><Globe2Icon className="size-5" /></span>
            <span><span className="block font-medium">Add Website</span><span className="mt-1 block text-sm text-muted-foreground">Import same-domain documentation pages.</span></span>
          </button>
          <button
            className="flex min-h-28 items-start gap-4 rounded-lg border p-5 text-left transition-colors hover:bg-accent"
            type="button"
            onClick={() => setDialog("file")}
          >
            <span className="rounded-md border bg-background p-2"><FileTextIcon className="size-5" /></span>
            <span><span className="block font-medium">Add File</span><span className="mt-1 block text-sm text-muted-foreground">Upload one PDF up to 25 MB.</span></span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search Knowledge Sources" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value as SourceFilter)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Source type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="MANUAL_FAQ">Text</SelectItem>
              <SelectItem value="PDF">PDF</SelectItem>
              <SelectItem value="URL">Website</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-lg border">
          {knowledgeSources.isPending ? (
            <div className="grid gap-3 p-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
          ) : null}
          {knowledgeSources.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center"><p className="text-sm text-destructive">Unable to load Knowledge Sources.</p><Button variant="outline" onClick={() => void knowledgeSources.refetch()}>Retry</Button></div>
          ) : null}
          {!knowledgeSources.isPending && !knowledgeSources.isError && sources.length === 0 ? (
            <div className="grid place-items-center gap-4 p-12 text-center"><div><p className="font-medium">No Knowledge Sources yet</p><p className="mt-1 text-sm text-muted-foreground">Start with a website, PDF, or text.</p></div><div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => setDialog("website")}>Add Website</Button><Button variant="outline" onClick={() => setDialog("file")}>Add File</Button><Button onClick={() => setDialog("text")}>Create Text</Button></div></div>
          ) : null}
          {!knowledgeSources.isPending && !knowledgeSources.isError && sources.length > 0 && visibleSources.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No Knowledge Sources match this search or type.</p>
          ) : null}
          {visibleSources.map((source) => (
            <KnowledgeSourceRow
              key={source.id}
              source={source}
              onSelect={() => setSelectedId(source.id)}
              onDelete={() => handleDeleteSource(source.id)}
            />
          ))}
        </div>
      </section>

      <KnowledgeDetailDrawer
        source={selectedSource}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />

      <RetrievalTestDialog open={retrievalTestOpen} onOpenChange={setRetrievalTestOpen} />

      <AddWebsiteDialog
        open={dialog === "website"}
        onOpenChange={(open) => !open && closeDialog()}
        url={url}
        setUrl={setUrl}
        visibility={visibility}
        setVisibility={setVisibility}
        onSubmit={handleWebsite}
        isPending={addDocumentationUrl.isPending}
      />
      <AddFileDialog
        open={dialog === "file"}
        onOpenChange={(open) => !open && closeDialog()}
        file={file}
        setFile={setFile}
        visibility={visibility}
        setVisibility={setVisibility}
        onSubmit={handleFile}
        isPending={addPdf.isPending}
      />
      <AddTextDialog
        open={dialog === "text"}
        onOpenChange={(open) => !open && closeDialog()}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        visibility={visibility}
        setVisibility={setVisibility}
        onSubmit={handleText}
        isPending={addManualFaq.isPending}
      />
    </PlatformAppShell>
  );
};

export default KnowledgeView;

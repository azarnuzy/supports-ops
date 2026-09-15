import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import {
  FileTextIcon,
  Globe2Icon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import ResourceListState from "../../../settings/components/resource-list-state";
import ResourcePagination from "../../../settings/components/resource-pagination";
import { SettingsHeader } from "../../../settings/components/settings-header";
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

const PAGE_SIZE = 8;

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
  const [page, setPage] = useState(1);
  const [visibility, setVisibility] = useState<KnowledgeVisibility>("CUSTOMER_SAFE");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const sources = knowledgeSources.data?.knowledgeSources ?? [];
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;
  const visibleSources = sources.filter(
    (source) =>
      (filter === "ALL" || source.sourceType === filter) &&
      `${source.title} ${source.sourceUrl ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visibleSources.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageSources = visibleSources.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function closeDialog() {
    setDialog(null);
    setVisibility("CUSTOMER_SAFE");
    setUrl("");
    setFiles([]);
    setTitle("");
    setContent("");
  }

  function handleWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addDocumentationUrl.mutate(
      { url: url.trim(), visibility },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Crawl failed to start."),
        onSuccess: () => {
          toast.success("Website import started.");
          closeDialog();
        },
      },
    );
  }

  async function handleFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) return;
    const invalid = files.find((file) => file.type !== "application/pdf" || file.size > fileLimit);
    if (invalid) {
      toast.error(`"${invalid.name}" must be a PDF up to 25 MB.`);
      return;
    }

    const results = await Promise.allSettled(
      files.map((file) => addPdf.mutateAsync({ file, visibility })),
    );
    const failed = results.filter((result) => result.status === "rejected").length;

    if (failed === 0) {
      toast.success(
        files.length === 1 ? "PDF upload started." : `${files.length} PDF uploads started.`,
      );
      closeDialog();
    } else {
      toast.error(`${failed} of ${files.length} PDF uploads failed to start.`);
    }
  }

  function handleText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addManualFaq.mutate(
      { content: content.trim(), title: title.trim(), visibility },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to create."),
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
        <SettingsHeader
          title="Knowledge Base"
          eyebrow="Workspace knowledge"
          description="Add and manage the Knowledge Sources the AI Agent can use."
          action={
            <>
              <Button variant="outline" onClick={() => setRetrievalTestOpen(true)}>
                <SparklesIcon className="size-4" /> Test retrieval
              </Button>
              <Button variant="outline" onClick={() => setDialog("text")}>
                <PlusIcon className="size-4" /> Create Text
              </Button>
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="flex min-h-28 items-start gap-4 rounded-lg border p-5 text-left transition-colors hover:bg-accent"
            type="button"
            onClick={() => setDialog("website")}
          >
            <span className="rounded-md border bg-background p-2">
              <Globe2Icon className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Add Website</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Import same-domain documentation pages.
              </span>
            </span>
          </button>
          <button
            className="flex min-h-28 items-start gap-4 rounded-lg border p-5 text-left transition-colors hover:bg-accent"
            type="button"
            onClick={() => setDialog("file")}
          >
            <span className="rounded-md border bg-background p-2">
              <FileTextIcon className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Add File</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Upload one or more PDFs, up to 25 MB each.
              </span>
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search Knowledge Sources"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value as SourceFilter)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Source type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="MANUAL_FAQ">Text</SelectItem>
              <SelectItem value="PDF">PDF</SelectItem>
              <SelectItem value="URL">Website</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <ResourceListState
            isPending={knowledgeSources.isPending}
            isError={knowledgeSources.isError}
            errorLabel="Unable to load Knowledge Sources."
            onRetry={() => void knowledgeSources.refetch()}
            isEmpty={visibleSources.length === 0}
            emptyIcon={<LibraryIcon className="size-5 text-muted-foreground" />}
            emptyTitle={
              sources.length === 0 ? "No Knowledge Sources yet" : "No matching Knowledge Sources"
            }
            emptyDescription={
              sources.length === 0
                ? "Start with a website, PDF, or text."
                : "Try a different search term or type filter."
            }
            emptyAction={
              sources.length === 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDialog("website")}>
                    Add Website
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog("file")}>
                    Add File
                  </Button>
                  <Button size="sm" onClick={() => setDialog("text")}>
                    Create Text
                  </Button>
                </div>
              ) : undefined
            }
          />
          {!knowledgeSources.isPending && !knowledgeSources.isError && visibleSources.length > 0
            ? pageSources.map((source) => (
                <KnowledgeSourceRow
                  key={source.id}
                  source={source}
                  onSelect={() => setSelectedId(source.id)}
                  onDelete={() => handleDeleteSource(source.id)}
                />
              ))
            : null}
          <ResourcePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
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
        files={files}
        setFiles={setFiles}
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

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, Globe2Icon, MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import {
  knowledgeSourcesQueryOptions,
  useCreateDocumentationUrlMutation,
  useCreateManualFaqMutation,
  useCreatePdfKnowledgeSourceMutation,
  useDeleteKnowledgeSourceMutation,
  useKnowledgeSourceEvents,
} from "../../knowledge.hooks";
import type { KnowledgeSourceType, KnowledgeVisibility } from "../../knowledge.types";
import { formatUpdatedAt, sourceTypeLabel, statusLabel, statusVariant, visibilityLabel } from "./knowledge.services";

type DialogKind = "file" | "text" | "website" | null;
type SourceFilter = "ALL" | KnowledgeSourceType;

const fileLimit = 25 * 1024 * 1024;

const KnowledgeView = () => {
  useKnowledgeSourceEvents();
  const knowledgeSources = useQuery(knowledgeSourcesQueryOptions);
  const addDocumentationUrl = useCreateDocumentationUrlMutation();
  const addManualFaq = useCreateManualFaqMutation();
  const addPdf = useCreatePdfKnowledgeSourceMutation();
  const deleteKnowledgeSource = useDeleteKnowledgeSourceMutation();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [filter, setFilter] = useState<SourceFilter>("ALL");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<KnowledgeVisibility>("CUSTOMER_SAFE");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const sources = knowledgeSources.data?.knowledgeSources ?? [];
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
          <Button variant="outline" onClick={() => setDialog("text")}>
            <PlusIcon className="size-4" /> Create Text
          </Button>
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
            <div key={source.id} className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
              <div className="min-w-0"><div className="flex items-center gap-2"><FileTextIcon className="size-4 shrink-0 text-muted-foreground" /><p className="truncate font-medium">{source.title}</p></div><p className="mt-1 truncate pl-6 text-sm text-muted-foreground">{source.sourceUrl ?? sourceTypeLabel(source.sourceType)}</p></div>
              <Badge variant="outline">{visibilityLabel(source.visibility)}</Badge>
              <Badge variant={statusVariant(source.status)}>{source.status === "PROCESSING" && source.stage ? statusLabel(source.stage) : statusLabel(source.status)}</Badge>
              <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">Last updated {formatUpdatedAt(source.updatedAt)}</span><DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={`Actions for ${source.title}`} size="icon-sm" variant="ghost"><MoreHorizontalIcon className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={() => deleteKnowledgeSource.mutate(source.id, { onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."), onSuccess: () => toast.success("Knowledge Source deleted.") })}>Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={dialog === "website"} onOpenChange={(open) => !open && closeDialog()}><DialogContent><form className="grid gap-5" onSubmit={handleWebsite}><DialogHeader><DialogTitle>Add Website</DialogTitle><DialogDescription>Import pages from one documentation website.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="knowledge-url">Website URL</FieldLabel><Input id="knowledge-url" required placeholder="https://docs.example.com" type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></Field><VisibilitySelect value={visibility} onChange={setVisibility} /><DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button disabled={!url.trim() || addDocumentationUrl.isPending} type="submit">{addDocumentationUrl.isPending ? "Starting..." : "Add Website"}</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={dialog === "file"} onOpenChange={(open) => !open && closeDialog()}><DialogContent><form className="grid gap-5" onSubmit={handleFile}><DialogHeader><DialogTitle>Add File</DialogTitle><DialogDescription>Upload one PDF, up to 25 MB.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="knowledge-file">PDF file</FieldLabel><Input accept="application/pdf" id="knowledge-file" required type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field><VisibilitySelect value={visibility} onChange={setVisibility} /><DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button disabled={!file || addPdf.isPending} type="submit">{addPdf.isPending ? "Uploading..." : "Add File"}</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={dialog === "text"} onOpenChange={(open) => !open && closeDialog()}><DialogContent><form className="grid gap-5" onSubmit={handleText}><DialogHeader><DialogTitle>Create Text</DialogTitle><DialogDescription>Create a Knowledge Source from text.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="knowledge-title">Title</FieldLabel><Input id="knowledge-title" required value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field><FieldLabel htmlFor="knowledge-content">Content</FieldLabel><Textarea id="knowledge-content" required rows={7} value={content} onChange={(event) => setContent(event.target.value)} /></Field><VisibilitySelect value={visibility} onChange={setVisibility} /><DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button disabled={!title.trim() || !content.trim() || addManualFaq.isPending} type="submit">{addManualFaq.isPending ? "Creating..." : "Create Text"}</Button></DialogFooter></form></DialogContent></Dialog>
    </PlatformAppShell>
  );
};

function VisibilitySelect({ value, onChange }: { value: KnowledgeVisibility; onChange: (value: KnowledgeVisibility) => void }) {
  return <Field><FieldLabel htmlFor="knowledge-visibility">Visibility</FieldLabel><Select value={value} onValueChange={(next) => onChange(next as KnowledgeVisibility)}><SelectTrigger id="knowledge-visibility" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CUSTOMER_SAFE">Customer-Safe</SelectItem><SelectItem value="INTERNAL_ONLY">Internal-Only</SelectItem></SelectContent></Select></Field>;
}

export default KnowledgeView;

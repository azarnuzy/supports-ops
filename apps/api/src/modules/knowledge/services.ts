import { randomUUID } from "node:crypto";
import { createOpenAiEmbeddingClient, searchChunks } from "@repo/knowledge";
import { createStorage } from "@repo/storage";
import { embeddingConfig, storageConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { publishKnowledgeSourceEvent } from "../widget/realtime";
import { enqueueKnowledgeIngest } from "./queue";
import type {
  CreateDocumentationUrlInput,
  CreateManualFaqInput,
  UpdateManualFaqInput,
} from "./schema";
import type { KnowledgeSourceDto, KnowledgeSourcesResponse, RetrievalTestResponse } from "./types";

export class KnowledgeSourceNotFoundError extends Error {
  constructor() {
    super("Knowledge Source not found.");
    this.name = "KnowledgeSourceNotFoundError";
  }
}

export class KnowledgeSourceProcessingError extends Error {
  constructor() {
    super("This Knowledge Source is still processing.");
    this.name = "KnowledgeSourceProcessingError";
  }
}

export class KnowledgeSourceMissingContentError extends Error {
  constructor() {
    super("This Knowledge Source has no content to publish.");
    this.name = "KnowledgeSourceMissingContentError";
  }
}

export class EmbeddingNotConfiguredError extends Error {
  constructor() {
    super("Configure OPENROUTER_API_KEY to use retrieval.");
    this.name = "EmbeddingNotConfiguredError";
  }
}

export async function createManualFaq(input: CreateManualFaqInput): Promise<KnowledgeSourceDto> {
  const workspaceId = requireWorkspaceId();
  const knowledgeSource = await prisma.knowledgeSource.create({
    data: {
      content: input.content,
      id: randomUUID(),
      sourceType: "MANUAL_FAQ",
      status: "PROCESSING",
      title: input.title,
      visibility: input.visibility,
      workspaceId,
    },
  });

  await publishKnowledgeSourceEvent(workspaceId, {
    knowledgeSourceId: knowledgeSource.id,
    status: "PROCESSING",
  });
  await enqueueKnowledgeIngest({
    content: input.content,
    kind: "CONTENT",
    knowledgeSourceId: knowledgeSource.id,
    title: input.title,
    visibility: input.visibility,
    workspaceId,
  });

  return toDto(knowledgeSource);
}

const maxPdfSizeBytes = 25 * 1024 * 1024;

export async function createPdfKnowledgeSource(
  file: File,
  visibility: KnowledgeSourceDto["visibility"],
) {
  if (file.type !== "application/pdf") throw new Error("Upload a PDF file.");
  if (file.size === 0 || file.size > maxPdfSizeBytes)
    throw new Error("PDF must be between 1 byte and 25 MB.");
  const workspaceId = requireWorkspaceId();
  const id = randomUUID();
  const storageKey = `knowledge/${workspaceId}/${id}.pdf`;
  await createStorage(storageConfig).putObject({
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
    key: storageKey,
  });
  const knowledgeSource = await prisma.knowledgeSource.create({
    data: {
      id,
      sourceType: "PDF",
      sourceUrl: storageKey,
      status: "PROCESSING",
      title: file.name,
      visibility,
      workspaceId,
    },
  });
  await publishKnowledgeSourceEvent(workspaceId, {
    knowledgeSourceId: id,
    status: "PROCESSING",
  });
  await enqueueKnowledgeIngest({
    kind: "PDF",
    knowledgeSourceId: id,
    title: file.name,
    visibility,
    workspaceId,
  });
  return toDto(knowledgeSource);
}

export async function createDocumentationUrl(input: CreateDocumentationUrlInput) {
  const workspaceId = requireWorkspaceId();
  const knowledgeSource = await prisma.knowledgeSource.create({
    data: {
      id: randomUUID(),
      sourceType: "HELP_CENTER",
      sourceUrl: input.url,
      status: "PROCESSING",
      title: new URL(input.url).hostname,
      visibility: input.visibility,
      workspaceId,
    },
  });
  await publishKnowledgeSourceEvent(workspaceId, {
    knowledgeSourceId: knowledgeSource.id,
    status: "PROCESSING",
  });
  await enqueueKnowledgeIngest({
    kind: "CRAWL",
    knowledgeSourceId: knowledgeSource.id,
    workspaceId,
  });
  return toDto(knowledgeSource);
}

export async function listKnowledgeSources(): Promise<KnowledgeSourcesResponse> {
  const knowledgeSources = await prisma.knowledgeSource.findMany({
    orderBy: { createdAt: "desc" },
    where: { deletedAt: null },
  });

  return { knowledgeSources: knowledgeSources.map(toDto) };
}

export async function getKnowledgeSource(id: string): Promise<KnowledgeSourceDto> {
  const knowledgeSource = await prisma.knowledgeSource.findFirst({
    where: { deletedAt: null, id },
  });

  if (!knowledgeSource) {
    throw new KnowledgeSourceNotFoundError();
  }

  return toDto(knowledgeSource);
}

export async function updateManualFaq(
  id: string,
  input: UpdateManualFaqInput,
): Promise<KnowledgeSourceDto> {
  const existing = await findEditableKnowledgeSource(id);

  // Visibility is denormalized onto Chunks because retrieval cannot join back
  // to KnowledgeSource. Keep both rows in the same transaction so hiding a
  // source takes effect for the Customer-facing retriever immediately.
  const [knowledgeSource] = await prisma.$transaction([
    prisma.knowledgeSource.update({
      data: { content: input.content, title: input.title, visibility: input.visibility },
      where: { id: existing.id },
    }),
    prisma.chunk.updateMany({
      data: { visibility: input.visibility },
      where: { knowledgeSourceId: existing.id },
    }),
  ]);

  return toDto(knowledgeSource);
}

/**
 * Kicks off the whole knowledge pipeline: sets the source to PROCESSING and
 * enqueues `knowledge-ingest`, which chunks, embeds, and indexes it, moving
 * it through READY to PUBLISHED. Chunk ids are deterministic, so publishing
 * an already-PUBLISHED source (an edit followed by re-publish) replaces its
 * chunks rather than duplicating them.
 */
export async function publishKnowledgeSource(id: string): Promise<KnowledgeSourceDto> {
  const existing = await findEditableKnowledgeSource(id);

  if (existing.sourceType === "HELP_CENTER") {
    const helpCenterWorkspaceId = requireWorkspaceId();
    const knowledgeSource = await prisma.knowledgeSource.update({
      data: { failedStage: null, failureReason: null, stage: null, status: "PROCESSING" },
      where: { id: existing.id },
    });
    await publishKnowledgeSourceEvent(helpCenterWorkspaceId, {
      knowledgeSourceId: existing.id,
      status: "PROCESSING",
    });
    await enqueueKnowledgeIngest({
      kind: "CRAWL",
      knowledgeSourceId: existing.id,
      workspaceId: helpCenterWorkspaceId,
    });
    return toDto(knowledgeSource);
  }
  if (existing.sourceType === "MANUAL_FAQ" && !existing.content) {
    throw new KnowledgeSourceMissingContentError();
  }

  const workspaceId = requireWorkspaceId();

  const knowledgeSource = await prisma.knowledgeSource.update({
    data: { failedStage: null, failureReason: null, stage: null, status: "PROCESSING" },
    where: { id: existing.id },
  });

  await publishKnowledgeSourceEvent(workspaceId, {
    knowledgeSourceId: existing.id,
    status: "PROCESSING",
  });

  await enqueueKnowledgeIngest({
    kind: existing.sourceType === "PDF" ? "PDF" : existing.sourceType === "URL" ? "URL" : "CONTENT",
    content: existing.content ?? undefined,
    knowledgeSourceId: existing.id,
    title: existing.title,
    visibility: existing.visibility,
    workspaceId,
  });

  return toDto(knowledgeSource);
}

export async function deleteKnowledgeSource(id: string, deletedBy: string): Promise<void> {
  const existing = await prisma.knowledgeSource.findFirst({
    select: { id: true, sourceType: true },
    where: { deletedAt: null, id },
  });

  if (!existing) {
    throw new KnowledgeSourceNotFoundError();
  }

  const deletedAt = new Date();
  const childIds =
    existing.sourceType === "HELP_CENTER"
      ? (
          await prisma.knowledgeSource.findMany({
            select: { id: true },
            where: { deletedAt: null, parentId: existing.id },
          })
        ).map((child) => child.id)
      : [];
  const ids = [existing.id, ...childIds];

  await prisma.$transaction([
    prisma.knowledgeSource.updateMany({ data: { deletedAt, deletedBy }, where: { id: { in: ids } } }),
    prisma.chunk.updateMany({ data: { deletedAt }, where: { knowledgeSourceId: { in: ids } } }),
  ]);
}

/**
 * Embeds the query and searches published Chunks in this Workspace only —
 * the same mechanism, minus the AI Agent's prompt, that the retrieval test
 * screen exists to exercise by hand.
 */
export async function testRetrieval(query: string): Promise<RetrievalTestResponse> {
  const apiKey = embeddingConfig.apiKey;

  if (!apiKey) {
    throw new EmbeddingNotConfiguredError();
  }

  const workspaceId = requireWorkspaceId();
  const embeddingClient = createOpenAiEmbeddingClient({ ...embeddingConfig, apiKey });
  const [embedding] = await embeddingClient.embed([query]);

  if (!embedding) {
    return { results: [] };
  }

  const chunkResults = await searchChunks(prisma, { embedding, workspaceId });
  const sourceIds = Array.from(
    new Set(chunkResults.map((result) => result.knowledgeSourceId).filter(isNotNull)),
  );

  const sources = sourceIds.length
    ? await prisma.knowledgeSource.findMany({
        select: { id: true, title: true },
        where: { id: { in: sourceIds } },
      })
    : [];
  const titleById = new Map(sources.map((source) => [source.id, source.title]));

  return {
    results: chunkResults
      .filter((result) => result.knowledgeSourceId !== null)
      .map((result) => ({
        chunkContent: result.content,
        knowledgeSourceId: result.knowledgeSourceId as string,
        similarity: result.similarity,
        title: titleById.get(result.knowledgeSourceId as string) ?? "Untitled",
      })),
  };
}

async function findEditableKnowledgeSource(id: string) {
  const knowledgeSource = await prisma.knowledgeSource.findFirst({
    where: { deletedAt: null, id },
  });

  if (!knowledgeSource) {
    throw new KnowledgeSourceNotFoundError();
  }

  if (knowledgeSource.status === "PROCESSING") {
    throw new KnowledgeSourceProcessingError();
  }

  return knowledgeSource;
}

function isNotNull<Value>(value: Value | null): value is Value {
  return value !== null;
}

function toDto(knowledgeSource: {
  id: string;
  parentId: string | null;
  sourceType: KnowledgeSourceDto["sourceType"];
  title: string;
  content: string | null;
  sourceUrl: string | null;
  visibility: KnowledgeSourceDto["visibility"];
  status: KnowledgeSourceDto["status"];
  stage?: KnowledgeSourceDto["stage"];
  failedStage?: KnowledgeSourceDto["failedStage"];
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}): KnowledgeSourceDto {
  return {
    content: knowledgeSource.content,
    createdAt: knowledgeSource.createdAt,
    failedStage: knowledgeSource.failedStage ?? null,
    failureReason: knowledgeSource.failureReason,
    id: knowledgeSource.id,
    parentId: knowledgeSource.parentId,
    publishedAt: knowledgeSource.publishedAt,
    sourceType: knowledgeSource.sourceType,
    sourceUrl: knowledgeSource.sourceUrl,
    stage: knowledgeSource.stage ?? null,
    status: knowledgeSource.status,
    title: knowledgeSource.title,
    updatedAt: knowledgeSource.updatedAt,
    visibility: knowledgeSource.visibility,
  };
}

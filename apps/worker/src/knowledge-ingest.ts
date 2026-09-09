import { chunkText, createOpenAiEmbeddingClient, replaceChunks } from "@repo/knowledge";
import { createStorage } from "@repo/storage";
import { Queue, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import { embeddingConfig, ingestionConfig, storageConfig } from "./config";
import { prisma } from "./prisma";

let publisher: Redis | undefined;
let ingestQueue: Queue<KnowledgeIngestJob> | undefined;

function getIngestQueue() {
  const connection: ConnectionOptions = {
    maxRetriesPerRequest: null,
    url: process.env.REDIS_URL ?? "redis://localhost:16379",
  };
  ingestQueue ??= new Queue<KnowledgeIngestJob>("knowledge-ingest", { connection });
  return ingestQueue;
}

async function publishStatus(
  workspaceId: string,
  knowledgeSourceId: string,
  status: "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED",
  failureReason?: string,
) {
  publisher ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:16379", {
    maxRetriesPerRequest: null,
  });
  await publisher.publish(
    `supportops:knowledge:${workspaceId}`,
    JSON.stringify({
      data: { failureReason, knowledgeSourceId, status },
      type: "knowledge.updated",
    }),
  );
}

export type KnowledgeIngestJob = {
  kind: "CONTENT" | "CRAWL" | "PDF" | "URL";
  knowledgeSourceId: string;
  workspaceId: string;
  title?: string;
  content?: string;
  visibility?: "CUSTOMER_SAFE" | "INTERNAL_ONLY";
};

/**
 * The whole knowledge pipeline for one Knowledge Source: chunk, embed,
 * index. Moves the source from PROCESSING (set by the publish endpoint)
 * through READY to PUBLISHED, or to FAILED with a reason. `replaceChunks`
 * deletes and re-inserts by deterministic id, so running this twice for the
 * same source (a re-publish) replaces rather than duplicates.
 */
export async function processKnowledgeIngestJob(job: { data: KnowledgeIngestJob }): Promise<void> {
  const { knowledgeSourceId, workspaceId } = job.data;

  const owned = await prisma.knowledgeSource.findFirst({
    select: { id: true },
    where: { deletedAt: null, id: knowledgeSourceId, workspaceId },
  });

  if (!owned) {
    throw new Error(`Knowledge Source ${knowledgeSourceId} not found in Workspace ${workspaceId}.`);
  }

  try {
    if (job.data.kind === "CRAWL") {
      await crawlDocumentation(owned.id, workspaceId);
      return;
    }
    const content =
      job.data.kind === "PDF"
        ? await extractPdf(owned.id)
        : job.data.kind === "URL"
          ? await extractUrl(owned.id)
          : job.data.content;
    if (!content?.trim()) throw new Error("The source did not contain readable text.");
    const { visibility } = job.data;
    if (!visibility) throw new Error("Knowledge Source is missing a visibility.");
    if (!embeddingConfig.apiKey) {
      throw new Error("Configure OPENROUTER_API_KEY to publish Knowledge Sources.");
    }

    const chunks = chunkText(content);
    const embeddingClient = createOpenAiEmbeddingClient({
      apiKey: embeddingConfig.apiKey,
      baseUrl: embeddingConfig.baseUrl,
      modelId: embeddingConfig.modelId,
    });
    const vectors = chunks.length
      ? await embeddingClient.embed(chunks.map((chunk) => chunk.content))
      : [];

    const wasPublished = await prisma.$transaction(async (tx) => {
      // Deletion can happen while embeddings are being generated. Recheck it
      // inside this transaction before replacing chunks, otherwise a deleted
      // source could be repopulated with retrievable chunks after its delete.
      const activeSource = await tx.knowledgeSource.findFirst({
        select: { id: true },
        where: { deletedAt: null, id: knowledgeSourceId, status: "PROCESSING", workspaceId },
      });

      if (!activeSource) {
        return false;
      }

      await replaceChunks(tx, {
        chunks: chunks.map((chunk, index) => ({
          content: chunk.content,
          embedding: vectors[index] ?? [],
          position: chunk.position,
        })),
        isPublished: true,
        knowledgeSourceId,
        visibility,
        workspaceId,
      });

      await tx.knowledgeSource.update({
        data: { publishedAt: new Date(), status: "PUBLISHED" },
        where: { id: knowledgeSourceId },
      });

      return true;
    });

    if (wasPublished) {
      await publishStatus(workspaceId, knowledgeSourceId, "PUBLISHED");
    }
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Knowledge ingest failed.";
    await prisma.knowledgeSource.update({
      data: { failureReason, status: "FAILED" },
      where: { id: knowledgeSourceId },
    });
    await publishStatus(workspaceId, knowledgeSourceId, "FAILED", failureReason);

    throw error;
  }
}

async function extractPdf(id: string) {
  const source = await prisma.knowledgeSource.findFirst({ where: { id } });
  if (!source?.sourceUrl) throw new Error("PDF file is missing.");
  if (!ingestionConfig.mistralApiKey) throw new Error("Configure MISTRAL_API_KEY to process PDFs.");
  const documentUrl = await createStorage(storageConfig).getSignedGetObjectUrl({
    key: source.sourceUrl,
  });
  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestionConfig.mistralApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: { type: "document_url", document_url: documentUrl },
    }),
  });
  if (!response.ok) throw new Error(`OCR failed: ${await response.text()}`);
  const body = (await response.json()) as { pages?: Array<{ markdown?: string }> };
  return body.pages?.map((page) => page.markdown ?? "").join("\n\n") ?? "";
}

async function extractUrl(id: string) {
  const source = await prisma.knowledgeSource.findFirst({ where: { id } });
  if (!source?.sourceUrl) throw new Error("Documentation URL is missing.");
  const [page] = await crawlPages(source.sourceUrl, 1, 1);
  return page?.content ?? "";
}

async function crawlDocumentation(parentId: string, workspaceId: string) {
  const parent = await prisma.knowledgeSource.findFirst({ where: { id: parentId } });
  if (!parent?.sourceUrl) throw new Error("Documentation URL is missing.");
  const pages = await crawlPages(parent.sourceUrl, 1, 25);
  await Promise.allSettled(
    pages.map(async (page) => {
      const child = await prisma.knowledgeSource.create({
        data: {
          id: crypto.randomUUID(),
          parentId,
          sourceType: "URL",
          sourceUrl: page.url,
          status: "PROCESSING",
          title: page.title,
          visibility: parent.visibility,
          workspaceId,
        },
      });
      await publishStatus(workspaceId, child.id, "PROCESSING");
      await getIngestQueue().add(
        "ingest",
        {
          content: page.content,
          kind: "CONTENT",
          knowledgeSourceId: child.id,
          title: page.title,
          visibility: parent.visibility,
          workspaceId,
        },
        {
          attempts: 3,
          backoff: { delay: 2_000, type: "exponential" },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    }),
  );
  await prisma.knowledgeSource.update({
    data: { failureReason: null, status: "READY" },
    where: { id: parentId },
  });
  await publishStatus(workspaceId, parentId, "READY");
}

async function crawlPages(url: string, maxDepth: number, limit: number) {
  if (!ingestionConfig.tavilyApiKey)
    throw new Error("Configure TAVILY_API_KEY to crawl documentation URLs.");
  const response = await fetch("https://api.tavily.com/crawl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestionConfig.tavilyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, max_depth: maxDepth, limit }),
  });
  if (!response.ok) throw new Error(`Crawl failed: ${await response.text()}`);
  const body = (await response.json()) as {
    results?: Array<{ raw_content?: string; title?: string; url: string }>;
  };
  const origin = new URL(url).origin;
  return (body.results ?? [])
    .filter((page) => new URL(page.url).origin === origin)
    .slice(0, limit)
    .map((page) => ({
      content: page.raw_content ?? "",
      title: page.title ?? page.url,
      url: page.url,
    }));
}

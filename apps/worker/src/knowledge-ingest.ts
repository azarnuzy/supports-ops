import { chunkText, createOpenAiEmbeddingClient, replaceChunks } from "@repo/knowledge";
import { embeddingConfig } from "./config";
import { prisma } from "./prisma";

export type KnowledgeIngestJob = {
  knowledgeSourceId: string;
  workspaceId: string;
  title: string;
  content: string;
  visibility: "CUSTOMER_SAFE" | "INTERNAL_ONLY";
};

/**
 * The whole knowledge pipeline for one Knowledge Source: chunk, embed,
 * index. Moves the source from PROCESSING (set by the publish endpoint)
 * through READY to PUBLISHED, or to FAILED with a reason. `replaceChunks`
 * deletes and re-inserts by deterministic id, so running this twice for the
 * same source (a re-publish) replaces rather than duplicates.
 */
export async function processKnowledgeIngestJob(job: { data: KnowledgeIngestJob }): Promise<void> {
  const { knowledgeSourceId, workspaceId, content, visibility } = job.data;

  const owned = await prisma.knowledgeSource.findFirst({
    select: { id: true },
    where: { id: knowledgeSourceId, workspaceId },
  });

  if (!owned) {
    throw new Error(`Knowledge Source ${knowledgeSourceId} not found in Workspace ${workspaceId}.`);
  }

  try {
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

    await prisma.knowledgeSource.update({
      data: { status: "READY" },
      where: { id: knowledgeSourceId },
    });

    await prisma.$transaction(async (tx) => {
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
    });
  } catch (error) {
    await prisma.knowledgeSource.update({
      data: {
        failureReason: error instanceof Error ? error.message : "Knowledge ingest failed.",
        status: "FAILED",
      },
      where: { id: knowledgeSourceId },
    });

    throw error;
  }
}

import { chunkId } from "./ids";

export type KnowledgeVisibility = "CUSTOMER_SAFE" | "INTERNAL_ONLY";

/**
 * The minimal raw-SQL surface `packages/knowledge` needs from a database
 * client. Both `apps/api`'s workspace-scoped Prisma client and
 * `apps/worker`'s plain one satisfy this structurally — raw queries bypass
 * Prisma's workspace-isolation extension either way, so every caller here
 * filters on `workspaceId` explicitly. See ADR-0003 and
 * docs/planning/spike-anvia.md (finding 3) for why this reimplements the
 * filter against the product's own `Chunk` table instead of using
 * `@anvia/pgvector`'s owned one.
 */
export type SqlDb = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
};

export type ChunkToStore = {
  position: number;
  content: string;
  embedding: number[];
};

export type ReplaceChunksParams = {
  workspaceId: string;
  knowledgeSourceId: string;
  visibility: KnowledgeVisibility;
  isPublished: boolean;
  chunks: ChunkToStore[];
};

/**
 * Replaces every Chunk belonging to a Knowledge Source in one pass: deletes
 * the previous set, then inserts the new one with deterministic ids
 * (`${knowledgeSourceId}:${position}`), so re-publishing the same source
 * replaces rather than duplicates. Call inside a transaction alongside the
 * KnowledgeSource status update — see ADR-0003 for why that atomicity is the
 * point.
 */
export async function replaceChunks(db: SqlDb, params: ReplaceChunksParams): Promise<void> {
  const { workspaceId, knowledgeSourceId, visibility, isPublished, chunks } = params;

  await db.$executeRaw`
    DELETE FROM "Chunk"
    WHERE "workspaceId" = ${workspaceId} AND "knowledgeSourceId" = ${knowledgeSourceId}
  `;

  for (const chunk of chunks) {
    await db.$executeRaw`
      INSERT INTO "Chunk" (
        "id", "workspaceId", "kind", "knowledgeSourceId", "content", "embedding",
        "position", "visibility", "isPublished", "createdAt"
      ) VALUES (
        ${chunkId(knowledgeSourceId, chunk.position)}, ${workspaceId}, 'KNOWLEDGE', ${knowledgeSourceId},
        ${chunk.content}, ${toVectorLiteral(chunk.embedding)}::vector,
        ${chunk.position}, ${visibility}::"KnowledgeVisibility", ${isPublished}, now()
      )
    `;
  }
}

export type SearchChunksParams = {
  workspaceId: string;
  embedding: number[];
  limit?: number;
  minSimilarity?: number;
  visibility?: KnowledgeVisibility;
};

export type ChunkSearchResult = {
  chunkId: string;
  knowledgeSourceId: string | null;
  content: string;
  position: number;
  similarity: number;
};

type RawChunkRow = {
  id: string;
  knowledgeSourceId: string | null;
  content: string;
  position: number;
  similarity: number | string;
};

const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.15;

/**
 * Searches published, non-deleted Knowledge chunks by cosine similarity,
 * scoped to one Workspace and optionally one Visibility. Never reaches a
 * Workspace it wasn't given, and never returns a Chunk below
 * `minSimilarity` — the mechanism the retrieval test screen and the AI
 * Agent's retrieval both call.
 */
export async function searchChunks(
  db: SqlDb,
  params: SearchChunksParams,
): Promise<ChunkSearchResult[]> {
  const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;
  const minSimilarity = params.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const queryVector = toVectorLiteral(params.embedding);
  const visibility = params.visibility ?? null;

  const rows = await db.$queryRaw<RawChunkRow[]>`
    SELECT "id", "knowledgeSourceId", "content", "position",
           1 - ("embedding" <=> ${queryVector}::vector) AS similarity
    FROM "Chunk"
    WHERE "workspaceId" = ${params.workspaceId}
      AND "kind" = 'KNOWLEDGE'
      AND "isPublished" = true
      AND "deletedAt" IS NULL
      AND "embedding" IS NOT NULL
      AND (${visibility}::text IS NULL OR "visibility" = ${visibility}::"KnowledgeVisibility")
    ORDER BY "embedding" <=> ${queryVector}::vector ASC
    LIMIT ${limit}
  `;

  return rows
    .map((row) => ({
      chunkId: row.id,
      content: row.content,
      knowledgeSourceId: row.knowledgeSourceId,
      position: row.position,
      similarity: Number(row.similarity),
    }))
    .filter((result) => result.similarity >= minSimilarity);
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

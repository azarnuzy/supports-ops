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
  /** Customer retrieval is the safe default; only the AI Copilot may opt in to Internal-Only. */
  retrievalMode?: "CUSTOMER" | "COPILOT";
};

export type ChunkSearchResult = {
  chunkId: string;
  knowledgeSourceId: string | null;
  content: string;
  position: number;
  similarity: number;
  visibility: KnowledgeVisibility;
};

type RawChunkRow = {
  id: string;
  knowledgeSourceId: string | null;
  content: string;
  position: number;
  similarity: number | string;
  visibility: KnowledgeVisibility;
};

const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.15;

/**
 * Searches published, non-deleted Knowledge chunks by cosine similarity,
 * scoped to one Workspace. Customer retrieval is restricted to Customer-Safe
 * content; the AI Copilot may additionally retrieve Internal-Only content.
 * Never reaches a Workspace it wasn't given, and never returns a Chunk below
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
  const retrievalMode = params.retrievalMode ?? "CUSTOMER";

  const rows = await db.$queryRaw<RawChunkRow[]>`
    SELECT "id", "knowledgeSourceId", "content", "position", "visibility",
           1 - ("embedding" <=> ${queryVector}::vector) AS similarity
    FROM "Chunk"
    WHERE "workspaceId" = ${params.workspaceId}
      AND "kind" = 'KNOWLEDGE'
      AND "isPublished" = true
      AND "deletedAt" IS NULL
      AND "embedding" IS NOT NULL
      AND (
        ${retrievalMode} = 'COPILOT'
        OR "visibility" = 'CUSTOMER_SAFE'::"KnowledgeVisibility"
      )
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
      visibility: row.visibility,
    }))
    .filter((result) => result.similarity >= minSimilarity);
}

export type ReplaceTicketChunksParams = {
  workspaceId: string;
  ticketId: string;
  customerIdentityId: string;
  channelType: "WEB" | "WHATSAPP";
  chunks: ChunkToStore[];
};

/**
 * Replaces every Ticket-Knowledge Chunk belonging to one resolved Ticket:
 * deletes the previous set, then inserts the new one with deterministic ids
 * (`${ticketId}:${position}`), so re-indexing the same Ticket replaces
 * rather than duplicates. `customerIdentityId` and `channelType` are
 * denormalized onto the row so `searchTicketChunks` can filter without a
 * join — see ADR-0003.
 */
export async function replaceTicketChunks(db: SqlDb, params: ReplaceTicketChunksParams): Promise<void> {
  const { workspaceId, ticketId, customerIdentityId, channelType, chunks } = params;

  await db.$executeRaw`
    DELETE FROM "Chunk"
    WHERE "workspaceId" = ${workspaceId} AND "ticketId" = ${ticketId} AND "kind" = 'TICKET'
  `;

  for (const chunk of chunks) {
    await db.$executeRaw`
      INSERT INTO "Chunk" (
        "id", "workspaceId", "kind", "ticketId", "customerIdentityId", "channelType",
        "content", "embedding", "position", "createdAt"
      ) VALUES (
        ${chunkId(ticketId, chunk.position)}, ${workspaceId}, 'TICKET', ${ticketId},
        ${customerIdentityId}, ${channelType}::"ChannelType",
        ${chunk.content}, ${toVectorLiteral(chunk.embedding)}::vector,
        ${chunk.position}, now()
      )
    `;
  }
}

export type SearchTicketChunksParams = {
  workspaceId: string;
  customerIdentityId: string;
  channelType: "WEB" | "WHATSAPP";
  embedding: number[];
  excludeTicketId?: string;
  limit?: number;
  minSimilarity?: number;
};

export type TicketChunkSearchResult = {
  chunkId: string;
  ticketId: string;
  content: string;
  position: number;
  similarity: number;
};

type RawTicketChunkRow = {
  id: string;
  ticketId: string;
  content: string;
  position: number;
  similarity: number | string;
};

/**
 * Searches Ticket-Knowledge chunks by cosine similarity, scoped to the same
 * Workspace, the same Customer Identity, and the same Channel — the
 * retrieval boundary the product requires so one Customer's Ticket history
 * never surfaces for another. Only resolved Tickets are ever indexed as
 * `kind = 'TICKET'` chunks in the first place, so no separate status filter
 * is needed here.
 */
export async function searchTicketChunks(
  db: SqlDb,
  params: SearchTicketChunksParams,
): Promise<TicketChunkSearchResult[]> {
  const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;
  const minSimilarity = params.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const queryVector = toVectorLiteral(params.embedding);
  const excludeTicketId = params.excludeTicketId ?? "";

  const rows = await db.$queryRaw<RawTicketChunkRow[]>`
    SELECT "id", "ticketId", "content", "position",
           1 - ("embedding" <=> ${queryVector}::vector) AS similarity
    FROM "Chunk"
    WHERE "workspaceId" = ${params.workspaceId}
      AND "kind" = 'TICKET'
      AND "customerIdentityId" = ${params.customerIdentityId}
      AND "channelType" = ${params.channelType}::"ChannelType"
      AND "deletedAt" IS NULL
      AND "embedding" IS NOT NULL
      AND "ticketId" IS DISTINCT FROM ${excludeTicketId}
    ORDER BY "embedding" <=> ${queryVector}::vector ASC
    LIMIT ${limit}
  `;

  return rows
    .map((row) => ({
      chunkId: row.id,
      content: row.content,
      position: row.position,
      similarity: Number(row.similarity),
      ticketId: row.ticketId,
    }))
    .filter((result) => result.similarity >= minSimilarity);
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

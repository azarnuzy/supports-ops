import { evalConfig } from "../config";
import { unscopedPrisma } from "../utils/prisma";
import { withWorkspaceContext } from "../utils/workspace-context";

/**
 * A gold-passage label for a retrieval Case. Anchored on the Knowledge
 * Source's own title plus a distinctive text fragment rather than a Chunk ID
 * — Chunk IDs are position-based, so re-publishing a Knowledge Source with
 * different chunking would silently repoint every label after the edit.
 */
export type ExpectedPassage = { source: string; fragment: string };

export type ResolvedExpectedPassage = ExpectedPassage & { chunkIds: string[] };

/**
 * Resolves each label to the published, Customer-Safe Chunk IDs that
 * currently carry it. A label matching zero Chunks means the Knowledge
 * changed since the Case was written — that has to fail loudly (an
 * `invalid` outcome) rather than silently score as zero recall, per #182's
 * acceptance criteria.
 */
export async function resolveExpectedPassages(
  passages: readonly ExpectedPassage[],
): Promise<ResolvedExpectedPassage[]> {
  const workspaceId = evalConfig.workspaceId;
  if (!workspaceId) {
    throw new Error("EVAL_WORKSPACE_ID is required to resolve expected-passage labels.");
  }

  return withWorkspaceContext(workspaceId, () =>
    Promise.all(
      passages.map(async (passage) => {
        const chunks = await unscopedPrisma.chunk.findMany({
          select: { id: true },
          where: {
            content: { contains: passage.fragment },
            deletedAt: null,
            isPublished: true,
            kind: "KNOWLEDGE",
            knowledgeSource: { title: { contains: passage.source } },
            visibility: "CUSTOMER_SAFE",
            workspaceId,
          },
        });
        return { ...passage, chunkIds: chunks.map((chunk: { id: string }) => chunk.id) };
      }),
    ),
  );
}

/** Fraction of expected passages retrieved this turn (label-level, not chunk-level:
 * a passage counts once it is recovered, however many neighbor Chunks it expanded into). */
export function recallAtK(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
): number {
  if (!resolved.length) return 0;
  const retrieved = new Set(retrievedChunkIds);
  const hits = resolved.filter((passage) => passage.chunkIds.some((id) => retrieved.has(id)));
  return hits.length / resolved.length;
}

/** Fraction of the retrieved set that matched an expected passage. */
export function precisionAtK(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
): number {
  if (!retrievedChunkIds.length) return 0;
  const relevant = new Set(resolved.flatMap((passage) => passage.chunkIds));
  const hits = retrievedChunkIds.filter((id) => relevant.has(id));
  return hits.length / retrievedChunkIds.length;
}

/** 1-based rank of the first retrieved Chunk that matches any expected passage,
 * or `null` when nothing relevant was retrieved. */
export function firstRelevantRank(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
): number | null {
  const relevant = new Set(resolved.flatMap((passage) => passage.chunkIds));
  const rank = retrievedChunkIds.findIndex((id) => relevant.has(id));
  return rank === -1 ? null : rank + 1;
}

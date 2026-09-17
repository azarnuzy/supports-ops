import { evalConfig } from "../config";
import { unscopedPrisma } from "../utils/prisma";
import { withWorkspaceContext } from "../utils/workspace-context";

/**
 * A gold-passage label for a retrieval Case. Anchored on the Knowledge
 * Source's own title plus a distinctive text fragment rather than a Chunk ID
 * — Chunk IDs are position-based, so re-publishing a Knowledge Source with
 * different chunking would silently repoint every label after the edit.
 */
export type ExpectedPassage = {
  source: string;
  fragment: string;
  /** Graded relevance, TREC-style: 2 (default) directly answers the question and
   * must be retrieved; 1 is also relevant (supporting context) but not required. */
  grade?: 1 | 2;
};

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

const gradeOf = (passage: ExpectedPassage) => passage.grade ?? 2;

/** Recall@k: fraction of *required* (grade 2) passages retrieved this turn —
 * label-level, not chunk-level: a passage counts once it is recovered, however
 * many Chunks carry it. */
export function recallAtK(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
): number {
  const required = resolved.filter((passage) => gradeOf(passage) === 2);
  if (!required.length) return 0;
  const retrieved = new Set(retrievedChunkIds);
  const hits = required.filter((passage) => passage.chunkIds.some((id) => retrieved.has(id)));
  return hits.length / required.length;
}

/** Precision@k: share of the retrieved set that carries any labelled passage. */
export function precisionAtK(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
): number {
  if (!retrievedChunkIds.length) return 0;
  const relevant = new Set(resolved.flatMap((passage) => passage.chunkIds));
  const hits = retrievedChunkIds.filter((id) => relevant.has(id));
  return hits.length / retrievedChunkIds.length;
}

/** Reciprocal rank of the first relevant Chunk (any grade); 0 when none. Its
 * mean over a suite is MRR. */
export function reciprocalRank(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
): number {
  const relevant = new Set(resolved.flatMap((passage) => passage.chunkIds));
  const rank = retrievedChunkIds.findIndex((id) => relevant.has(id));
  return rank === -1 ? 0 : 1 / (rank + 1);
}

/**
 * nDCG@k with graded gains (2^grade - 1). Gain is credited per passage, once, at
 * the first Chunk that carries it, so a passage split over neighboring Chunks
 * cannot score above the ideal ranking.
 */
export function ndcgAtK(
  resolved: readonly ResolvedExpectedPassage[],
  retrievedChunkIds: readonly string[],
  k: number,
): number {
  const gain = (grade: number) => 2 ** grade - 1;
  const discount = (index: number) => Math.log2(index + 2);
  const credited = new Set<ResolvedExpectedPassage>();

  let dcg = 0;
  retrievedChunkIds.slice(0, k).forEach((id, index) => {
    const fresh = resolved.filter(
      (passage) => !credited.has(passage) && passage.chunkIds.includes(id),
    );
    if (!fresh.length) return;
    for (const passage of fresh) credited.add(passage);
    dcg += gain(Math.max(...fresh.map(gradeOf))) / discount(index);
  });

  const idcg = resolved
    .map(gradeOf)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, grade, index) => sum + gain(grade) / discount(index), 0);
  return idcg ? dcg / idcg : 0;
}

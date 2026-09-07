/**
 * Deterministic from the source id and position, so re-publishing the same
 * Knowledge Source produces the same Chunk ids and `replaceChunks` really
 * does replace rather than duplicate.
 */
export function chunkId(knowledgeSourceId: string, position: number): string {
  return `${knowledgeSourceId}:${position}`;
}

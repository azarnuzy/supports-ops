import { Queue, type ConnectionOptions } from "bullmq";
import type { KnowledgeVisibility } from "../../utils/prisma";

export type KnowledgeIngestJob = {
  knowledgeSourceId: string;
  workspaceId: string;
  title: string;
  content: string;
  visibility: KnowledgeVisibility;
};

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};

let knowledgeIngestQueue: Queue<KnowledgeIngestJob> | null = null;

export function getKnowledgeIngestQueue() {
  knowledgeIngestQueue ??= new Queue<KnowledgeIngestJob>("knowledge-ingest", { connection });
  return knowledgeIngestQueue;
}

export async function enqueueKnowledgeIngest(job: KnowledgeIngestJob) {
  await getKnowledgeIngestQueue().add("ingest", job, {
    attempts: 3,
    backoff: { delay: 2_000, type: "exponential" },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

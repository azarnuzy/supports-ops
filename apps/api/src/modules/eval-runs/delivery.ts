import type { Job } from "bullmq";
import { unscopedPrisma as db } from "../../utils/prisma";
import type { EvalDeliveryJob } from "./queue";
import { centralSink, workspaceSink } from "./sinks";

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500);

/** Redelivers the evidence a destination refused. It calls no model and touches no Credits: it only
 * replays stored request bodies to the one destination named by the job, so an outage at one never
 * blocks or rewrites the other's status. The Workspace destination comes from the Run's frozen
 * snapshot, so editing the destination later cannot redirect old evidence. */
export async function processEvalDelivery(job: Job<EvalDeliveryJob>) {
  const { runId, target, workspaceId } = job.data;
  const run = await db.evalRun.findFirst({ where: { id: runId, workspaceId } });
  if (!run) return;
  const field = target === "CENTRAL" ? "centralDelivery" : "workspaceDelivery";
  const where = { runId, target };

  await db.evalRunEvidence.updateMany({
    data: { failedAt: new Date(), lastError: "Expired before it could be delivered." },
    where: { ...where, deliveredAt: null, expiresAt: { lte: new Date() }, failedAt: null },
  });
  const open = await db.evalRunEvidence.findMany({
    where: { ...where, deliveredAt: null, failedAt: null },
  });

  const sink =
    target === "CENTRAL"
      ? centralSink()
      : workspaceSink({
          credentialsEncrypted: run.destinationCredentialsEncrypted,
          endpoint: run.destinationEndpoint,
        });
  let failure: string | undefined = sink ? undefined : "The destination is no longer available.";
  for (const row of sink ? open : []) {
    try {
      await sink?.send(row.signal as never, row.body);
      await db.evalRunEvidence.update({
        data: { body: "", deliveredAt: new Date() },
        where: { id: row.id },
      });
    } catch (error) {
      failure = message(error);
      await db.evalRunEvidence.update({
        data: { attempts: { increment: 1 }, lastError: failure },
        where: { id: row.id },
      });
    }
  }

  if (failure && job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw new Error(failure);
  if (failure) {
    await db.evalRunEvidence.updateMany({
      data: { failedAt: new Date() },
      where: { ...where, deliveredAt: null, failedAt: null },
    });
  }
  const undelivered = await db.evalRunEvidence.count({ where: { ...where, deliveredAt: null } });
  await db.evalRun.update({
    data: { [field]: undelivered === 0 ? "DELIVERED" : "ERROR" },
    where: { id: runId },
  });
}

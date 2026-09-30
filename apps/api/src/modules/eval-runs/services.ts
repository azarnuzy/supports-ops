import { createHash, randomUUID } from "node:crypto";
import { embeddingConfig } from "../../config";
import { isDeterministicMetric } from "../../evals/deterministic";
import { isUniqueConstraintError, prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { modelRateFor, resolveAgentModelId } from "../ai-agent/model-catalog";
import { creditBalance, hasActiveUnlimitedPeriod } from "../credits/services";
import { presentCase } from "../eval-datasets/services";
import { enqueueEvalDelivery, enqueueEvalRun } from "./queue";
import type { Selection } from "./schema";

export class RunSelectionNotFoundError extends Error {}
export class RunNotFoundError extends Error {}
export class RunActiveError extends Error {}
export class DeliveryNotRetryableError extends Error {}
export class RunBlockedError extends Error {
  constructor(
    readonly code:
      | "ai_agent_required"
      | "credits_exhausted"
      | "destination_required"
      | "incomplete_cases"
      | "metric_not_enabled",
    message: string,
    readonly caseKeys: string[] = [],
  ) {
    super(message);
  }
}

/** The AI Agent a Run evaluates: the one answering this Workspace's Web Channel, as in production. */
async function loadAgent() {
  const channel = await prisma.channel.findFirst({
    select: { aiAgentId: true },
    where: { type: "WEB" },
  });
  const agent = channel
    ? await prisma.aiAgent.findFirst({
        select: { agentModel: true, id: true, instructions: true },
        where: { id: channel.aiAgentId },
      })
    : null;
  if (!agent) throw new RunBlockedError("ai_agent_required", "This Workspace has no AI Agent.");
  return { ...agent, agentModel: resolveAgentModelId(agent.agentModel) };
}

/** Loads the selected Cases from this Workspace only; an ID from anywhere else reads as missing. */
async function loadSelection({ caseIds, datasetId }: Selection) {
  const dataset = await prisma.evalDataset.findFirst({ where: { id: datasetId } });
  if (!dataset) throw new RunSelectionNotFoundError();
  const rows = await prisma.evalCase.findMany({
    orderBy: { createdAt: "asc" },
    where: { datasetId, id: { in: caseIds } },
  });
  if (rows.length !== caseIds.length) throw new RunSelectionNotFoundError();
  const order = new Map(caseIds.map((id, index) => [id, index]));
  const cases = rows
    .map((row) => ({ presented: presentCase(row), row }))
    .sort((a, b) => (order.get(a.row.id) ?? 0) - (order.get(b.row.id) ?? 0));

  const incomplete = cases.filter(({ presented }) => !presented.complete);
  if (incomplete.length)
    throw new RunBlockedError(
      "incomplete_cases",
      "Complete every selected Case before running it.",
      incomplete.map(({ row }) => row.caseKey),
    );
  // ponytail: only deterministic metrics run for now; Judge and retrieval metrics are enabled by
  // the Judge ticket, because they need a Judge Model rate and labelled Knowledge.
  const gated = cases.filter(({ row }) => !isDeterministicMetric(row.metric ?? ""));
  if (gated.length)
    throw new RunBlockedError(
      "metric_not_enabled",
      "These Cases use a metric that cannot be run yet.",
      gated.map(({ row }) => row.caseKey),
    );
  return { cases: cases.map(({ row }) => row), dataset };
}

async function estimateFor(caseCount: number) {
  const agent = await loadAgent();
  const [balance, unlimited] = await Promise.all([
    creditBalance(requireWorkspaceId()),
    hasActiveUnlimitedPeriod(requireWorkspaceId()),
  ]);
  const rate = modelRateFor(agent.agentModel);
  // Every selected Case is one AI Turn. A turn that fails before deciding is not charged, so this
  // is the ceiling. Judge calls are not part of it: no selectable metric makes any yet.
  const credits = unlimited ? 0 : caseCount * rate;
  return {
    agentModel: agent.agentModel,
    balance,
    caseCount,
    credits,
    judgeCredits: 0,
    modelRate: rate,
    sufficient: unlimited || balance >= credits,
    unlimited,
  };
}

export async function estimateRun(selection: Selection) {
  return estimateFor((await loadSelection(selection)).cases.length);
}

export async function startRun(selection: Selection) {
  const workspaceId = requireWorkspaceId();
  const { cases, dataset } = await loadSelection(selection);
  const destination = await prisma.evalDestination.findFirst();
  if (!destination)
    throw new RunBlockedError("destination_required", "Set an evaluation destination first.");
  const agent = await loadAgent();
  if ((await creditBalance(workspaceId)) <= 0 && !(await hasActiveUnlimitedPeriod(workspaceId)))
    throw new RunBlockedError("credits_exhausted", "This Organization has no Credits left.");
  const estimate = await estimateFor(cases.length);

  const id = randomUUID();
  try {
    // One statement: the Run and its frozen Cases exist together or not at all, and the database's
    // one-active-Run-per-Workspace index decides which of two concurrent starts wins.
    await prisma.evalRun.create({
      data: {
        agentModel: agent.agentModel,
        aiAgentId: agent.id,
        cases: {
          create: cases.map((item, position) => ({
            attachments: item.attachments ?? [],
            caseKey: item.caseKey,
            category: item.category,
            clarificationCount: item.clarificationCount,
            expected: item.expected,
            history: item.history ?? [],
            id: randomUUID(),
            message: item.message,
            metadata: item.metadata ?? {},
            metric: item.metric ?? "",
            position,
            sourceCaseId: item.id,
            workspaceId,
          })),
        },
        criteria: dataset.criteria,
        datasetId: dataset.id,
        datasetName: dataset.name,
        destinationBackend: destination.backend,
        destinationCredentialsEncrypted: destination.credentialsEncrypted,
        destinationDashboardUrl: destination.dashboardUrl,
        destinationEndpoint: destination.endpoint,
        embeddingModel: embeddingConfig.modelId,
        estimatedCredits: estimate.credits,
        id,
        instructionsSha256: createHash("sha256")
          .update(agent.instructions ?? "")
          .digest("hex"),
        workspaceId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error, "workspaceId")) throw new RunActiveError();
    throw error;
  }
  try {
    await enqueueEvalRun({ runId: id, workspaceId });
  } catch (error) {
    await prisma.evalRun.update({
      data: { error: "The Run could not be queued.", finishedAt: new Date(), status: "ERROR" },
      where: { id },
    });
    throw error;
  }
  return getRun(id);
}

export async function getRun(id: string) {
  const run = await prisma.evalRun.findFirst({
    include: { cases: { orderBy: { position: "asc" } } },
    where: { id },
  });
  if (!run) throw new RunNotFoundError();
  const { _sum } = await prisma.creditLedgerEntry.aggregate({
    _sum: { credits: true },
    where: { evalRunId: id },
  });
  const open = await prisma.evalRunEvidence.findMany({
    orderBy: { expiresAt: "asc" },
    select: { expiresAt: true, target: true },
    where: { deliveredAt: null, runId: id },
  });
  const expiry = (target: "CENTRAL" | "WORKSPACE") =>
    open.find((row) => row.target === target)?.expiresAt ?? null;
  const retryable = (target: "CENTRAL" | "WORKSPACE") => {
    const expiresAt = expiry(target);
    return run.status !== "QUEUED" && run.status !== "RUNNING" && !!expiresAt && expiresAt > new Date();
  };
  const {
    destinationCredentialsEncrypted: _credentials,
    destinationEndpoint: _endpoint,
    cases,
    ...visible
  } = run;
  const count = (status: (typeof cases)[number]["status"]) =>
    cases.filter((item) => item.status === status).length;
  return {
    ...visible,
    cases: cases.map(
      ({
        id: caseId,
        caseKey,
        category,
        error,
        limitations,
        metric,
        passed,
        position,
        status,
        traceId,
      }) => ({
        caseKey,
        category,
        error,
        id: caseId,
        limitations,
        metric,
        passed,
        position,
        status,
        traceId,
      }),
    ),
    centralExpiresAt: expiry("CENTRAL"),
    centralRetryable: run.centralDelivery === "ERROR" && retryable("CENTRAL"),
    chargedCredits: -(_sum.credits ?? 0),
    workspaceExpiresAt: expiry("WORKSPACE"),
    workspaceRetryable: run.workspaceDelivery === "ERROR" && retryable("WORKSPACE"),
    progress: {
      evaluated: count("EVALUATED"),
      executionErrors: count("EXECUTION_ERROR"),
      passed: cases.filter((item) => item.passed === true).length,
      total: cases.length,
      unexecuted: count("UNEXECUTED"),
    },
  };
}

export async function listRuns(datasetId?: string) {
  const runs = await prisma.evalRun.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: 20,
    where: datasetId ? { datasetId } : {},
  });
  return Promise.all(runs.map((run) => getRun(run.id)));
}

/** Admin retry of one destination's terminal delivery error, while its evidence is still retained.
 * Only queues stored evidence: no model call, no Credits. */
export async function retryDelivery(id: string, target: "CENTRAL" | "WORKSPACE") {
  const run = await getRun(id);
  const retryable = target === "CENTRAL" ? run.centralRetryable : run.workspaceRetryable;
  if (!retryable)
    throw new DeliveryNotRetryableError("There is no unexpired evidence left to deliver.");
  const workspaceId = requireWorkspaceId();
  await prisma.evalRunEvidence.updateMany({
    data: { failedAt: null },
    where: { deliveredAt: null, expiresAt: { gt: new Date() }, runId: id, target },
  });
  await prisma.evalRun.update({
    data: target === "CENTRAL" ? { centralDelivery: "PENDING" } : { workspaceDelivery: "PENDING" },
    where: { id },
  });
  await enqueueEvalDelivery({ runId: id, target, workspaceId });
  return getRun(id);
}

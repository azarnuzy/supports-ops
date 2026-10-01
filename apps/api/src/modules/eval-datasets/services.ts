import { sortRows } from "@repo/shared/table-sort";
import { evalMetricLabels } from "@repo/shared/eval-schema";
import type { z } from "zod";
import type { datasetCaseQuery } from "./schema";
import { randomUUID } from "node:crypto";
import { isUniqueConstraintError, prisma, type EvalCase, type Prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import {
  type ImportPreview,
  type ImportRow,
  type ImportSource,
  keyAllocator,
  validate,
  previewCsv,
  previewPaste,
} from "./import";
import {
  type CaseInput,
  caseIssues,
  type EvalCaseMetadata,
  evalCaseMetadataSchema,
} from "./schema";

export class DatasetNotFoundError extends Error {}
export class CaseNotFoundError extends Error {}
export class DuplicateCaseKeyError extends Error {}

export function presentCase(row: EvalCase) {
  const metadata: EvalCaseMetadata = evalCaseMetadataSchema.parse(row.metadata);
  const issues = caseIssues({ expected: row.expected, metadata, metric: row.metric });
  return {
    attachments: row.attachments as CaseInput["attachments"],
    caseKey: row.caseKey,
    category: row.category,
    clarificationCount: row.clarificationCount,
    complete: issues.length === 0,
    datasetId: row.datasetId,
    expected: row.expected,
    history: row.history as CaseInput["history"],
    id: row.id,
    issues,
    message: row.message,
    metadata,
    metric: row.metric,
    updatedAt: row.updatedAt,
  };
}

export async function listDatasets() {
  const datasets = await prisma.evalDataset.findMany({
    include: { cases: { select: { expected: true, metadata: true, metric: true } } },
    orderBy: { createdAt: "desc" },
  });
  const lastRuns = await prisma.evalRun.groupBy({
    by: ["datasetId"],
    where: { datasetId: { in: datasets.map((dataset) => dataset.id) } },
    _max: { createdAt: true },
  });
  const lastRunAt = new Map(lastRuns.map((run) => [run.datasetId, run._max.createdAt]));
  return datasets.map(({ cases, ...dataset }) => {
    const presented = cases.map((item) => ({
      complete:
        caseIssues({
          ...item,
          metadata: evalCaseMetadataSchema.parse(item.metadata),
        }).length === 0,
    }));
    return {
      ...dataset,
      lastRunAt: lastRunAt.get(dataset.id) ?? null,
      caseCount: presented.length,
      incompleteCount: presented.filter((item) => !item.complete).length,
    };
  });
}

export async function getDataset(
  id: string,
  input: Partial<z.output<typeof datasetCaseQuery>> = {},
) {
  const { page: requestedPage = 1, search = "", status = "all" } = input;
  const dataset = await prisma.evalDataset.findFirst({ where: { id } });
  if (!dataset) throw new DatasetNotFoundError();
  // ponytail: scan the existing case index and sort in memory; use SQL ordering if dataset size makes it costly.
  // Readiness is derived from the existing metric contract, never a second persisted flag.
  const index = await prisma.evalCase.findMany({
    where: { datasetId: id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      caseKey: true,
      message: true,
      category: true,
      expected: true,
      metadata: true,
      metric: true,
    },
  });
  const caseIndex = index.map((item) => ({
    id: item.id,
    caseKey: item.caseKey,
    complete:
      caseIssues({ ...item, metadata: evalCaseMetadataSchema.parse(item.metadata) }).length === 0,
  }));
  const matching = index.filter(
    (item, position) =>
      (status === "all" || caseIndex[position]!.complete === (status === "ready")) &&
      (!search ||
        [item.message, item.caseKey, item.category].some((value) =>
          value.toLowerCase().includes(search.toLowerCase()),
        )),
  );
  const readiness = new Map(caseIndex.map((item) => [item.id, item.complete]));
  const sorted = sortRows(
    matching,
    input.sortBy
      ? {
          column: input.sortBy,
          direction: input.sortDirection ?? "asc",
        }
      : null,
    (item) => {
      if (input.sortBy === "complete") return readiness.get(item.id) ? "Ready" : "Needs setup";
      if (input.sortBy === "metric")
        return item.metric
          ? (evalMetricLabels[item.metric as keyof typeof evalMetricLabels] ?? item.metric)
          : null;
      return (
        item[
          input.sortBy === "message"
            ? "message"
            : input.sortBy === "category"
              ? "category"
              : "caseKey"
        ] || null
      );
    },
  );
  const total = sorted.length;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 25)));
  const pageIds = sorted.slice((page - 1) * 25, page * 25).map((item) => item.id);
  const rows = await prisma.evalCase.findMany({ where: { datasetId: id, id: { in: pageIds } } });
  const byId = new Map(rows.map((item) => [item.id, item]));
  const cases = pageIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  return { ...dataset, cases: cases.map(presentCase), caseIndex, page, total };
}

export function createDataset(input: { criteria: string; name: string }) {
  return prisma.evalDataset.create({
    data: { ...input, id: randomUUID(), workspaceId: requireWorkspaceId() },
  });
}

export async function updateDataset(id: string, input: { criteria: string; name: string }) {
  if (!(await prisma.evalDataset.findFirst({ where: { id } }))) throw new DatasetNotFoundError();
  return prisma.evalDataset.update({ data: input, where: { id } });
}

const rowData = (input: CaseInput) => ({
  ...input,
  history: input.history,
  metadata: input.metadata,
});

export async function createCase(datasetId: string, input: CaseInput) {
  if (!(await prisma.evalDataset.findFirst({ where: { id: datasetId } })))
    throw new DatasetNotFoundError();
  try {
    return presentCase(
      await prisma.evalCase.create({
        data: { ...rowData(input), datasetId, id: randomUUID(), workspaceId: requireWorkspaceId() },
      }),
    );
  } catch (error) {
    if (isUniqueConstraintError(error, "caseKey")) throw new DuplicateCaseKeyError();
    throw error;
  }
}

export async function updateCase(datasetId: string, id: string, input: CaseInput) {
  if (!(await prisma.evalCase.findFirst({ where: { datasetId, id } })))
    throw new CaseNotFoundError();
  try {
    return presentCase(await prisma.evalCase.update({ data: rowData(input), where: { id } }));
  } catch (error) {
    if (isUniqueConstraintError(error, "caseKey")) throw new DuplicateCaseKeyError();
    throw error;
  }
}

export async function deleteCase(datasetId: string, id: string) {
  if (!(await prisma.evalCase.findFirst({ where: { datasetId, id } })))
    throw new CaseNotFoundError();
  await prisma.evalCase.delete({ where: { id } });
}

async function previewSessions(
  selections: { includeHistory: boolean; messageId: string }[],
  alloc: ReturnType<typeof keyAllocator>,
): Promise<ImportPreview> {
  const picked = await prisma.message.findMany({
    select: { content: true, id: true, position: true, sessionId: true },
    where: {
      deletedAt: null,
      id: { in: selections.map((s) => s.messageId) },
      senderType: "CUSTOMER",
    },
  });
  const byId = new Map(picked.map((m) => [m.id, m]));
  const histories = new Map<string, CaseInput["history"]>();
  // Bound parallel reads and fetch only the context actually included in each case.
  for (let offset = 0; offset < selections.length; offset += 20) {
    await Promise.all(
      selections.slice(offset, offset + 20).map(async (selection) => {
        const message = byId.get(selection.messageId);
        if (selection.includeHistory && message) {
          const turns = await historyForMessage(message);
          histories.set(
            selection.messageId,
            turns.map(({ content, role }) => ({ content, role })),
          );
        }
      }),
    );
  }
  const rows = selections.map((s, index): ImportRow => {
    const message = byId.get(s.messageId);
    // Unknown and other-Workspace ids look identical: the scoped query never returns them.
    if (!message)
      return {
        case: null,
        errors: ["Customer message not found in this Workspace."],
        row: index + 1,
      };
    const history = histories.get(s.messageId) ?? [];
    return validate(
      index + 1,
      { caseKey: alloc.fresh(), history, message: message.content },
      alloc,
    );
  });
  return {
    error: null,
    rows,
    truncated: null,
  };
}

/** Parses and validates without saving, so the Admin sees errors before saving. */
export async function previewImport(
  datasetId: string,
  source: ImportSource,
): Promise<ImportPreview> {
  if (!(await prisma.evalDataset.findFirst({ where: { id: datasetId } })))
    throw new DatasetNotFoundError();
  const taken = await prisma.evalCase.findMany({ select: { caseKey: true }, where: { datasetId } });
  const alloc = keyAllocator(taken.map((c) => c.caseKey));
  if (source.source === "paste") return previewPaste(source.text, alloc);
  if (source.source === "csv") return previewCsv(source.text, alloc);
  return previewSessions(source.selections, alloc);
}

/** Saves the valid rows of the preview as cases (drafts unless the source supplied a full case).
 * Invalid rows are skipped and returned so nothing disappears silently. */
export async function importCases(datasetId: string, source: ImportSource) {
  const preview = await previewImport(datasetId, source);
  const valid = preview.rows.flatMap((r) => (r.case ? [r.case] : []));
  const workspaceId = requireWorkspaceId();
  try {
    const data = valid.map((input) => ({
      ...rowData(input),
      datasetId,
      id: randomUUID(),
      workspaceId,
    }));
    // Keep a large import atomic while staying below PostgreSQL's parameter limit.
    const created = await prisma.$transaction(
      async (tx) => {
        const rows: EvalCase[] = [];
        for (let offset = 0; offset < data.length; offset += 500) {
          const batch = data.slice(offset, offset + 500);
          await tx.evalCase.createMany({ data: batch });
          rows.push(
            ...(await tx.evalCase.findMany({
              where: { id: { in: batch.map((item) => item.id) } },
            })),
          );
        }
        return rows;
      },
      { timeout: 30_000 },
    );
    const byId = new Map(created.map((item) => [item.id, item]));
    return { ...preview, cases: data.map((item) => presentCase(byId.get(item.id)!)) };
  } catch (error) {
    if (isUniqueConstraintError(error, "caseKey")) throw new DuplicateCaseKeyError();
    throw error;
  }
}

/** Recent Sessions with their Customer messages, for the "Recent Sessions" tab. */
export async function listImportSessions() {
  const sessions = await prisma.session.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      createdAt: true,
      id: true,
      messages: {
        orderBy: { position: "asc" },
        select: { content: true, id: true, position: true },
        where: { deletedAt: null, senderType: "CUSTOMER" },
      },
    },
    take: 20,
  });
  return sessions.filter((s) => s.messages.length);
}

/** Page Customer Messages directly; an old Session can still contain a recent Message. */
export async function listImportMessages(input: {
  page: number;
  search: string;
  channel: "all" | "WEB" | "WHATSAPP";
  since: string;
}) {
  const where: Prisma.MessageWhereInput = {
    deletedAt: null,
    senderType: "CUSTOMER",
    content: { not: "" },
    ...(input.channel !== "all" ? { session: { channel: { type: input.channel } } } : {}),
    ...(input.since !== "all"
      ? { createdAt: { gte: new Date(Date.now() - Number(input.since) * 86_400_000) } }
      : {}),
    ...(input.search
      ? {
          OR: [
            { content: { contains: input.search, mode: "insensitive" } },
            {
              session: {
                customerIdentity: { name: { contains: input.search, mode: "insensitive" } },
              },
            },
            {
              session: {
                customerIdentity: { email: { contains: input.search, mode: "insensitive" } },
              },
            },
            { session: { customerIdentity: { phoneE164: { contains: input.search } } } },
          ],
        }
      : {}),
  };
  const total = await prisma.message.count({ where });
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const messages = await prisma.message.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 20,
    take: 20,
    select: {
      content: true,
      id: true,
      createdAt: true,
      position: true,
      session: {
        select: {
          channel: { select: { name: true, type: true } },
          customerIdentity: { select: { name: true, email: true, phoneE164: true } },
        },
      },
    },
  });
  return { messages, page, total };
}

export async function updateCaseExpectations(
  datasetId: string,
  input: {
    caseIds: string[];
    expected: string;
    metric: CaseInput["metric"];
    metadata: EvalCaseMetadata;
  },
) {
  const ids = [...new Set(input.caseIds)];
  const where = { datasetId, id: { in: ids } };
  if ((await prisma.evalCase.count({ where })) !== ids.length) throw new CaseNotFoundError();
  return prisma.evalCase.updateMany({
    where,
    data: { expected: input.expected, metric: input.metric, metadata: input.metadata },
  });
}

export async function getImportMessageContext(messageId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, senderType: "CUSTOMER", deletedAt: null },
    select: { sessionId: true, position: true },
  });
  if (!message) throw new CaseNotFoundError();
  return historyForMessage(message);
}

async function historyForMessage(message: { sessionId: string; position: number }) {
  const turns = await prisma.message.findMany({
    where: {
      sessionId: message.sessionId,
      position: { lt: message.position },
      deletedAt: null,
      senderType: { in: ["CUSTOMER", "AI_AGENT"] },
      content: { not: "" },
    },
    orderBy: { position: "desc" },
    take: 20,
    select: { id: true, content: true, senderType: true },
  });
  return turns.reverse().map((turn) => ({
    id: turn.id,
    content: turn.content,
    role: turn.senderType === "CUSTOMER" ? ("user" as const) : ("assistant" as const),
  }));
}

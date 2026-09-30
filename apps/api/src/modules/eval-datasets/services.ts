import { randomUUID } from "node:crypto";
import { isUniqueConstraintError, prisma, type EvalCase } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import {
  historyBefore,
  IMPORT_ROW_LIMIT,
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
    include: { cases: true },
    orderBy: { createdAt: "desc" },
  });
  return datasets.map(({ cases, ...dataset }) => {
    const presented = cases.map(presentCase);
    return {
      ...dataset,
      caseCount: presented.length,
      incompleteCount: presented.filter((item) => !item.complete).length,
    };
  });
}

export async function getDataset(id: string) {
  const dataset = await prisma.evalDataset.findFirst({
    include: { cases: { orderBy: { createdAt: "asc" } } },
    where: { id },
  });
  if (!dataset) throw new DatasetNotFoundError();
  const { cases, ...rest } = dataset;
  return { ...rest, cases: cases.map(presentCase) };
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
  const withHistory = [
    ...new Set(
      selections.flatMap((s) => (s.includeHistory ? (byId.get(s.messageId)?.sessionId ?? []) : [])),
    ),
  ];
  const context = withHistory.length
    ? await prisma.message.findMany({
        orderBy: { position: "asc" },
        select: { content: true, id: true, position: true, senderType: true, sessionId: true },
        where: { deletedAt: null, sessionId: { in: withHistory } },
      })
    : [];
  const rows = selections.slice(0, IMPORT_ROW_LIMIT).map((s, index): ImportRow => {
    const message = byId.get(s.messageId);
    // Unknown and other-Workspace ids look identical: the scoped query never returns them.
    if (!message)
      return {
        case: null,
        errors: ["Customer message not found in this Workspace."],
        row: index + 1,
      };
    const history = s.includeHistory
      ? historyBefore(
          context.filter((m) => m.sessionId === message.sessionId),
          message.position,
        )
      : [];
    return validate(
      index + 1,
      { caseKey: alloc.fresh(), history, message: message.content },
      alloc,
    );
  });
  return {
    error: null,
    rows,
    truncated:
      selections.length > IMPORT_ROW_LIMIT
        ? { limit: IMPORT_ROW_LIMIT, total: selections.length }
        : null,
  };
}

/** Parses and validates without saving, so the Admin sees errors and truncation first. */
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
    const created = await prisma.$transaction(
      valid.map((input) =>
        prisma.evalCase.create({
          data: { ...rowData(input), datasetId, id: randomUUID(), workspaceId },
        }),
      ),
    );
    return { ...preview, cases: created.map(presentCase) };
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

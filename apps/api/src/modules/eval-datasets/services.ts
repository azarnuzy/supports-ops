import { randomUUID } from "node:crypto";
import { isUniqueConstraintError, prisma, type EvalCase } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
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

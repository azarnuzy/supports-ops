import { randomUUID } from "node:crypto";
import { prisma, unscopedPrisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { defaultTicketCategories } from "./defaults";
import type { CreateTicketCategoryInput, UpdateTicketCategoryInput } from "./schema";

export class TicketCategoryNotFoundError extends Error {}
export class FallbackCategoryError extends Error {}
export class DuplicateCategoryError extends Error {}

/** Stable identifier stored on Tickets. Derived from the label once, at
 * creation, and never touched again so a rename cannot orphan existing Tickets. */
function keyFor(label: string) {
  const base = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || `CATEGORY_${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function listTicketCategories() {
  return prisma.ticketCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
}

export async function seedDefaultTicketCategories(
  tx: Pick<typeof unscopedPrisma, "ticketCategory">,
  workspaceId: string,
) {
  await tx.ticketCategory.createMany({
    data: defaultTicketCategories.map((category, index) => ({
      description: category.description,
      id: randomUUID(),
      isFallback: category.isFallback,
      key: category.key,
      label: category.label,
      sortOrder: index,
      workspaceId,
    })),
  });
}

export async function createTicketCategory(input: CreateTicketCategoryInput) {
  const key = keyFor(input.label);
  if (await prisma.ticketCategory.findFirst({ where: { key } })) throw new DuplicateCategoryError();
  const last = await prisma.ticketCategory.findFirst({ orderBy: { sortOrder: "desc" } });
  return prisma.ticketCategory.create({
    data: {
      description: input.description,
      id: randomUUID(),
      key,
      label: input.label,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      workspaceId: requireWorkspaceId(),
    },
  });
}

export async function updateTicketCategory(id: string, input: UpdateTicketCategoryInput) {
  const category = await prisma.ticketCategory.findFirst({ where: { id } });
  if (!category) throw new TicketCategoryNotFoundError();
  return prisma.ticketCategory.update({
    data: {
      description: input.description,
      label: input.label,
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    },
    where: { id },
  });
}

/** Deleting a category never deletes history: its Tickets move to the fallback category. */
export async function deleteTicketCategory(id: string) {
  const category = await prisma.ticketCategory.findFirst({ where: { id } });
  if (!category) throw new TicketCategoryNotFoundError();
  if (category.isFallback) throw new FallbackCategoryError();
  const fallback = await prisma.ticketCategory.findFirst({ where: { isFallback: true } });
  if (!fallback) throw new FallbackCategoryError();

  await prisma.$transaction([
    prisma.ticket.updateMany({
      data: { category: fallback.key },
      where: { category: category.key },
    }),
    prisma.ticketCategory.delete({ where: { id } }),
  ]);
}

/** Category options handed to the classifier. Reads unscoped because classification runs on the
 * Web Widget path, where the Workspace is known from the Session rather than a signed-in user. */
export async function ticketCategoryOptions(workspaceId: string) {
  const categories = await unscopedPrisma.ticketCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    where: { workspaceId },
  });
  if (categories.length === 0) {
    return defaultTicketCategories.map((category) => ({ ...category }));
  }
  return categories.map((category) => ({
    description: category.description,
    isFallback: category.isFallback,
    key: category.key,
    label: category.label,
  }));
}

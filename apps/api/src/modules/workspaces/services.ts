import { randomBytes, randomUUID } from "node:crypto";
import { unscopedPrisma } from "../../utils/prisma";
import { seedDefaultTicketCategories } from "../ticket-categories/services";
import {
  defaultBotName,
  defaultPrimaryColor,
  defaultWelcomeMessage,
  generateWidgetKey,
} from "../widget-config/utils";

type ProvisioningClient = Pick<
  typeof unscopedPrisma,
  "aiAgent" | "aiSettings" | "channel" | "ticketCategory" | "webWidgetConfig"
>;

/** A new Workspace's operational defaults: its Ticket Categories, AI Agent,
 * and Web Widget Channel. Shared by registration (a Workspace's first
 * Organization) and by creating another Workspace in an existing
 * Organization — neither grants a Trial Grant here, that is the caller's
 * decision. */
export async function provisionWorkspaceDefaults(tx: ProvisioningClient, workspaceId: string) {
  await seedDefaultTicketCategories(tx, workspaceId);

  await tx.aiSettings.create({
    data: { id: randomUUID(), workspaceId },
  });

  const aiAgent = await tx.aiAgent.create({
    data: { id: randomUUID(), workspaceId, name: "AI Agent" },
  });

  const channelId = randomUUID();

  await tx.channel.create({
    data: {
      id: channelId,
      workspaceId,
      aiAgentId: aiAgent.id,
      type: "WEB",
      name: "Web Widget",
    },
  });

  await tx.webWidgetConfig.create({
    data: {
      id: randomUUID(),
      workspaceId,
      channelId,
      widgetKey: generateWidgetKey(),
      botName: defaultBotName,
      welcomeMessage: defaultWelcomeMessage,
      primaryColor: defaultPrimaryColor,
      allowedDomains: [],
    },
  });
}

export function listOrganizationWorkspaces(
  organizationId: string,
  userId?: string,
  isOrganizationAdmin = true,
) {
  return unscopedPrisma.workspace.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(isOrganizationAdmin ? {} : { memberships: { some: { userId } } }),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

function workspaceSlugFor(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `${base || "workspace"}-${suffix}`;
}

/** Creates another Workspace in an existing Organization. No Trial Grant —
 * every Workspace in an Organization shares its one Credit Ledger (ADR-0026). */
export async function createOrganizationWorkspace(organizationId: string, name: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        id: randomUUID(),
        organizationId,
        name,
        slug: workspaceSlugFor(name),
      },
    });

    await provisionWorkspaceDefaults(tx, workspace.id);

    return workspace;
  });
}

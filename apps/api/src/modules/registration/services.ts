import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma, unscopedPrisma } from "../../utils/prisma";
import {
  defaultBotName,
  defaultPrimaryColor,
  defaultWelcomeMessage,
  generateWidgetKey,
} from "../widget-config/utils";
import type { RegisterInput } from "./schema";

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyInUseError";
  }
}

export async function registerAdminWorkspace(input: RegisterInput) {
  const existingUser = await unscopedPrisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new EmailAlreadyInUseError();
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    return await unscopedPrisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          id: randomUUID(),
          name: workspaceNameFor(input.name),
          slug: workspaceSlugFor(input.name),
        },
      });

      const userId = randomUUID();

      await tx.aiSettings.create({
        data: { id: randomUUID(), workspaceId: workspace.id },
      });

      const user = await tx.user.create({
        data: {
          id: userId,
          name: input.name,
          email: input.email,
          role: "ADMIN",
          workspaceId: workspace.id,
        },
      });

      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      });

      const aiAgent = await tx.aiAgent.create({
        data: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "AI Agent",
        },
      });

      const tools = await Promise.all(
        [
          ["searchKnowledge", "Search published Customer-Safe Knowledge Sources."],
          [
            "searchCustomerTicketHistory",
            "Search resolved Tickets for the same Customer Identity and Channel.",
          ],
        ].map(([name, description]) =>
          tx.tool.create({
            data: {
              description,
              id: randomUUID(),
              inputSchema: { type: "object" },
              name,
              origin: "BUILT_IN",
              risk: "READ_ONLY",
              workspaceId: workspace.id,
            },
          }),
        ),
      );

      await tx.toolAssignment.createMany({
        data: tools.map((tool) => ({
          aiAgentId: aiAgent.id,
          id: randomUUID(),
          toolId: tool.id,
          workspaceId: workspace.id,
        })),
      });

      const channelId = randomUUID();

      await tx.channel.create({
        data: {
          id: channelId,
          workspaceId: workspace.id,
          aiAgentId: aiAgent.id,
          type: "WEB",
          name: "Web Widget",
        },
      });

      await tx.webWidgetConfig.create({
        data: {
          id: randomUUID(),
          workspaceId: workspace.id,
          channelId,
          widgetKey: generateWidgetKey(),
          botName: defaultBotName,
          welcomeMessage: defaultWelcomeMessage,
          primaryColor: defaultPrimaryColor,
          allowedDomains: [],
        },
      });

      return { user, workspace };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error, "email")) {
      throw new EmailAlreadyInUseError();
    }

    throw error;
  }
}

function workspaceNameFor(adminName: string) {
  return `${adminName}'s Workspace`;
}

function workspaceSlugFor(adminName: string) {
  const base = adminName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `${base || "workspace"}-${suffix}`;
}

function isUniqueConstraintViolation(error: unknown, field: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta?.target as string[] | undefined)?.includes(field)
  );
}

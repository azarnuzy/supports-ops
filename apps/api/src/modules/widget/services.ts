import { randomBytes, randomUUID } from "node:crypto";
import { unscopedPrisma } from "../../utils/prisma";
import { enqueueSessionEmail } from "./session-email";
import type { CustomerMessageInput, PreChatInput } from "./schema";

export type PublicWidgetConfig = {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
};

export class WidgetNotFoundError extends Error {}
export class UnapprovedWidgetOriginError extends Error {}

export async function getApprovedWidget(widgetKey: string, origin: string) {
  const config = await unscopedPrisma.webWidgetConfig.findUnique({
    where: { widgetKey },
    select: {
      allowedDomains: true,
      botName: true,
      channelId: true,
      primaryColor: true,
      welcomeMessage: true,
      workspaceId: true,
    },
  });

  if (!config) throw new WidgetNotFoundError();
  if (!isAllowedOrigin(origin, config.allowedDomains)) throw new UnapprovedWidgetOriginError();

  return config;
}

export async function createWebSession(input: PreChatInput, origin: string) {
  const config = await getApprovedWidget(input.widgetKey, origin);
  const accessToken = randomBytes(32).toString("base64url");

  const session = await unscopedPrisma.$transaction(async (tx) => {
    const customerIdentity = await tx.customerIdentity.create({
      data: {
        channelType: "WEB",
        email: input.email,
        id: randomUUID(),
        name: input.name,
        workspaceId: config.workspaceId,
      },
    });

    return tx.webSession.create({
      data: {
        accessToken,
        channelId: config.channelId,
        customerIdentityId: customerIdentity.id,
        id: randomUUID(),
        workspaceId: config.workspaceId,
      },
      select: { accessToken: true, id: true, status: true },
    });
  });

  const sessionLink = new URL(
    process.env.SESSION_LINK_BASE_URL ?? "http://localhost:8000/widget/session",
  );
  sessionLink.searchParams.set("token", session.accessToken);

  void enqueueSessionEmail({
    customerName: input.name,
    email: input.email,
    sessionLink: sessionLink.toString(),
  }).catch(() => undefined);

  return session;
}

export async function getWebSession(accessToken: string) {
  return unscopedPrisma.webSession.findUnique({
    where: { accessToken },
    select: {
      accessToken: true,
      createdAt: true,
      status: true,
      customerIdentity: { select: { name: true } },
      channel: { select: { webWidgetConfig: { select: { botName: true, primaryColor: true, welcomeMessage: true } } } },
    },
  });
}

export async function createCustomerMessage(accessToken: string, input: CustomerMessageInput) {
  const result = await unscopedPrisma.$transaction(async (tx) => {
    const session = await tx.webSession.findUnique({
      where: { accessToken },
      include: { ticket: { include: { conversation: true } } },
    });
    if (!session || session.status !== "ACTIVE") return null;

    const existing = await tx.message.findUnique({
      where: { workspaceId_externalMessageId: { externalMessageId: input.idempotencyKey, workspaceId: session.workspaceId } },
    });
    if (existing) return { created: false, message: existing };

    let ticket = session.ticket;
    let conversation = ticket?.conversation;
    if (!ticket) {
      const ticketId = randomUUID();
      ticket = await tx.ticket.create({
        data: {
          channelId: session.channelId,
          customerIdentityId: session.customerIdentityId,
          id: ticketId,
          messageSeq: 1,
          title: input.content.slice(0, 120),
          webSessionId: session.id,
          workspaceId: session.workspaceId,
        },
      });
      conversation = await tx.conversation.create({
        data: {
          id: randomUUID(), metadata: {}, scopeKey: `ticket:${ticketId}`, sessionId: ticketId,
          ticketId, userId: session.customerIdentityId, workspaceId: session.workspaceId,
        },
      });
    } else {
      ticket = await tx.ticket.update({
        where: { id: ticket.id }, data: { messageSeq: { increment: 1 } },
      });
    }

    const message = await tx.message.create({
      data: {
        content: input.content, externalMessageId: input.idempotencyKey, id: randomUUID(),
        memorySessionId: conversation!.id, message: { content: input.content }, position: ticket.messageSeq,
        role: "user", runId: randomUUID(), senderType: "CUSTOMER", ticketId: ticket.id,
        turn: ticket.messageSeq, workspaceId: session.workspaceId,
      },
    });
    return { created: true, message };
  });
  return result;
}

export async function getMessagesAfter(accessToken: string, afterPosition: number) {
  const session = await unscopedPrisma.webSession.findUnique({
    where: { accessToken }, select: { ticket: { select: { id: true } } },
  });
  if (!session?.ticket) return null;
  const messages = await unscopedPrisma.message.findMany({
    where: { deletedAt: null, ticketId: session.ticket.id, position: { gt: afterPosition } }, orderBy: { position: "asc" },
  });
  return { messages, ticketId: session.ticket.id };
}

export function toPublicWidgetConfig(config: PublicWidgetConfig): PublicWidgetConfig {
  return {
    botName: config.botName,
    primaryColor: config.primaryColor,
    welcomeMessage: config.welcomeMessage,
  };
}

function isAllowedOrigin(origin: string, allowedDomains: string[]) {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && allowedDomains.includes(url.host);
  } catch {
    return false;
  }
}

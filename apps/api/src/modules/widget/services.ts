import { randomBytes, randomUUID } from "node:crypto";
import { webAttachmentCapability } from "@repo/channels";
import {
  ClassificationFailedError,
  classifyMessage,
  createClassificationModel,
} from "@repo/ai-agent";
import { createBusinessTools } from "@repo/tools";
import { createStorage } from "@repo/storage";
import { apiConfig, classificationConfig, storageConfig } from "../../config";
import { isUniqueConstraintError, type Message, unscopedPrisma } from "../../utils/prisma";
import { claimMessageSlot } from "../../utils/session-messages";
import { generateAiReply } from "../ai-agent/turn";
import { enqueueSessionEmail } from "./session-email";
import type { CustomerMessageInput, PreChatInput } from "./schema";
import { enqueueAttachmentProcess } from "./attachment-queue";
import { resetTimersAfterCustomerMessage } from "../follow-up/queue";
import { ticketCategoryOptions } from "../ticket-categories/services";

export type PublicWidgetConfig = {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
  logoUrl: string | null;
};

export class WidgetNotFoundError extends Error {}
export class UnapprovedWidgetOriginError extends Error {}

export class ClassificationNotConfiguredError extends Error {
  constructor() {
    super("Configure OPENROUTER_API_KEY to classify Tickets.");
    this.name = "ClassificationNotConfiguredError";
  }
}

export { ClassificationFailedError };

export class ReplyNotConfiguredError extends Error {
  constructor() {
    super("Configure OPENROUTER_API_KEY to generate AI Agent replies.");
    this.name = "ReplyNotConfiguredError";
  }
}

export class InvalidAttachmentError extends Error {}

export type CreateCustomerMessageResult =
  | { kind: "message"; created: boolean; message: Message }
  | { kind: "reply"; reply: string };

export function customerRequestedHuman(content: string) {
  return /\b(?:human|real (?:person|agent)|live (?:agent|person)|customer service|representative|(?:speak|talk) (?:to|with) (?:a )?(?:human|person|someone|agent)|connect (?:me )?to (?:a )?(?:human|person|agent)|(?:bicara|ngobrol) (?:dengan|sama) (?:human|manusia|orang|cs|customer service)|hubungkan (?:saya|aku) (?:ke|dengan) (?:human|manusia|orang|cs|customer service)|orangnya|cs)\b/i.test(
    content,
  );
}

export async function getApprovedWidget(widgetKey: string, origin: string) {
  const config = await unscopedPrisma.webWidgetConfig.findUnique({
    where: { widgetKey },
    select: {
      allowedDomains: true,
      botName: true,
      channelId: true,
      logoKey: true,
      primaryColor: true,
      welcomeMessage: true,
      workspaceId: true,
    },
  });

  if (!config) throw new WidgetNotFoundError();
  if (!isAllowedOrigin(origin, config.allowedDomains)) throw new UnapprovedWidgetOriginError();

  return config;
}

export async function createSession(input: PreChatInput, origin: string) {
  const config = await getApprovedWidget(input.widgetKey, origin);
  const accessToken = randomBytes(32).toString("base64url");
  const businessTools = createBusinessTools(apiConfig.businessSystemUrl);
  const customer = await businessTools.getCustomerByEmail(input.email).catch(() => null);

  const session = await unscopedPrisma.$transaction(async (tx) => {
    // One Customer Identity per Workspace and Channel, keyed on the email the
    // Web Widget always has. A returning Customer gets the same identity.
    const customerIdentity = await tx.customerIdentity.upsert({
      create: {
        canonicalId: input.email.toLowerCase(),
        channelType: "WEB",
        email: input.email,
        externalCustomerId: customer?.id,
        id: randomUUID(),
        name: input.name,
        workspaceId: config.workspaceId,
      },
      update: { email: input.email, externalCustomerId: customer?.id, name: input.name },
      where: {
        workspaceId_channelType_canonicalId: {
          canonicalId: input.email.toLowerCase(),
          channelType: "WEB",
          workspaceId: config.workspaceId,
        },
      },
    });

    const sessionId = randomUUID();
    const created = await tx.session.create({
      data: {
        accessToken,
        channelId: config.channelId,
        customerIdentityId: customerIdentity.id,
        id: sessionId,
        workspaceId: config.workspaceId,
      },
      select: { accessToken: true, id: true, status: true },
    });
    // Agent Memory opens with the Session, so the AI Agent sees the
    // conversation from its first turn. See ADR-0017.
    await tx.conversation.create({
      data: {
        id: randomUUID(),
        metadata: {},
        scopeKey: `session:${sessionId}`,
        sessionId,
        userId: customerIdentity.id,
        workspaceId: config.workspaceId,
      },
    });
    return created;
  });

  const sessionLink = new URL(
    process.env.SESSION_LINK_BASE_URL ?? "http://localhost:8000/widget/session",
  );
  // The Web Widget always issues a token; other Channels leave it null.
  sessionLink.searchParams.set("token", accessToken);

  void enqueueSessionEmail({
    customerName: input.name,
    email: input.email,
    sessionLink: sessionLink.toString(),
  }).catch(() => undefined);

  return session;
}

export async function getSession(accessToken: string) {
  return unscopedPrisma.session.findUnique({
    where: { accessToken },
    select: {
      accessToken: true,
      createdAt: true,
      status: true,
      customerIdentity: { select: { name: true } },
      channel: {
        select: {
          webWidgetConfig: { select: { botName: true, primaryColor: true, welcomeMessage: true } },
        },
      },
    },
  });
}

export async function createCustomerMessage(
  accessToken: string,
  input: CustomerMessageInput,
): Promise<CreateCustomerMessageResult | null> {
  const session = await unscopedPrisma.session.findUnique({
    where: { accessToken },
    include: { ticket: true },
  });
  if (session?.status !== "ACTIVE") return null;

  if (session.ticket) {
    const message = await appendMessage(session, input);
    if (message.created)
      void resetTimersAfterCustomerMessage(session.ticket.id, session.workspaceId).catch(
        () => undefined,
      );
    return { created: message.created, kind: "message", message: message.message };
  }

  const apiKey = classificationConfig.apiKey;
  if (!apiKey) throw new ClassificationNotConfiguredError();

  const model = createClassificationModel({ ...classificationConfig, apiKey });
  const decision = await classifyMessage({
    categories: await ticketCategoryOptions(session.workspaceId),
    content: input.content,
    history: await sessionHistory(session.id),
    model,
  });

  if (!decision.qualifies) {
    const reply = await persistSessionExchange(
      session.id,
      session.workspaceId,
      input,
      decision.reply,
    );
    return { kind: "reply", reply };
  }

  try {
    const message = await createTicketAndFirstMessage(session.id, decision, input);
    return { created: true, kind: "message", message };
  } catch (error) {
    // Two concurrent first messages on the same Session race to create the
    // Ticket; sessionId is unique, so the loser appends to whichever Ticket
    // won instead of surfacing a spurious failure.
    if (isUniqueConstraintError(error, "sessionId")) {
      const winner = await unscopedPrisma.session.findUniqueOrThrow({
        where: { accessToken },
        include: { ticket: true },
      });
      if (!winner.ticket) throw error;
      const message = await appendMessage(winner, input);
      return { created: message.created, kind: "message", message: message.message };
    }
    throw error;
  }
}

/** What has already been said on this Session, in order. Classification reads
 * it so an opening greeting the AI Agent itself answered is part of the
 * decision, and the Ticket is titled after the real problem. */
async function sessionHistory(sessionId: string) {
  const messages = await unscopedPrisma.message.findMany({
    orderBy: { position: "asc" },
    select: { content: true, senderType: true },
    where: { deletedAt: null, sessionId },
  });
  return messages.map((message) => ({
    content: message.content,
    role: message.senderType === "CUSTOMER" ? ("customer" as const) : ("agent" as const),
  }));
}

export async function createCustomerAttachments(
  accessToken: string,
  input: { content?: string; files: File[] },
) {
  if (
    !input.files.length ||
    input.files.length > webAttachmentCapability.maxFilesPerMessage ||
    input.files.some((file) => !webAttachmentCapability.mimeTypes.includes(file.type))
  ) {
    throw new InvalidAttachmentError("Attach a PDF, plain text, JPEG, or PNG file.");
  }
  if (
    input.files.some(
      (file) => file.size === 0 || file.size > webAttachmentCapability.maxFileSizeBytes,
    )
  ) {
    throw new InvalidAttachmentError("Attachment must be between 1 byte and 10 MB.");
  }

  const content = input.content?.trim() ?? "";
  const session = await unscopedPrisma.session.findUnique({
    where: { accessToken },
    include: { ticket: true },
  });
  if (session?.status !== "ACTIVE") return null;
  const uploads = await Promise.all(
    input.files.map(async (file) => {
      const id = randomUUID();
      const storageKey = `attachments/inbound/${id}`;
      await createStorage(storageConfig).putObject({
        body: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        key: storageKey,
      });
      return { file, id, storageKey };
    }),
  );
  const messageInput = { content, idempotencyKey: randomUUID() };
  const result = session.ticket
    ? {
        created: true as const,
        kind: "message" as const,
        message: (await appendMessage(session, messageInput)).message,
      }
    : {
        created: true as const,
        kind: "message" as const,
        message: await createTicketAndFirstMessage(
          session.id,
          {
            category: "GENERAL",
            priority: "NORMAL",
            qualifies: true,
            title: input.files
              .map((file) => file.name)
              .join(", ")
              .slice(0, 120),
          },
          messageInput,
        ),
      };
  if (!result) return null;
  const ticketId = result.message.ticketId;
  if (!ticketId) return null;

  void resetTimersAfterCustomerMessage(ticketId, result.message.workspaceId).catch(() => undefined);

  const attachments = await Promise.all(
    uploads.map(({ file, id, storageKey }) =>
      unscopedPrisma.attachment.create({
        data: {
          fileName: file.name,
          id,
          messageId: result.message.id,
          mimeType: file.type,
          sizeBytes: file.size,
          storageKey,
          ticketId,
          workspaceId: result.message.workspaceId,
        },
      }),
    ),
  );
  await Promise.all(
    attachments.map((attachment) =>
      enqueueAttachmentProcess({
        attachmentId: attachment.id,
        ticketId,
        workspaceId: attachment.workspaceId,
      }),
    ),
  );
  return { attachments, message: result.message };
}

export async function generateAttachmentReply(ticketId: string, workspaceId: string) {
  const message = await unscopedPrisma.message.findFirst({
    include: { attachments: true },
    orderBy: { position: "desc" },
    where: { attachments: { some: {} }, senderType: "CUSTOMER", ticketId, workspaceId },
  });
  if (!message) return;
  const readable = message.attachments.filter(
    (attachment) => attachment.processingStatus === "READY" && attachment.extractedText,
  );
  const failed = message.attachments.filter(
    (attachment) => attachment.processingStatus === "FAILED",
  );
  const context = [message.content, ...readable.map((attachment) => attachment.extractedText)]
    .filter(Boolean)
    .join("\n\n");

  const isTicketOpener = !(await unscopedPrisma.message.count({
    where: { position: { lt: message.position }, ticketId },
  }));
  if (isTicketOpener && context) {
    const apiKey = classificationConfig.apiKey;
    if (apiKey) {
      try {
        const decision = await classifyMessage({
          categories: await ticketCategoryOptions(workspaceId),
          content: context,
          model: createClassificationModel({ ...classificationConfig, apiKey }),
        });
        if (decision.qualifies) {
          await unscopedPrisma.ticket.update({
            data: {
              category: decision.category,
              priority: decision.priority,
              title: decision.title,
            },
            where: { id: ticketId },
          });
        }
      } catch (error) {
        if (!(error instanceof ClassificationFailedError)) throw error;
      }
    }
  }

  const failureNote = failed.length
    ? `\n\nThe following attachments could not be read: ${failed.map((attachment) => attachment.fileName).join(", ")}. Tell the Customer which files could not be read.`
    : "";
  await generateAiReply(
    ticketId,
    workspaceId,
    `${context || "The Customer sent attachments without a caption."}${failureNote}`,
  );
}

async function appendMessage(
  session: { id: string; ticket: { id: string } | null; workspaceId: string },
  input: CustomerMessageInput,
) {
  const workspaceId = session.workspaceId;
  return unscopedPrisma.$transaction(async (tx) => {
    const existing = await tx.message.findUnique({
      where: {
        workspaceId_externalMessageId: { externalMessageId: input.idempotencyKey, workspaceId },
      },
    });
    if (existing) return { created: false, message: existing };

    const slot = await claimMessageSlot(tx, session.id, { fromCustomer: true });
    const message = await tx.message.create({
      data: {
        ...slot,
        content: input.content,
        externalMessageId: input.idempotencyKey,
        message: { content: input.content },
        role: "user",
        senderType: "CUSTOMER",
        ticketId: session.ticket?.id ?? null,
        workspaceId,
      },
    });
    return { created: true, message };
  });
}

/** An exchange that qualified for no Ticket is still part of the conversation:
 * both turns are written to the Session's Agent Memory, in order, so the next
 * message is classified with them in view. Returns the reply that was stored,
 * which is the earlier one when this message is a duplicate. */
async function persistSessionExchange(
  sessionId: string,
  workspaceId: string,
  input: CustomerMessageInput,
  reply: string,
) {
  return unscopedPrisma.$transaction(async (tx) => {
    const existing = await tx.message.findUnique({
      where: {
        workspaceId_externalMessageId: { externalMessageId: input.idempotencyKey, workspaceId },
      },
    });
    if (existing) {
      const storedReply = await tx.message.findFirst({
        orderBy: { position: "asc" },
        where: { position: { gt: existing.position }, sessionId },
      });
      return storedReply?.content ?? reply;
    }

    await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, sessionId, { fromCustomer: true })),
        content: input.content,
        externalMessageId: input.idempotencyKey,
        message: { content: input.content },
        role: "user",
        senderType: "CUSTOMER",
        workspaceId,
      },
    });
    await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, sessionId)),
        content: reply,
        externalMessageId: `greeting:${randomUUID()}`,
        message: { content: reply },
        role: "assistant",
        senderType: "AI_AGENT",
        workspaceId,
      },
    });

    // A concurrent qualifying message may have created the Ticket while this
    // exchange was being classified; adopt it so it joins that Ticket's history.
    const winner = await tx.session.findUnique({
      select: { ticket: { select: { id: true } } },
      where: { id: sessionId },
    });
    if (winner?.ticket) {
      await tx.message.updateMany({
        data: { ticketId: winner.ticket.id },
        where: { sessionId, ticketId: null },
      });
    }
    return reply;
  });
}

async function createTicketAndFirstMessage(
  sessionId: string,
  decision: Extract<Awaited<ReturnType<typeof classifyMessage>>, { qualifies: true }>,
  input: CustomerMessageInput,
) {
  return unscopedPrisma.$transaction(async (tx) => {
    const session = await tx.session.findUniqueOrThrow({
      include: { channel: { select: { aiAgentId: true } } },
      where: { id: sessionId },
    });
    const ticketId = randomUUID();
    const ticket = await tx.ticket.create({
      data: {
        category: decision.category,
        aiAgentId: session.channel.aiAgentId,
        channelId: session.channelId,
        customerIdentityId: session.customerIdentityId,
        id: ticketId,
        priority: decision.priority,
        sessionId,
        title: decision.title,
        workspaceId: session.workspaceId,
      },
    });

    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, sessionId, { fromCustomer: true })),
        content: input.content,
        externalMessageId: input.idempotencyKey,
        message: { content: input.content },
        role: "user",
        senderType: "CUSTOMER",
        ticketId: ticket.id,
        workspaceId: session.workspaceId,
      },
    });

    // The turns that came before this Ticket are part of its history: the
    // Human Agent's transcript and Ticket Knowledge both read by Ticket.
    await tx.message.updateMany({
      data: { ticketId },
      where: { sessionId, ticketId: null },
    });

    await tx.aiActivity.createMany({
      data: [
        {
          eventType: "TICKET_CREATED",
          id: randomUUID(),
          metadata: {
            category: decision.category,
            priority: decision.priority,
            title: decision.title,
          },
          ticketId: ticket.id,
          workspaceId: session.workspaceId,
        },
        {
          eventType: "CLASSIFIED",
          id: randomUUID(),
          metadata: {
            category: decision.category,
            isSupportRequest: true,
            priority: decision.priority,
            title: decision.title,
          },
          ticketId: ticket.id,
          workspaceId: session.workspaceId,
        },
      ],
    });

    return message;
  });
}

/** Read by Session, never by Ticket: reading by Ticket drops the opening
 * exchange, which is the bug ADR-0017 exists to remove. */
export async function getMessagesAfter(accessToken: string, afterPosition: number | null) {
  const session = await unscopedPrisma.session.findUnique({
    where: { accessToken },
    select: { id: true, status: true, ticket: { select: { id: true, status: true } } },
  });
  if (!session) return null;

  const messages = await unscopedPrisma.message.findMany({
    include: {
      attachments: {
        select: {
          fileName: true,
          id: true,
          mimeType: true,
          processingStatus: true,
          sizeBytes: true,
        },
      },
    },
    orderBy: { position: "asc" },
    where: {
      deletedAt: null,
      sessionId: session.id,
      ...(afterPosition !== null ? { position: { gt: afterPosition } } : {}),
    },
  });
  return {
    messages,
    sessionStatus: session.status,
    ticketId: session.ticket?.id ?? null,
    ticketStatus: session.ticket?.status ?? null,
  };
}

export function toPublicWidgetConfig(config: {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
  logoKey: string | null;
}): PublicWidgetConfig {
  return {
    botName: config.botName,
    primaryColor: config.primaryColor,
    welcomeMessage: config.welcomeMessage,
    logoUrl: config.logoKey ? createStorage(storageConfig).getObjectUrl(config.logoKey) : null,
  };
}

function isAllowedOrigin(origin: string, allowedDomains: string[]) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && allowedDomains.includes(url.host)
    );
  } catch {
    return false;
  }
}

import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { UnrecoverableError } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyMessage: vi.fn(),
  enqueueWhatsAppDelivery: vi.fn(),
  extractAttachment: vi.fn(),
  generateAiReply: vi.fn(),
}));

vi.mock("@repo/ai-agent", () => ({
  classifyMessage: mocks.classifyMessage,
  createClassificationModel: vi.fn(() => ({})),
}));
vi.mock("@repo/api/ai-agent-turn", () => ({ generateAiReply: mocks.generateAiReply }));
vi.mock("@repo/api/secrets", () => ({ decryptToolSecret: vi.fn(() => "access-token") }));
vi.mock("@repo/api/whatsapp-queue", () => ({
  enqueueWhatsAppDelivery: mocks.enqueueWhatsAppDelivery,
}));
vi.mock("./attachment-process", () => ({ extractAttachment: mocks.extractAttachment }));

let database: TestDatabase;
let prisma: typeof import("./prisma").prisma;
let processWhatsAppTurn: typeof import("./whatsapp-turn").processWhatsAppTurn;
let processWhatsAppDelivery: typeof import("./whatsapp-turn").processWhatsAppDelivery;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.TOOL_MASTER_KEY = Buffer.alloc(32).toString("base64");
  ({ prisma } = await import("./prisma"));
  ({ processWhatsAppDelivery, processWhatsAppTurn } = await import("./whatsapp-turn"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  mocks.classifyMessage.mockReset();
  mocks.extractAttachment.mockReset();
  mocks.generateAiReply.mockReset();
  mocks.enqueueWhatsAppDelivery.mockReset();
  vi.unstubAllGlobals();
});

async function seedSession(
  customerMessages: {
    content: string;
    attachment?: { mimeType: string; storageKey: string; failureReason?: string };
  }[],
) {
  const suffix = randomUUID();
  const workspaceId = `workspace-${suffix}`;
  const aiAgentId = `ai-${suffix}`;
  const channelId = `channel-${suffix}`;
  const customerIdentityId = `customer-${suffix}`;
  const sessionId = `session-${suffix}`;
  const memorySessionId = `memory-${suffix}`;

  await prisma.workspace.create({ data: { id: workspaceId, name: "Demo", slug: suffix } });
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "AI Agent", workspaceId } });
  await prisma.channel.create({
    data: {
      aiAgentId,
      id: channelId,
      name: "WhatsApp",
      type: "WHATSAPP",
      workspaceId,
      whatsAppConfig: {
        create: {
          accessTokenEncrypted: "encrypted",
          accessTokenLastFour: "oken",
          appSecretEncrypted: "encrypted",
          businessAccountId: `waba-${suffix}`,
          displayPhoneNumber: "+62 8123",
          id: `config-${suffix}`,
          phoneNumberId: `phone-${suffix}`,
          verifiedAt: new Date(),
          verifyToken: `verify-${suffix}`,
          workspaceId,
        },
      },
    },
  });
  await prisma.customerIdentity.create({
    data: {
      canonicalId: "+628123",
      channelType: "WHATSAPP",
      id: customerIdentityId,
      name: "Ayu",
      phoneE164: "+628123",
      workspaceId,
    },
  });
  await prisma.session.create({
    data: {
      channelId,
      customerIdentityId,
      id: sessionId,
      messageSeq: customerMessages.length,
      workspaceId,
      conversation: {
        create: {
          id: memorySessionId,
          metadata: {},
          scopeKey: `session:${sessionId}`,
          userId: customerIdentityId,
          workspaceId,
        },
      },
    },
  });
  for (const [index, { attachment, content }] of customerMessages.entries()) {
    await prisma.message.create({
      data: {
        ...(attachment
          ? {
              attachments: {
                create: {
                  failureReason: attachment.failureReason ?? null,
                  fileName: "voice-note.ogg",
                  id: randomUUID(),
                  mimeType: attachment.mimeType,
                  processingStatus: attachment.failureReason ? "FAILED" : "PROCESSING",
                  sizeBytes: 1_000,
                  storageKey: attachment.storageKey,
                  workspaceId,
                },
              },
            }
          : {}),
        content,
        externalMessageId: `wamid-${index}`,
        id: randomUUID(),
        memorySessionId,
        message: { content },
        position: index + 1,
        role: "user",
        runId: randomUUID(),
        senderType: "CUSTOMER",
        sessionId,
        turn: index + 1,
        workspaceId,
      },
    });
  }
  return { channelId, customerIdentityId, memorySessionId, sessionId, workspaceId };
}

describe("WhatsApp turn worker", () => {
  it("collapses consecutive bubbles into one Ticket and one AI Agent turn", async () => {
    const { sessionId, workspaceId } = await seedSession([
      { content: "Tagihan saya" },
      { content: "belum masuk" },
    ]);
    mocks.classifyMessage.mockResolvedValue({
      category: "GENERAL",
      priority: "NORMAL",
      qualifies: true,
      title: "Tagihan belum masuk",
    });
    mocks.generateAiReply.mockResolvedValue(undefined);

    await processWhatsAppTurn({ data: { sessionId, workspaceId } });

    const ticket = await prisma.ticket.findUniqueOrThrow({
      include: { messages: { orderBy: { position: "asc" } } },
      where: { sessionId },
    });
    expect(ticket.messages).toHaveLength(2);
    expect(mocks.generateAiReply).toHaveBeenCalledOnce();
    expect(mocks.generateAiReply).toHaveBeenCalledWith(
      ticket.id,
      workspaceId,
      "Tagihan saya\nbelum masuk",
    );
  });

  it("answers a voice note from its transcript without rewriting the Customer's Message", async () => {
    const { sessionId, workspaceId } = await seedSession([
      {
        attachment: { mimeType: "audio/ogg", storageKey: "attachments/inbound/voice" },
        content: "",
      },
    ]);
    mocks.extractAttachment.mockResolvedValue("My invoice was charged twice");
    mocks.classifyMessage.mockResolvedValue({
      category: "GENERAL",
      priority: "NORMAL",
      qualifies: true,
      title: "Double charge",
    });
    mocks.generateAiReply.mockResolvedValue(undefined);

    await processWhatsAppTurn({ data: { sessionId, workspaceId } });

    const ticket = await prisma.ticket.findUniqueOrThrow({
      include: { attachments: true, messages: true },
      where: { sessionId },
    });
    expect(ticket.messages[0].content).toBe("");
    expect(ticket.attachments[0]).toMatchObject({
      extractedText: "My invoice was charged twice",
      processingStatus: "READY",
    });
    expect(mocks.generateAiReply).toHaveBeenCalledWith(
      ticket.id,
      workspaceId,
      expect.stringMatching(/Automatic transcript of a voice note[\s\S]*charged twice/),
    );
  });

  it("tells the Customer why a refused file was not received", async () => {
    const { sessionId, workspaceId } = await seedSession([
      {
        attachment: {
          failureReason: "Sorry, this file is larger than 16 MB, so we couldn't receive it.",
          mimeType: "audio/ogg",
          storageKey: "",
        },
        content: "",
      },
    ]);
    await processWhatsAppTurn({ data: { sessionId, workspaceId } });

    const reply = await prisma.message.findFirstOrThrow({
      where: { senderType: { not: "CUSTOMER" }, sessionId },
    });
    expect(reply).toMatchObject({
      content: "Sorry, this file is larger than 16 MB, so we couldn't receive it.",
      deliveryStatus: "PENDING",
    });
    expect(mocks.enqueueWhatsAppDelivery).toHaveBeenCalledWith(reply.id);
    expect(mocks.classifyMessage).not.toHaveBeenCalled();
    expect(mocks.generateAiReply).not.toHaveBeenCalled();
  });

  it("never lets the AI Agent speak on an escalated Ticket", async () => {
    const ids = await seed();
    await createTicket(ids, "ESCALATED");
    const pending = await addOutbound(ids, 3, "HUMAN_AGENT");

    await processWhatsAppTurn({ data: ids });

    expect(mocks.generateAiReply).not.toHaveBeenCalled();
    expect(mocks.enqueueWhatsAppDelivery).toHaveBeenCalledWith(pending.id);
  });

  it("starts a new Ticket when a Customer returns after their previous Session closed", async () => {
    const ids = await seedSession([{ content: "Yes" }]);
    const previousSessionId = `previous-${randomUUID()}`;
    await prisma.session.create({
      data: {
        channelId: ids.channelId,
        closedAt: new Date(),
        customerIdentityId: ids.customerIdentityId,
        id: previousSessionId,
        status: "CLOSED",
        workspaceId: ids.workspaceId,
        conversation: {
          create: {
            id: randomUUID(),
            metadata: {},
            scopeKey: `session:${previousSessionId}`,
            userId: ids.customerIdentityId,
            workspaceId: ids.workspaceId,
          },
        },
        ticket: {
          create: {
            aiAgentId: `ai-${ids.workspaceId.slice("workspace-".length)}`,
            category: "GENERAL",
            channelId: ids.channelId,
            customerIdentityId: ids.customerIdentityId,
            id: randomUUID(),
            status: "RESOLVED",
            title: "Previous problem",
            workspaceId: ids.workspaceId,
          },
        },
      },
    });
    mocks.classifyMessage.mockResolvedValue({ qualifies: false, reply: "How can I help?" });
    mocks.generateAiReply.mockResolvedValue(undefined);

    await processWhatsAppTurn({ data: ids });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { sessionId: ids.sessionId } });
    expect(ticket.title).toBe("Previous problem");
    expect(mocks.generateAiReply).toHaveBeenCalledWith(ticket.id, ids.workspaceId, "Yes");
  });
});

describe("WhatsApp delivery", () => {
  const job = (messageId: string, attemptsMade = 0) => ({
    attemptsMade,
    data: { messageId },
    opts: { attempts: 6 },
  });

  it("marks the Message sent and clears a stale token failure", async () => {
    const ids = await seed();
    await prisma.whatsAppConfig.updateMany({ data: { accessTokenFailedAt: new Date() } });
    const message = await addOutbound(ids, 3, "HUMAN_AGENT");
    stubMeta(200, { messages: [{ id: "wamid.out" }] });

    await processWhatsAppDelivery(job(message.id));

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored).toMatchObject({ deliveryStatus: "SENT", externalMessageId: "wamid.out" });
    expect((await prisma.whatsAppConfig.findFirstOrThrow()).accessTokenFailedAt).toBeNull();
  });

  it("sends only the invitation template after the Customer Service Window closes", async () => {
    const ids = await seed();
    await prisma.session.update({
      data: { customerLastMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
      where: { id: ids.sessionId },
    });
    const message = await addOutbound(ids, 3, "HUMAN_AGENT");
    stubMeta(200, { messages: [{ id: "wamid.template" }] });

    await processWhatsAppDelivery(job(message.id));

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "628123",
      type: "template",
      template: { language: { code: "en_US" }, name: "supportops_reopen_conversation" },
    });
  });

  it("retries a transient failure and fails visibly once retries run out", async () => {
    const ids = await seed();
    const message = await addOutbound(ids, 3, "HUMAN_AGENT");
    stubMeta(503, { error: { code: 2, message: "Service unavailable" } });

    await expect(processWhatsAppDelivery(job(message.id))).rejects.not.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(
      (await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).deliveryStatus,
    ).toBe("PENDING");

    await expect(processWhatsAppDelivery(job(message.id, 5))).rejects.toThrow();
    expect(await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({
      deliveryFailureReason: "Service unavailable",
      deliveryStatus: "FAILED",
    });
  });

  it("fails a permanent error at once, with its reason, and raises no Escalation", async () => {
    const ids = await seed();
    const ticketId = await createTicket(ids, "HUMAN_HANDLING");
    const message = await addOutbound(ids, 3, "HUMAN_AGENT", ticketId);
    stubMeta(400, { error: { code: 131047, message: "Re-engagement message" } });

    await expect(processWhatsAppDelivery(job(message.id))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({
      deliveryFailureReason: "Re-engagement message",
      deliveryStatus: "FAILED",
    });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status).toBe(
      "HUMAN_HANDLING",
    );
    expect(await prisma.aiActivity.count({ where: { eventType: "ESCALATED" } })).toBe(0);
  });

  it("flags the access token when Meta stops accepting it", async () => {
    const ids = await seed();
    const message = await addOutbound(ids, 3, "HUMAN_AGENT");
    stubMeta(401, { error: { code: 190, message: "Invalid OAuth access token" } });

    await expect(processWhatsAppDelivery(job(message.id))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect((await prisma.whatsAppConfig.findFirstOrThrow()).accessTokenFailedAt).toBeInstanceOf(
      Date,
    );
  });
});

function stubMeta(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

async function createTicket(
  ids: Awaited<ReturnType<typeof seed>>,
  status: "ESCALATED" | "HUMAN_HANDLING",
) {
  const ticket = await prisma.ticket.create({
    data: {
      aiAgentId: `ai-${ids.workspaceId.slice("workspace-".length)}`,
      channelId: ids.channelId,
      customerIdentityId: ids.customerIdentityId,
      id: randomUUID(),
      sessionId: ids.sessionId,
      status,
      title: "Tagihan",
      workspaceId: ids.workspaceId,
    },
  });
  await prisma.message.updateMany({
    data: { ticketId: ticket.id },
    where: { sessionId: ids.sessionId },
  });
  return ticket.id;
}

function addOutbound(
  ids: Awaited<ReturnType<typeof seed>>,
  position: number,
  senderType: "HUMAN_AGENT" | "SYSTEM",
  ticketId?: string,
) {
  return prisma.message.create({
    data: {
      content: "Halo, saya bantu.",
      deliveryStatus: "PENDING",
      externalMessageId: `human:${randomUUID()}`,
      id: randomUUID(),
      memorySessionId: ids.memorySessionId,
      message: { content: "Halo, saya bantu." },
      position,
      role: "assistant",
      runId: randomUUID(),
      senderType,
      sessionId: ids.sessionId,
      ticketId,
      turn: position,
      workspaceId: ids.workspaceId,
    },
  });
}

function seed() {
  return seedSession([{ content: "Tagihan saya" }, { content: "belum masuk" }]);
}

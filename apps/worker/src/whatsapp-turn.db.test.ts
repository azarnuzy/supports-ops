import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyMessage: vi.fn(),
  extractAttachment: vi.fn(),
  generateAiReply: vi.fn(),
}));

vi.mock("@repo/ai-agent", () => ({
  classifyMessage: mocks.classifyMessage,
  createClassificationModel: vi.fn(() => ({})),
}));
vi.mock("@repo/api/ai-agent-turn", () => ({ generateAiReply: mocks.generateAiReply }));
vi.mock("@repo/api/secrets", () => ({ decryptToolSecret: vi.fn(() => "access-token") }));
vi.mock("./attachment-process", () => ({ extractAttachment: mocks.extractAttachment }));

let database: TestDatabase;
let prisma: typeof import("./prisma").prisma;
let processWhatsAppTurn: typeof import("./whatsapp-turn").processWhatsAppTurn;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.TOOL_MASTER_KEY = Buffer.alloc(32).toString("base64");
  ({ prisma } = await import("./prisma"));
  ({ processWhatsAppTurn } = await import("./whatsapp-turn"));
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
  return { sessionId, workspaceId };
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
      { attachment: { mimeType: "audio/ogg", storageKey: "attachments/inbound/voice" }, content: "" },
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
    const fetch = vi.fn(async () => Response.json({ messages: [{ id: "wamid.out" }] }));
    vi.stubGlobal("fetch", fetch);

    await processWhatsAppTurn({ data: { sessionId, workspaceId } });

    const reply = await prisma.message.findFirstOrThrow({
      where: { senderType: { not: "CUSTOMER" }, sessionId },
    });
    expect(reply).toMatchObject({
      content: "Sorry, this file is larger than 16 MB, so we couldn't receive it.",
      deliveryStatus: "SENT",
    });
    expect(mocks.classifyMessage).not.toHaveBeenCalled();
    expect(mocks.generateAiReply).not.toHaveBeenCalled();
  });
});

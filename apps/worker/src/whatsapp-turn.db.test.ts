import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyMessage: vi.fn(),
  generateAiReply: vi.fn(),
}));

vi.mock("@repo/ai-agent", () => ({
  classifyMessage: mocks.classifyMessage,
  createClassificationModel: vi.fn(() => ({})),
}));
vi.mock("@repo/api/ai-agent-turn", () => ({ generateAiReply: mocks.generateAiReply }));
vi.mock("@repo/api/secrets", () => ({ decryptToolSecret: vi.fn(() => "access-token") }));

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
  mocks.generateAiReply.mockReset();
});

describe("WhatsApp turn worker", () => {
  it("collapses consecutive bubbles into one Ticket and one AI Agent turn", async () => {
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
        messageSeq: 2,
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
    await prisma.message.createMany({
      data: ["Tagihan saya", "belum masuk"].map((content, index) => ({
        content,
        externalMessageId: `wamid-${index}`,
        id: randomUUID(),
        memorySessionId,
        message: { content },
        position: index + 1,
        role: "user",
        runId: randomUUID(),
        senderType: "CUSTOMER" as const,
        sessionId,
        turn: index + 1,
        workspaceId,
      })),
    });
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
    expect(mocks.generateAiReply).toHaveBeenCalledWith(ticket.id, workspaceId, "Tagihan saya\nbelum masuk");
  });
});

import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { UnrecoverableError } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classifyMessage: vi.fn(),
  enqueueWhatsAppDelivery: vi.fn(),
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
  mocks.generateAiReply.mockReset();
  mocks.enqueueWhatsAppDelivery.mockReset();
  vi.unstubAllGlobals();
});

describe("WhatsApp turn worker", () => {
  it("collapses consecutive bubbles into one Ticket and one AI Agent turn", async () => {
    const { sessionId, workspaceId } = await seed();
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

  it("never lets the AI Agent speak on an escalated Ticket", async () => {
    const ids = await seed();
    await createTicket(ids, "ESCALATED");
    const pending = await addOutbound(ids, 3, "HUMAN_AGENT");

    await processWhatsAppTurn({ data: ids });

    expect(mocks.generateAiReply).not.toHaveBeenCalled();
    expect(mocks.enqueueWhatsAppDelivery).toHaveBeenCalledWith(pending.id);
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

async function seed() {
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
  return { channelId, customerIdentityId, memorySessionId, sessionId, workspaceId };
}


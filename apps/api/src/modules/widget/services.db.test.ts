import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The seam this covers is "a Customer message arrived on a Session". Everything
 * below the seam is real: the migrated schema, the Session's Message counter,
 * the Agent Memory a Session opens with, and the uniqueness rules the database
 * enforces. Only the model call and the queues around it are faked.
 */
const mocks = vi.hoisted(() => ({
  classifyMessage: vi.fn(),
  enqueueSessionEmail: vi.fn(async () => undefined),
}));

vi.mock("@repo/ai-agent", () => ({
  ClassificationFailedError: class ClassificationFailedError extends Error {},
  classifyMessage: mocks.classifyMessage,
  createClassificationModel: () => ({ id: "fake-model" }),
}));

vi.mock("@repo/tools", () => ({
  createBusinessTools: () => ({ getCustomerByEmail: async () => null }),
}));

vi.mock("./session-email", () => ({ enqueueSessionEmail: mocks.enqueueSessionEmail }));

vi.mock("./realtime", () => ({
  isTicketGenerating: () => false,
  publishTicketQueueEvent: vi.fn(),
  publishWidgetEvent: vi.fn(),
  setTicketGenerating: vi.fn(),
}));

vi.mock("../follow-up/queue", () => ({
  cancelFollowUpTimers: vi.fn(),
  scheduleFollowUp: vi.fn(),
}));

vi.mock("../tickets/queue", () => ({ enqueueTicketKnowledgeIndex: vi.fn() }));

// Only the model keys are faked; databaseConfig still points at the throwaway
// database this file creates.
vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  aiAgentConfig: { apiKey: "", baseUrl: "", modelId: "m" },
  classificationConfig: { apiKey: "sk-test", baseUrl: "", modelId: "m" },
  embeddingConfig: { apiKey: "", baseUrl: "", modelId: "m" },
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let services: typeof import("./services");

const widgetKey = "widget-key-1";
const origin = "https://shop.example.com";

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  services = await import("./services");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  mocks.classifyMessage.mockReset();
  const workspaceId = randomUUID();
  await prisma.workspace.create({
    data: { id: workspaceId, name: "Demo", slug: `demo-${workspaceId.slice(0, 8)}` },
  });
  const aiAgentId = randomUUID();
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "Agent", workspaceId } });
  const channelId = randomUUID();
  await prisma.channel.create({
    data: { aiAgentId, id: channelId, name: "Web", type: "WEB", workspaceId },
  });
  await prisma.webWidgetConfig.create({
    data: {
      allowedDomains: ["shop.example.com"],
      botName: "Bot",
      channelId,
      id: randomUUID(),
      primaryColor: "#000000",
      welcomeMessage: "Hi",
      widgetKey,
      workspaceId,
    },
  });
});

async function openSession(email = "budi@example.com") {
  const session = await services.createSession({ email, name: "Budi", widgetKey }, origin);
  if (!session.accessToken) throw new Error("The Web Widget always issues an access token.");
  return { ...session, accessToken: session.accessToken };
}

function greeting(reply: string) {
  mocks.classifyMessage.mockResolvedValueOnce({ qualifies: false, reply });
}

function supportRequest(title: string) {
  mocks.classifyMessage.mockResolvedValueOnce({
    category: "GENERAL",
    priority: "NORMAL",
    qualifies: true,
    title,
  });
}

describe("a Customer message arrived on a Session", () => {
  it("classifies the third message with both earlier turns in view and titles the Ticket from the real problem", async () => {
    const session = await openSession();
    greeting("Hi! What can I help you with?");
    await services.createCustomerMessage(session.accessToken, {
      content: "hello",
      idempotencyKey: "idem-1",
    });

    supportRequest("Invoice charged twice");
    const result = await services.createCustomerMessage(session.accessToken, {
      content: "yes, about the invoice",
      idempotencyKey: "idem-2",
    });

    expect(mocks.classifyMessage.mock.calls[1]?.[0].history).toEqual([
      { content: "hello", role: "customer" },
      { content: "Hi! What can I help you with?", role: "agent" },
    ]);
    expect(result).toMatchObject({ kind: "message" });
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { sessionId: session.id } });
    expect(ticket.title).toBe("Invoice charged twice");
  });

  it("keeps the opening exchange in the transcript, in order, with no gap where the Ticket begins", async () => {
    const session = await openSession();
    greeting("Hi! What can I help you with?");
    await services.createCustomerMessage(session.accessToken, {
      content: "hello",
      idempotencyKey: "idem-1",
    });
    supportRequest("Invoice charged twice");
    await services.createCustomerMessage(session.accessToken, {
      content: "yes, about the invoice",
      idempotencyKey: "idem-2",
    });

    const transcript = await services.getMessagesAfter(session.accessToken, null);
    expect(transcript?.messages.map((message) => [message.position, message.content])).toEqual([
      [1, "hello"],
      [2, "Hi! What can I help you with?"],
      [3, "yes, about the invoice"],
    ]);
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(stored.messageSeq).toBe(3);
  });

  it("gives the AI Agent one memory that opens with the Session and survives the Ticket", async () => {
    const session = await openSession();
    const memory = await prisma.conversation.findUniqueOrThrow({
      where: { sessionId: session.id },
    });

    greeting("Hi!");
    await services.createCustomerMessage(session.accessToken, {
      content: "hello",
      idempotencyKey: "idem-1",
    });
    supportRequest("Invoice charged twice");
    await services.createCustomerMessage(session.accessToken, {
      content: "my invoice is wrong",
      idempotencyKey: "idem-2",
    });

    const messages = await prisma.message.findMany({ where: { sessionId: session.id } });
    expect(messages).toHaveLength(3);
    expect(messages.every((message) => message.memorySessionId === memory.id)).toBe(true);
    expect(await prisma.conversation.count()).toBe(1);
    // Every turn joins the Ticket's history, including the two that predate it.
    expect(messages.every((message) => message.ticketId !== null)).toBe(true);
  });

  it("produces exactly one Ticket when two first messages arrive at once", async () => {
    const session = await openSession();
    supportRequest("Invoice charged twice");
    supportRequest("Invoice charged twice");

    const results = await Promise.all([
      services.createCustomerMessage(session.accessToken, {
        content: "my invoice is wrong",
        idempotencyKey: "idem-1",
      }),
      services.createCustomerMessage(session.accessToken, {
        content: "it charged me twice",
        idempotencyKey: "idem-2",
      }),
    ]);

    expect(await prisma.ticket.count()).toBe(1);
    expect(results.every((result) => result?.kind === "message")).toBe(true);
    const positions = (await prisma.message.findMany({ where: { sessionId: session.id } })).map(
      (message) => message.position,
    );
    expect([...positions].sort()).toEqual([1, 2]);
  });

  it("moves the Customer's clock only when the Customer writes", async () => {
    const session = await openSession();
    greeting("Hi!");
    await services.createCustomerMessage(session.accessToken, {
      content: "hello",
      idempotencyKey: "idem-1",
    });

    const afterCustomer = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    const customerWroteAt = afterCustomer.customerLastMessageAt;
    expect(customerWroteAt).not.toBeNull();

    // The AI Agent's own reply was written in the same exchange and must not
    // have moved the clock past the Customer's message.
    const reply = await prisma.message.findFirstOrThrow({
      where: { senderType: "AI_AGENT", sessionId: session.id },
    });
    expect(customerWroteAt?.getTime()).toBeLessThanOrEqual(reply.createdAt.getTime());
  });

  it("reuses one Customer Identity per Workspace and Channel, and the database refuses a second", async () => {
    const first = await openSession("Budi@example.com");
    const second = await openSession("budi@example.com");

    const sessions = await prisma.session.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(new Set(sessions.map((session) => session.customerIdentityId)).size).toBe(1);
    expect(await prisma.customerIdentity.count()).toBe(1);

    const existing = await prisma.customerIdentity.findFirstOrThrow();
    await expect(
      prisma.customerIdentity.create({
        data: {
          canonicalId: existing.canonicalId,
          channelType: existing.channelType,
          email: existing.email,
          id: randomUUID(),
          name: existing.name,
          workspaceId: existing.workspaceId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("closes the Session and writes the Resolution Message when the AI Agent resolves", async () => {
    const session = await openSession();
    supportRequest("Invoice charged twice");
    await services.createCustomerMessage(session.accessToken, {
      content: "my invoice is wrong",
      idempotencyKey: "idem-1",
    });
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { sessionId: session.id } });

    await services.resolveByAi(ticket.id, ticket.workspaceId);

    const closed = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(closed.status).toBe("CLOSED");
    const closing = await prisma.message.findFirstOrThrow({
      orderBy: { position: "desc" },
      where: { sessionId: session.id },
    });
    expect(closing).toMatchObject({ position: 2, senderType: "SYSTEM", ticketId: ticket.id });
    expect(
      await prisma.aiActivity.count({ where: { eventType: "RESOLVED", ticketId: ticket.id } }),
    ).toBe(1);
  });
});

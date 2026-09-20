import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The seam this covers is "a Human Agent pressed Send". Everything below it is
 * real: the migrated schema, the Session's Message counter, and the uniqueness
 * rules the database enforces. Only the Channel and the queues are faked.
 */
const mocks = vi.hoisted(() => ({
  enqueueWhatsAppDelivery: vi.fn(async () => undefined),
  publishWidgetEvent: vi.fn(async () => undefined),
}));

vi.mock("../widget/realtime", () => ({
  cancelTicketGeneration: vi.fn(),
  publishTicketQueueEvent: vi.fn(async () => undefined),
  publishWidgetEvent: mocks.publishWidgetEvent,
}));

vi.mock("../whatsapp-config/queue", () => ({
  enqueueWhatsAppDelivery: mocks.enqueueWhatsAppDelivery,
}));

vi.mock("../follow-up/queue", () => ({
  cancelFollowUpTimers: vi.fn(async () => undefined),
  scheduleIdleClosureForTicket: vi.fn(async () => undefined),
}));

vi.mock("./queue", () => ({ enqueueTicketKnowledgeIndex: vi.fn(async () => undefined) }));

vi.mock("@repo/ai-agent", () => ({
  createReplyModel: vi.fn(),
  generateEscalationSummary: vi.fn(),
  generateSuggestedReply: vi.fn(),
  SuggestedReplyGenerationFailedError: class extends Error {},
}));

vi.mock("@repo/knowledge", () => ({
  createOpenAiEmbeddingClient: vi.fn(),
  searchChunks: vi.fn(),
}));

vi.mock("@repo/tools", () => ({ createBusinessTools: vi.fn() }));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let services: typeof import("./services");
let ids: { humanAgentId: string; sessionId: string; ticketId: string; workspaceId: string };

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
  mocks.enqueueWhatsAppDelivery.mockClear();
  mocks.publishWidgetEvent.mockClear();
  ids = await seed();
});

async function seed() {
  const workspaceId = randomUUID();
  await prisma.workspace.create({
    data: { id: workspaceId, name: "Demo", slug: `demo-${workspaceId.slice(0, 8)}` },
  });
  const aiAgentId = randomUUID();
  await prisma.aiAgent.create({ data: { id: aiAgentId, name: "Agent", workspaceId } });
  const channelId = randomUUID();
  await prisma.channel.create({
    data: { aiAgentId, id: channelId, name: "WhatsApp", type: "WHATSAPP", workspaceId },
  });
  const humanAgentId = randomUUID();
  await prisma.user.create({
    data: {
      email: `agent-${humanAgentId.slice(0, 8)}@demo.test`,
      emailVerified: true,
      id: humanAgentId,
      name: "Human Agent",
      role: "HUMAN_AGENT",
      workspaceId,
    },
  });
  const customerIdentityId = randomUUID();
  await prisma.customerIdentity.create({
    data: {
      canonicalId: "+628123",
      channelType: "WHATSAPP",
      id: customerIdentityId,
      name: "Budi",
      phoneE164: "+628123",
      workspaceId,
    },
  });
  const sessionId = randomUUID();
  await prisma.session.create({
    data: { channelId, customerIdentityId, id: sessionId, workspaceId },
  });
  await prisma.conversation.create({
    data: {
      id: randomUUID(),
      metadata: {},
      scopeKey: `session:${sessionId}`,
      sessionId,
      userId: customerIdentityId,
      workspaceId,
    },
  });
  const ticketId = randomUUID();
  await prisma.ticket.create({
    data: {
      aiAgentId,
      assignedHumanAgentId: humanAgentId,
      channelId,
      customerIdentityId,
      id: ticketId,
      sessionId,
      status: "HUMAN_HANDLING",
      title: "Baterai panas",
      workspaceId,
    },
  });
  return { humanAgentId, sessionId, ticketId, workspaceId };
}

describe("a Human Agent pressed Send", () => {
  it("sends one Message however many times the same draft is submitted", async () => {
    const key = randomUUID();
    const send = () =>
      services.sendHumanReply(ids.ticketId, ids.humanAgentId, "Mohon hentikan pemakaian", key);

    const first = await send();
    // The Channel records its own id for the delivered Message. It used to
    // land on `externalMessageId`, erasing the idempotency key, so the next
    // submit of the same draft looked new — a Human Agent who pressed Send
    // three times because the platform had not updated sent three messages.
    await prisma.message.update({
      data: { deliveryStatus: "SENT", providerMessageId: "wamid.out" },
      where: { id: first.id },
    });

    const second = await send();
    const third = await send();

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await prisma.message.count({ where: { ticketId: ids.ticketId } })).toBe(1);
    // Delivered once: the repeats must not queue the Customer another copy.
    expect(mocks.enqueueWhatsAppDelivery).toHaveBeenCalledTimes(1);
  });

  it("redelivers a failed Message when the same draft is submitted again", async () => {
    const key = randomUUID();
    const first = await services.sendHumanReply(ids.ticketId, ids.humanAgentId, "Halo", key);
    await prisma.message.update({
      data: { deliveryStatus: "FAILED", providerMessageId: "wamid.failed" },
      where: { id: first.id },
    });

    const retried = await services.sendHumanReply(ids.ticketId, ids.humanAgentId, "Halo", key);

    expect(retried.id).toBe(first.id);
    expect(await prisma.message.count({ where: { ticketId: ids.ticketId } })).toBe(1);
    expect(mocks.enqueueWhatsAppDelivery).toHaveBeenCalledTimes(2);
  });
});

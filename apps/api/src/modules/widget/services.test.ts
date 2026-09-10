import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiActivityCreate: vi.fn(),
  aiActivityCreateMany: vi.fn(),
  classificationConfig: {
    apiKey: "sk-test",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/gpt-4.1-nano",
  },
  classifyMessage: vi.fn(),
  conversationCreate: vi.fn(),
  conversationFindUniqueOrThrow: vi.fn(),
  createClassificationModel: vi.fn().mockReturnValue({ id: "fake-model" }),
  messageCreate: vi.fn(),
  messageCreateMany: vi.fn(),
  messageCount: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdateMany: vi.fn(),
  publishTicketQueueEvent: vi.fn(),
  publishWidgetEvent: vi.fn(),
  ticketCreate: vi.fn(),
  ticketFindUniqueOrThrow: vi.fn(),
  ticketUpdate: vi.fn(),
  ticketUpdateMany: vi.fn(),
  transaction: vi.fn(),
  webSessionFindUnique: vi.fn(),
  webSessionFindUniqueOrThrow: vi.fn(),
  webSessionUpdate: vi.fn(),
  getObjectUrl: vi.fn(),
}));

class FakePrismaKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  constructor(code: string, meta: Record<string, unknown>) {
    super("unique constraint");
    this.code = code;
    this.meta = meta;
  }
}

vi.mock("../../utils/prisma", () => ({
  unscopedPrisma: {
    $transaction: mocks.transaction,
    webSession: {
      findUnique: mocks.webSessionFindUnique,
      findUniqueOrThrow: mocks.webSessionFindUniqueOrThrow,
    },
  },
}));

vi.mock("../../config", () => ({
  classificationConfig: mocks.classificationConfig,
  storageConfig: {},
}));

vi.mock("@repo/storage", () => ({
  createStorage: () => ({ getObjectUrl: mocks.getObjectUrl }),
}));

vi.mock("@repo/ai-agent", () => ({
  classifyMessage: mocks.classifyMessage,
  createClassificationModel: mocks.createClassificationModel,
}));

vi.mock("./realtime", () => ({
  publishTicketQueueEvent: mocks.publishTicketQueueEvent,
  publishWidgetEvent: mocks.publishWidgetEvent,
}));

const {
  ClassificationNotConfiguredError,
  createCustomerMessage,
  customerRequestedHuman,
  resolveByAi,
  toPublicWidgetConfig,
} = await import("./services");

const txMock = {
  aiActivity: { create: mocks.aiActivityCreate, createMany: mocks.aiActivityCreateMany },
  conversation: {
    create: mocks.conversationCreate,
    findUniqueOrThrow: mocks.conversationFindUniqueOrThrow,
  },
  message: {
    count: mocks.messageCount,
    create: mocks.messageCreate,
    createMany: mocks.messageCreateMany,
    findUnique: mocks.messageFindUnique,
    updateMany: mocks.messageUpdateMany,
  },
  ticket: {
    create: mocks.ticketCreate,
    findUniqueOrThrow: mocks.ticketFindUniqueOrThrow,
    update: mocks.ticketUpdate,
    updateMany: mocks.ticketUpdateMany,
  },
  webSession: {
    findUnique: mocks.webSessionFindUnique,
    findUniqueOrThrow: mocks.webSessionFindUniqueOrThrow,
    update: mocks.webSessionUpdate,
  },
};

function resetMocks() {
  mocks.aiActivityCreate.mockReset();
  mocks.aiActivityCreateMany.mockReset();
  mocks.classifyMessage.mockReset();
  mocks.conversationCreate.mockReset();
  mocks.conversationFindUniqueOrThrow.mockReset();
  mocks.createClassificationModel.mockReset().mockReturnValue({ id: "fake-model" });
  mocks.messageCreate.mockReset();
  mocks.messageCreateMany.mockReset().mockResolvedValue({ count: 2 });
  mocks.messageCount.mockReset().mockResolvedValue(0);
  mocks.messageFindUnique.mockReset();
  mocks.messageUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.publishTicketQueueEvent.mockReset();
  mocks.publishWidgetEvent.mockReset();
  mocks.ticketCreate.mockReset();
  mocks.ticketFindUniqueOrThrow.mockReset();
  mocks.ticketUpdate.mockReset();
  mocks.ticketUpdateMany.mockReset();
  mocks.transaction
    .mockReset()
    .mockImplementation(async (callback: (tx: typeof txMock) => unknown) => callback(txMock));
  mocks.webSessionFindUnique.mockReset();
  mocks.webSessionFindUniqueOrThrow.mockReset();
  mocks.webSessionUpdate.mockReset();
  mocks.getObjectUrl.mockReset();
  mocks.classificationConfig.apiKey = "sk-test";
}

const input = { content: "My invoice charged me twice", idempotencyKey: "idem-1" };

describe("createCustomerMessage", () => {
  beforeEach(resetMocks);

  it("returns null for a missing or inactive Web Session", async () => {
    mocks.webSessionFindUnique.mockResolvedValue(null);
    await expect(createCustomerMessage("token", input)).resolves.toBeNull();
    expect(mocks.classifyMessage).not.toHaveBeenCalled();

    mocks.webSessionFindUnique.mockResolvedValue({ status: "CLOSED", ticket: null });
    await expect(createCustomerMessage("token", input)).resolves.toBeNull();
  });

  it("appends to the existing Ticket without classifying when one already exists", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      ticket: { id: "ticket-1" },
      workspaceId: "ws-1",
    });
    mocks.messageFindUnique.mockResolvedValue(null);
    mocks.ticketUpdate.mockResolvedValue({ id: "ticket-1", messageSeq: 2 });
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ id: "conv-1" });
    mocks.messageCreate.mockResolvedValue({ id: "msg-2", position: 2, ticketId: "ticket-1" });

    const result = await createCustomerMessage("token", input);

    expect(mocks.classifyMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      created: true,
      kind: "message",
      message: { id: "msg-2", position: 2, ticketId: "ticket-1" },
    });
  });

  it("throws ClassificationNotConfiguredError when no Web Session Ticket exists and no API key is set", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      ticket: null,
      workspaceId: "ws-1",
    });
    mocks.classificationConfig.apiKey = "";

    await expect(createCustomerMessage("token", input)).rejects.toBeInstanceOf(
      ClassificationNotConfiguredError,
    );
    expect(mocks.classifyMessage).not.toHaveBeenCalled();
  });

  it("persists the pre-Ticket exchange and returns a warm reply for a greeting", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      ticket: null,
      workspaceId: "ws-1",
    });
    mocks.classifyMessage.mockResolvedValue({ qualifies: false, reply: "Hi there!" });

    const result = await createCustomerMessage("token", { ...input, content: "hi" });

    expect(result).toEqual({ kind: "reply", reply: "Hi there!" });
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
    expect(mocks.messageCreateMany).toHaveBeenCalledTimes(1);
    const payload = mocks.messageCreateMany.mock.calls[0]?.[0];
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0]).toMatchObject({
      content: "hi",
      position: -2,
      senderType: "CUSTOMER",
    });
    expect(payload.data[1]).toMatchObject({
      content: "Hi there!",
      position: -1,
      senderType: "AI_AGENT",
    });
  });

  it("creates a Ticket, its first Message, and two AiActivity rows for a genuine request", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      ticket: null,
      workspaceId: "ws-1",
    });
    mocks.classifyMessage.mockResolvedValue({
      category: "BILLING",
      priority: "HIGH",
      qualifies: true,
      title: "Invoice charged twice",
    });
    mocks.webSessionFindUniqueOrThrow.mockResolvedValue({
      channelId: "channel-1",
      customerIdentityId: "customer-1",
      id: "session-1",
      workspaceId: "ws-1",
    });
    mocks.ticketCreate.mockResolvedValue({ id: "ticket-1" });
    mocks.conversationCreate.mockResolvedValue({ id: "conv-1" });
    mocks.messageCreate.mockResolvedValue({ id: "msg-1", position: 1, ticketId: "ticket-1" });

    const result = await createCustomerMessage("token", input);

    expect(mocks.ticketCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "BILLING",
        priority: "HIGH",
        title: "Invoice charged twice",
        workspaceId: "ws-1",
      }),
    });
    expect(mocks.aiActivityCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ eventType: "TICKET_CREATED", ticketId: "ticket-1" }),
        expect.objectContaining({ eventType: "CLASSIFIED", ticketId: "ticket-1" }),
      ],
    });
    expect(result).toEqual({
      created: true,
      kind: "message",
      message: { id: "msg-1", position: 1, ticketId: "ticket-1" },
    });
  });

  it("appends to the winning Ticket when two first messages race to create one", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({
      status: "ACTIVE",
      ticket: null,
      workspaceId: "ws-1",
    });
    mocks.classifyMessage.mockResolvedValue({
      category: "GENERAL",
      priority: "NORMAL",
      qualifies: true,
      title: "Something",
    });

    const conflict = new FakePrismaKnownRequestError("P2002", { target: ["webSessionId"] });
    mocks.transaction.mockImplementationOnce(async () => {
      throw conflict;
    });
    mocks.webSessionFindUniqueOrThrow.mockResolvedValue({
      status: "ACTIVE",
      ticket: { id: "ticket-winner" },
      workspaceId: "ws-1",
    });
    mocks.messageFindUnique.mockResolvedValue(null);
    mocks.ticketUpdate.mockResolvedValue({ id: "ticket-winner", messageSeq: 1 });
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ id: "conv-winner" });
    mocks.messageCreate.mockResolvedValue({ id: "msg-1", position: 1, ticketId: "ticket-winner" });

    const result = await createCustomerMessage("token", input);

    expect(result).toEqual({
      created: true,
      kind: "message",
      message: { id: "msg-1", position: 1, ticketId: "ticket-winner" },
    });
  });
});

describe("customerRequestedHuman", () => {
  it.each([
    "I want to speak with a person.",
    "Please connect me to a human agent.",
    "Saya mau bicara dengan human.",
    "Tolong hubungkan saya ke CS.",
  ])("recognizes an explicit request in natural language: %s", (content) => {
    expect(customerRequestedHuman(content)).toBe(true);
  });

  it("does not treat an ordinary support question as an escalation request", () => {
    expect(customerRequestedHuman("Where can I download my invoice?")).toBe(false);
  });
});

describe("toPublicWidgetConfig", () => {
  beforeEach(resetMocks);

  const baseConfig = {
    botName: "Support Bot",
    primaryColor: "#2563eb",
    welcomeMessage: "Hi! How can we help you today?",
  };

  it("includes the logo URL when a logo reference is set", () => {
    mocks.getObjectUrl.mockReturnValue("https://cdn.example.com/logo.png");

    expect(
      toPublicWidgetConfig({ ...baseConfig, logoKey: "web-widget-logos/w1/logo.png" }),
    ).toEqual({ ...baseConfig, logoUrl: "https://cdn.example.com/logo.png" });
  });

  it("returns a null logo URL when no logo reference is set", () => {
    expect(toPublicWidgetConfig({ ...baseConfig, logoKey: null })).toEqual({
      ...baseConfig,
      logoUrl: null,
    });
  });
});

describe("resolveByAi", () => {
  beforeEach(resetMocks);

  it("resolves the Ticket, closes the Web Session, and sends the workspace closing message", async () => {
    mocks.ticketUpdateMany.mockResolvedValue({ count: 1 });
    mocks.ticketFindUniqueOrThrow.mockResolvedValue({
      messageSeq: 3,
      webSessionId: "session-1",
      workspace: { closingMessage: "Glad we could help!" },
    });
    mocks.conversationFindUniqueOrThrow.mockResolvedValue({ id: "conv-1" });
    mocks.messageCreate.mockResolvedValue({
      content: "Glad we could help!",
      id: "msg-close",
      ticketId: "ticket-1",
    });

    await resolveByAi("ticket-1", "ws-1");

    expect(mocks.ticketUpdateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resolutionReason: "CUSTOMER_CONFIRMED",
        resolvedBy: "AI_AGENT",
        status: "RESOLVED",
      }),
      where: { id: "ticket-1", status: "AI_HANDLING" },
    });
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Glad we could help!", senderType: "SYSTEM" }),
      }),
    );
    expect(mocks.webSessionUpdate).toHaveBeenCalledWith({
      data: { status: "CLOSED" },
      where: { id: "session-1" },
    });
    expect(mocks.aiActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "RESOLVED",
        metadata: { reason: "CUSTOMER_CONFIRMED" },
        ticketId: "ticket-1",
      }),
    });
    expect(mocks.publishWidgetEvent).toHaveBeenCalledWith("ticket-1", {
      type: "ticket.status",
      data: { status: "resolved" },
    });
    expect(mocks.publishTicketQueueEvent).toHaveBeenCalledWith("ws-1");
  });

  it("does nothing when the Ticket is no longer AI_HANDLING", async () => {
    mocks.ticketUpdateMany.mockResolvedValue({ count: 0 });

    await resolveByAi("ticket-1", "ws-1");

    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.publishWidgetEvent).not.toHaveBeenCalled();
    expect(mocks.publishTicketQueueEvent).not.toHaveBeenCalled();
  });
});

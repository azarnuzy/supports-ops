import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiActivityCreateMany: vi.fn(),
  classificationConfig: { apiKey: "sk-test", baseUrl: "https://openrouter.ai/api/v1", modelId: "openai/gpt-4.1-nano" },
  classifyMessage: vi.fn(),
  conversationCreate: vi.fn(),
  conversationFindUniqueOrThrow: vi.fn(),
  createClassificationModel: vi.fn().mockReturnValue({ id: "fake-model" }),
  messageCreate: vi.fn(),
  messageFindUnique: vi.fn(),
  ticketCreate: vi.fn(),
  ticketUpdate: vi.fn(),
  transaction: vi.fn(),
  webSessionFindUnique: vi.fn(),
  webSessionFindUniqueOrThrow: vi.fn(),
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
}));

vi.mock("@repo/ai-agent", () => ({
  classifyMessage: mocks.classifyMessage,
  createClassificationModel: mocks.createClassificationModel,
}));

const { ClassificationNotConfiguredError, createCustomerMessage, customerRequestedHuman } = await import("./services");

const txMock = {
  aiActivity: { createMany: mocks.aiActivityCreateMany },
  conversation: { create: mocks.conversationCreate, findUniqueOrThrow: mocks.conversationFindUniqueOrThrow },
  message: { create: mocks.messageCreate, findUnique: mocks.messageFindUnique },
  ticket: { create: mocks.ticketCreate, update: mocks.ticketUpdate },
  webSession: { findUniqueOrThrow: mocks.webSessionFindUniqueOrThrow },
};

function resetMocks() {
  mocks.aiActivityCreateMany.mockReset();
  mocks.classifyMessage.mockReset();
  mocks.conversationCreate.mockReset();
  mocks.conversationFindUniqueOrThrow.mockReset();
  mocks.createClassificationModel.mockReset().mockReturnValue({ id: "fake-model" });
  mocks.messageCreate.mockReset();
  mocks.messageFindUnique.mockReset();
  mocks.ticketCreate.mockReset();
  mocks.ticketUpdate.mockReset();
  mocks.transaction.mockReset().mockImplementation(async (callback: (tx: typeof txMock) => unknown) => callback(txMock));
  mocks.webSessionFindUnique.mockReset();
  mocks.webSessionFindUniqueOrThrow.mockReset();
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
    mocks.webSessionFindUnique.mockResolvedValue({ status: "ACTIVE", ticket: null, workspaceId: "ws-1" });
    mocks.classificationConfig.apiKey = "";

    await expect(createCustomerMessage("token", input)).rejects.toBeInstanceOf(
      ClassificationNotConfiguredError,
    );
    expect(mocks.classifyMessage).not.toHaveBeenCalled();
  });

  it("creates no Ticket and returns a warm reply for a greeting", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({ status: "ACTIVE", ticket: null, workspaceId: "ws-1" });
    mocks.classifyMessage.mockResolvedValue({ qualifies: false, reply: "Hi there!" });

    const result = await createCustomerMessage("token", { ...input, content: "hi" });

    expect(result).toEqual({ kind: "reply", reply: "Hi there!" });
    expect(mocks.ticketCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a Ticket, its first Message, and two AiActivity rows for a genuine request", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({ status: "ACTIVE", ticket: null, workspaceId: "ws-1" });
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
        expect.objectContaining({ eventType: "CLASSIFIED", ticketId: "ticket-1" }),
        expect.objectContaining({ eventType: "TICKET_CREATED", ticketId: "ticket-1" }),
      ],
    });
    expect(result).toEqual({
      created: true,
      kind: "message",
      message: { id: "msg-1", position: 1, ticketId: "ticket-1" },
    });
  });

  it("appends to the winning Ticket when two first messages race to create one", async () => {
    mocks.webSessionFindUnique.mockResolvedValue({ status: "ACTIVE", ticket: null, workspaceId: "ws-1" });
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

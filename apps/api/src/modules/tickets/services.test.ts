import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  messageFindMany: vi.fn(),
  queryRaw: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionFindUnique: vi.fn(),
  ticketFindFirst: vi.fn(),
  ticketFindMany: vi.fn(),
  ticketFindUnique: vi.fn(),
  ticketFindUniqueOrThrow: vi.fn(),
  ticketUpdateMany: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("../../utils/prisma", async () => {
  const actual = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma: actual.Prisma,
    prisma: {
      $executeRaw: mocks.executeRaw,
      $queryRaw: mocks.queryRaw,
      message: { findMany: mocks.messageFindMany },
      session: {
        findMany: mocks.sessionFindMany,
        findUnique: mocks.sessionFindUnique,
      },
      ticket: {
        findFirst: mocks.ticketFindFirst,
        findMany: mocks.ticketFindMany,
        findUnique: mocks.ticketFindUnique,
        findUniqueOrThrow: mocks.ticketFindUniqueOrThrow,
        updateMany: mocks.ticketUpdateMany,
      },
      user: { findFirst: mocks.userFindFirst },
    },
    unscopedPrisma: {},
  };
});

vi.mock("@repo/ai-agent", () => ({
  createReplyModel: vi.fn(),
  generateEscalationSummary: vi.fn(),
  generateSuggestedReply: vi.fn(),
}));

vi.mock("@repo/knowledge", () => ({
  createOpenAiEmbeddingClient: vi.fn(),
  searchChunks: vi.fn(),
}));

vi.mock("@repo/tools", () => ({
  BusinessToolError: class BusinessToolError extends Error {},
  createBusinessTools: vi.fn(),
}));

vi.mock("../../config", () => ({
  aiAgentConfig: {},
  apiConfig: {},
  embeddingConfig: {},
}));

vi.mock("../widget/realtime", () => ({
  cancelTicketGeneration: vi.fn(),
  publishTicketQueueEvent: vi.fn(),
  publishWidgetEvent: vi.fn(),
}));

vi.mock("../follow-up/queue", () => ({
  cancelFollowUpTimers: vi.fn(),
  scheduleIdleClosureForTicket: vi.fn(),
}));

vi.mock("../whatsapp-config/queue", () => ({ enqueueWhatsAppDelivery: vi.fn() }));
vi.mock("./queue", () => ({
  enqueueTicketKnowledgeIndex: vi.fn(),
}));

const {
  getTicketDetail,
  InvalidTicketsCursorError,
  listConversations,
  markTicketRead,
  reassignTicket,
  TicketNotAvailableForAssignmentError,
  TicketNotFoundError,
} = await import("./services");

function resetMocks() {
  mocks.executeRaw.mockReset().mockResolvedValue(1);
  mocks.queryRaw.mockReset().mockResolvedValue([]);
  mocks.sessionFindMany.mockReset().mockResolvedValue([]);
  mocks.sessionFindUnique.mockReset();
  mocks.ticketFindFirst.mockReset();
  mocks.ticketFindMany.mockReset().mockResolvedValue([]);
  mocks.ticketFindUnique.mockReset();
  mocks.messageFindMany.mockReset().mockResolvedValue([]);
  mocks.ticketFindUniqueOrThrow.mockReset();
  mocks.ticketUpdateMany.mockReset();
  mocks.userFindFirst.mockReset().mockResolvedValue({ id: "agent-2" });
}

function conversationRow(overrides: { id: string; ticket?: unknown }) {
  return {
    channel: { name: "Web Widget", type: "WEB" },
    createdAt: new Date(),
    customerIdentity: { email: null, id: "customer-1", name: "Olivia", phoneE164: null },
    customerLastMessageAt: null,
    id: overrides.id,
    messages: [],
    ticket: overrides.ticket ?? null,
  };
}

describe("listConversations", () => {
  beforeEach(resetMocks);

  it("gives an Admin every Session, ticketed or not, with no visibility restriction", async () => {
    await listConversations({ id: "admin-1", role: "ADMIN" }, { limit: 20 });

    const call = mocks.sessionFindMany.mock.calls[0]?.[0];
    expect(call.where.AND[0]).toEqual({ OR: [{ ticket: null }, { ticket: { deletedAt: null } }] });
  });

  it("restricts a Human Agent to Sessions whose Ticket is visible to them, and never a Ticket-less Session", async () => {
    await listConversations({ id: "agent-1", role: "HUMAN_AGENT" }, { limit: 20 });

    const call = mocks.sessionFindMany.mock.calls[0]?.[0];
    expect(call.where.AND[0]).toEqual({
      ticket: {
        AND: [
          {
            OR: [
              { assignedHumanAgentId: null, status: "ESCALATED" },
              { assignedHumanAgentId: "agent-1" },
              { resolvedBy: "agent-1" },
            ],
          },
          { deletedAt: null },
        ],
      },
    });
  });

  it("narrows an Admin's result to ticketed Sessions once a Ticket-scoped filter is applied", async () => {
    await listConversations(
      { id: "admin-1", role: "ADMIN" },
      {
        assigneeId: "agent-2",
        category: ["BILLING"],
        limit: 20,
        priority: ["HIGH"],
        status: ["ESCALATED", "HUMAN_HANDLING"],
      },
    );

    const call = mocks.sessionFindMany.mock.calls[0]?.[0];
    expect(call.where.AND[0]).toEqual({
      ticket: {
        AND: [
          {},
          { deletedAt: null },
          { status: { in: ["ESCALATED", "HUMAN_HANDLING"] } },
          { category: { in: ["BILLING"] } },
          { priority: { in: ["HIGH"] } },
          { assignedHumanAgentId: "agent-2" },
        ],
      },
    });
  });

  it("searches by customer name and email", async () => {
    await listConversations({ id: "admin-1", role: "ADMIN" }, { limit: 20, search: "olivia" });

    const call = mocks.sessionFindMany.mock.calls[0]?.[0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        {
          customerIdentity: {
            OR: [
              { name: { contains: "olivia", mode: "insensitive" } },
              { email: { contains: "olivia", mode: "insensitive" } },
              { phoneE164: { contains: "olivia", mode: "insensitive" } },
            ],
          },
        },
      ]),
    );
  });

  it("rejects an unknown cursor", async () => {
    mocks.sessionFindUnique.mockResolvedValue(null);

    await expect(
      listConversations({ id: "admin-1", role: "ADMIN" }, { cursor: "missing", limit: 20 }),
    ).rejects.toBeInstanceOf(InvalidTicketsCursorError);
  });

  it("returns a nextCursor only when more Sessions remain", async () => {
    mocks.sessionFindMany.mockResolvedValue([
      conversationRow({ id: "s-1" }),
      conversationRow({ id: "s-2" }),
    ]);

    const result = await listConversations({ id: "admin-1", role: "ADMIN" }, { limit: 1 });

    expect(result.nextCursor).toBe("s-1");
    expect(result.conversations).toHaveLength(1);
  });

  it("returns a mixed result with the Ticket projected only for a ticketed Session", async () => {
    mocks.sessionFindMany.mockResolvedValue([
      conversationRow({
        id: "s-1",
        ticket: {
          assignedHumanAgent: null,
          category: "BILLING",
          id: "t-1",
          priority: "NORMAL",
          resolvedAt: null,
          status: "AI_HANDLING",
          title: "Refund question",
          updatedAt: new Date(),
        },
      }),
      conversationRow({ id: "s-2" }),
    ]);

    const result = await listConversations({ id: "admin-1", role: "ADMIN" }, { limit: 20 });

    expect(result.conversations[0]?.ticket).toMatchObject({ id: "t-1", unreadCount: 0 });
    expect(result.conversations[1]?.ticket).toBeNull();
  });
});

describe("reassignTicket", () => {
  beforeEach(resetMocks);

  it("only assigns an unassigned escalation or an actively human-handled Ticket", async () => {
    mocks.ticketUpdateMany.mockResolvedValue({ count: 1 });
    mocks.ticketFindUniqueOrThrow.mockResolvedValue({ id: "ticket-1" });

    await reassignTicket("ticket-1", "agent-2", "workspace-1");

    expect(mocks.ticketUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "ticket-1",
          OR: [{ assignedHumanAgentId: null, status: "ESCALATED" }, { status: "HUMAN_HANDLING" }],
        },
      }),
    );
  });

  it("rejects every other lifecycle state", async () => {
    mocks.ticketUpdateMany.mockResolvedValue({ count: 0 });

    await expect(reassignTicket("ticket-1", "agent-2", "workspace-1")).rejects.toBeInstanceOf(
      TicketNotAvailableForAssignmentError,
    );
  });
});

describe("getTicketDetail", () => {
  beforeEach(resetMocks);

  it("returns the Ticket with its session transcript when visible to the current user", async () => {
    const sessionCreatedAt = new Date("2026-01-01T00:00:00Z");
    mocks.ticketFindFirst.mockResolvedValue({
      id: "t-1",
      session: { createdAt: sessionCreatedAt, customerLastMessageAt: null, id: "session-1" },
    });
    mocks.messageFindMany.mockResolvedValue([
      { content: "halo", position: -2, senderType: "CUSTOMER" },
    ]);

    const result = await getTicketDetail("t-1", { id: "admin-1", role: "ADMIN" });

    // The transcript is keyed by the Ticket's Web Session, so pre-Ticket
    // Messages are part of the returned history.
    expect(result).toEqual({
      id: "t-1",
      messages: [{ content: "halo", position: -2, senderType: "CUSTOMER" }],
      unreadCount: 0,
      session: { createdAt: sessionCreatedAt, customerLastMessageAt: null, id: "session-1" },
    });
    const messageCall = mocks.messageFindMany.mock.calls[0]?.[0];
    expect(messageCall.where).toEqual({ deletedAt: null, sessionId: "session-1" });
    expect(messageCall.orderBy).toEqual([{ position: "asc" }, { createdAt: "asc" }]);
    const call = mocks.ticketFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ AND: [{ deletedAt: null, id: "t-1" }, {}] });
    // The timeline opens with the Web Session's creation, and attachments are
    // opened through the download endpoint, so no storage key is exposed.
    expect(call.select.session).toEqual({
      select: { createdAt: true, customerLastMessageAt: true, id: true },
    });
    expect(call.select.messages).toBeUndefined();
    expect(call.select).not.toHaveProperty("messages");
  });
  it("throws when the Ticket does not exist or is not visible", async () => {
    mocks.ticketFindFirst.mockResolvedValue(null);

    await expect(
      getTicketDetail("t-1", { id: "agent-1", role: "HUMAN_AGENT" }),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
  });
});

describe("markTicketRead", () => {
  beforeEach(resetMocks);

  it("clamps the requested position to the Session's current messageSeq", async () => {
    mocks.ticketFindFirst.mockResolvedValue({
      session: { messageSeq: 5 },
      workspaceId: "workspace-1",
    });

    const result = await markTicketRead("t-1", { id: "agent-1", role: "HUMAN_AGENT" }, 99);

    expect(result).toEqual({ lastReadPosition: 5 });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("throws when the Ticket does not exist or is not visible", async () => {
    mocks.ticketFindFirst.mockResolvedValue(null);

    await expect(
      markTicketRead("t-1", { id: "agent-1", role: "HUMAN_AGENT" }, 1),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("persists per-user, and never regresses a stored position, via a GREATEST upsert", async () => {
    mocks.ticketFindFirst.mockResolvedValue({
      session: { messageSeq: 10 },
      workspaceId: "workspace-1",
    });

    await markTicketRead("t-1", { id: "agent-1", role: "HUMAN_AGENT" }, 3);

    const sql = mocks.executeRaw.mock.calls[0]?.[0] as unknown as { join: (sep: string) => string };
    expect(sql.join(" ")).toContain("GREATEST");
    const values = mocks.executeRaw.mock.calls[0]?.slice(1);
    expect(values).toEqual(expect.arrayContaining(["agent-1", "t-1", 3]));
  });
});

describe("unread counts", () => {
  beforeEach(resetMocks);

  it("scopes the unread query to the requesting user, so one user's read state cannot leak into another's count", async () => {
    mocks.sessionFindMany.mockResolvedValue([
      conversationRow({
        id: "s-1",
        ticket: {
          assignedHumanAgent: null,
          category: "GENERAL",
          id: "t-1",
          priority: "NORMAL",
          resolvedAt: null,
          status: "ESCALATED",
          title: "Help",
          updatedAt: new Date(),
        },
      }),
    ]);

    await listConversations({ id: "agent-1", role: "HUMAN_AGENT" }, { limit: 20 });
    await listConversations({ id: "agent-2", role: "HUMAN_AGENT" }, { limit: 20 });

    const userIdsQueried = mocks.queryRaw.mock.calls.map((call) => call.slice(1)[0]);
    expect(userIdsQueried).toEqual(["agent-1", "agent-2"]);
  });

  it("reports zero unread without querying when no Sessions are visible", async () => {
    mocks.sessionFindMany.mockResolvedValue([]);

    const result = await listConversations({ id: "agent-1", role: "HUMAN_AGENT" }, { limit: 20 });

    expect(result.conversations).toEqual([]);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});

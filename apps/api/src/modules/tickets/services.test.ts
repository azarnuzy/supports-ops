import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  messageFindMany: vi.fn(),
  queryRaw: vi.fn(),
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
  listTickets,
  markTicketRead,
  reassignTicket,
  TicketNotAvailableForAssignmentError,
  TicketNotFoundError,
} = await import("./services");

function resetMocks() {
  mocks.executeRaw.mockReset().mockResolvedValue(1);
  mocks.queryRaw.mockReset().mockResolvedValue([]);
  mocks.ticketFindFirst.mockReset();
  mocks.ticketFindMany.mockReset().mockResolvedValue([]);
  mocks.ticketFindUnique.mockReset();
  mocks.messageFindMany.mockReset().mockResolvedValue([]);
  mocks.ticketFindUniqueOrThrow.mockReset();
  mocks.ticketUpdateMany.mockReset();
  mocks.userFindFirst.mockReset().mockResolvedValue({ id: "agent-2" });
}

describe("listTickets", () => {
  beforeEach(resetMocks);

  it("gives an Admin every Ticket, with no visibility restriction", async () => {
    await listTickets({ id: "admin-1", role: "ADMIN" }, { limit: 20 });

    const call = mocks.ticketFindMany.mock.calls[0]?.[0];
    expect(call.where.AND[0]).toEqual({});
  });

  it("restricts a Human Agent to the queue, their own Tickets, and Tickets they resolved", async () => {
    await listTickets({ id: "agent-1", role: "HUMAN_AGENT" }, { limit: 20 });

    const call = mocks.ticketFindMany.mock.calls[0]?.[0];
    expect(call.where.AND[0]).toEqual({
      OR: [
        { assignedHumanAgentId: null, status: "ESCALATED" },
        { assignedHumanAgentId: "agent-1" },
        { resolvedBy: "agent-1" },
      ],
    });
  });

  it("combines the status, category, priority, and assignee filters", async () => {
    await listTickets(
      { id: "admin-1", role: "ADMIN" },
      {
        assigneeId: "agent-2",
        category: ["BILLING"],
        limit: 20,
        priority: ["HIGH"],
        status: ["ESCALATED", "HUMAN_HANDLING"],
      },
    );

    const call = mocks.ticketFindMany.mock.calls[0]?.[0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        { status: { in: ["ESCALATED", "HUMAN_HANDLING"] } },
        { category: { in: ["BILLING"] } },
        { priority: { in: ["HIGH"] } },
        { assignedHumanAgentId: "agent-2" },
      ]),
    );
  });

  it("searches by customer name and email", async () => {
    await listTickets({ id: "admin-1", role: "ADMIN" }, { limit: 20, search: "olivia" });

    const call = mocks.ticketFindMany.mock.calls[0]?.[0];
    expect(call.where.AND).toEqual(
      expect.arrayContaining([
        {
          customerIdentity: {
            OR: [
              { name: { contains: "olivia", mode: "insensitive" } },
              { email: { contains: "olivia", mode: "insensitive" } },
            ],
          },
        },
      ]),
    );
  });

  it("rejects an unknown cursor", async () => {
    mocks.ticketFindUnique.mockResolvedValue(null);

    await expect(
      listTickets({ id: "admin-1", role: "ADMIN" }, { cursor: "missing", limit: 20 }),
    ).rejects.toBeInstanceOf(InvalidTicketsCursorError);
  });

  it("returns a nextCursor only when more Tickets remain", async () => {
    mocks.ticketFindMany.mockResolvedValue([
      { createdAt: new Date(), id: "t-1" },
      { createdAt: new Date(), id: "t-2" },
    ]);

    const result = await listTickets({ id: "admin-1", role: "ADMIN" }, { limit: 1 });

    expect(result.nextCursor).toBe("t-1");
    expect(result.tickets).toHaveLength(1);
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
      session: { createdAt: sessionCreatedAt, id: "session-1" },
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
      session: { createdAt: sessionCreatedAt, id: "session-1" },
    });
    const messageCall = mocks.messageFindMany.mock.calls[0]?.[0];
    expect(messageCall.where).toEqual({ deletedAt: null, sessionId: "session-1" });
    expect(messageCall.orderBy).toEqual([{ position: "asc" }, { createdAt: "asc" }]);
    const call = mocks.ticketFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ AND: [{ deletedAt: null, id: "t-1" }, {}] });
    // The timeline opens with the Web Session's creation, and attachments are
    // opened through the download endpoint, so no storage key is exposed.
    expect(call.select.session).toEqual({ select: { createdAt: true, id: true } });
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
    mocks.ticketFindMany.mockResolvedValue([{ createdAt: new Date(), id: "t-1" }]);

    await listTickets({ id: "agent-1", role: "HUMAN_AGENT" }, { limit: 20 });
    await listTickets({ id: "agent-2", role: "HUMAN_AGENT" }, { limit: 20 });

    const userIdsQueried = mocks.queryRaw.mock.calls.map((call) => call.slice(1)[0]);
    expect(userIdsQueried).toEqual(["agent-1", "agent-2"]);
  });

  it("reports zero unread without querying when no Tickets are visible", async () => {
    mocks.ticketFindMany.mockResolvedValue([]);

    const result = await listTickets({ id: "agent-1", role: "HUMAN_AGENT" }, { limit: 20 });

    expect(result.tickets).toEqual([]);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});

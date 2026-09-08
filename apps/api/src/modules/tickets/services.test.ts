import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ticketFindFirst: vi.fn(),
  ticketFindMany: vi.fn(),
  ticketFindUnique: vi.fn(),
}));

vi.mock("../../utils/prisma", async () => {
  const actual = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma: actual.Prisma,
    prisma: {
      ticket: {
        findFirst: mocks.ticketFindFirst,
        findMany: mocks.ticketFindMany,
        findUnique: mocks.ticketFindUnique,
      },
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
}));

vi.mock("./queue", () => ({
  enqueueTicketKnowledgeIndex: vi.fn(),
}));

const { getTicketDetail, InvalidTicketsCursorError, listTickets, TicketNotFoundError } =
  await import("./services");

function resetMocks() {
  mocks.ticketFindFirst.mockReset();
  mocks.ticketFindMany.mockReset().mockResolvedValue([]);
  mocks.ticketFindUnique.mockReset();
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

describe("getTicketDetail", () => {
  beforeEach(resetMocks);

  it("returns the Ticket when it is visible to the current user", async () => {
    mocks.ticketFindFirst.mockResolvedValue({ id: "t-1" });

    const result = await getTicketDetail("t-1", { id: "admin-1", role: "ADMIN" });

    expect(result).toEqual({ id: "t-1" });
    const call = mocks.ticketFindFirst.mock.calls[0]?.[0];
    expect(call.where).toEqual({ AND: [{ deletedAt: null, id: "t-1" }, {}] });
  });

  it("throws when the Ticket does not exist or is not visible", async () => {
    mocks.ticketFindFirst.mockResolvedValue(null);

    await expect(
      getTicketDetail("t-1", { id: "agent-1", role: "HUMAN_AGENT" }),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
  });
});

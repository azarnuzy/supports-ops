import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiAgentFindFirst: vi.fn(),
  requireWorkspaceId: vi.fn(),
  searchChunks: vi.fn(),
  searchTicketChunks: vi.fn(),
  ticketFindFirst: vi.fn(),
  toolFindMany: vi.fn(),
}));

vi.mock("../../utils/workspace-context", () => ({
  requireWorkspaceId: mocks.requireWorkspaceId,
}));
vi.mock("../../utils/prisma", () => ({
  prisma: {
    aiAgent: { findFirst: mocks.aiAgentFindFirst },
    ticket: { findFirst: mocks.ticketFindFirst },
    tool: { findMany: mocks.toolFindMany },
  },
}));
vi.mock("@repo/knowledge", () => ({
  searchChunks: mocks.searchChunks,
  searchTicketChunks: mocks.searchTicketChunks,
}));
vi.mock("../../config", () => ({ toolEncryptionConfig: { masterKey: "key" } }));
vi.mock("./secrets", () => ({ encryptToolSecret: vi.fn() }));

const { executeBuiltInTool, resolveTools, TicketNotFoundError, ToolNotAssignedError } =
  await import("./services");

describe("Tool runtime authorization", () => {
  beforeEach(() => {
    mocks.aiAgentFindFirst.mockReset().mockResolvedValue({ id: "agent-1" });
    mocks.requireWorkspaceId.mockReset().mockReturnValue("workspace-1");
    mocks.searchChunks.mockReset().mockResolvedValue([]);
    mocks.searchTicketChunks.mockReset().mockResolvedValue([]);
    mocks.ticketFindFirst.mockReset().mockResolvedValue({
      channel: { type: "WEB" },
      customerIdentityId: "customer-1",
    });
    mocks.toolFindMany.mockReset().mockResolvedValue([]);
  });

  it("resolves assigned, enabled, available Tools only", async () => {
    mocks.toolFindMany.mockResolvedValue([
      { httpConfig: null, mcpTool: null, name: "searchKnowledge", origin: "BUILT_IN" },
      { httpConfig: null, mcpTool: null, name: "unknownBuiltIn", origin: "BUILT_IN" },
    ]);

    await expect(resolveTools("agent-1")).resolves.toEqual([
      expect.objectContaining({ name: "searchKnowledge" }),
    ]);
    expect(mocks.toolFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assignments: { some: { aiAgentId: "agent-1" } }, enabled: true } }),
    );
  });

  it("denies unassigned Tools and Tickets outside the scoped Workspace", async () => {
    await expect(
      executeBuiltInTool({ aiAgentId: "agent-1", embedding: [0.1], ticketId: "ticket-1", toolName: "searchKnowledge" }),
    ).rejects.toBeInstanceOf(ToolNotAssignedError);

    mocks.toolFindMany.mockResolvedValue([
      { httpConfig: null, mcpTool: null, name: "searchKnowledge", origin: "BUILT_IN" },
    ]);
    mocks.ticketFindFirst.mockResolvedValue(null);
    await expect(
      executeBuiltInTool({ aiAgentId: "agent-1", embedding: [0.1], ticketId: "other-workspace-ticket", toolName: "searchKnowledge" }),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
  });

  it("keeps Knowledge Customer-Safe and Ticket Knowledge scoped to server Ticket context", async () => {
    mocks.toolFindMany
      .mockResolvedValueOnce([
        { httpConfig: null, mcpTool: null, name: "searchKnowledge", origin: "BUILT_IN" },
      ])
      .mockResolvedValueOnce([
        { httpConfig: null, mcpTool: null, name: "searchCustomerTicketHistory", origin: "BUILT_IN" },
      ]);

    await executeBuiltInTool({ aiAgentId: "agent-1", embedding: [0.1], ticketId: "ticket-1", toolName: "searchKnowledge" });
    await executeBuiltInTool({ aiAgentId: "agent-1", embedding: [0.1], ticketId: "ticket-1", toolName: "searchCustomerTicketHistory" });

    expect(mocks.searchChunks).toHaveBeenCalledWith(expect.anything(), {
      embedding: [0.1], retrievalMode: "CUSTOMER", workspaceId: "workspace-1",
    });
    expect(mocks.searchTicketChunks).toHaveBeenCalledWith(expect.anything(), {
      channelType: "WEB", customerIdentityId: "customer-1", embedding: [0.1],
      excludeTicketId: "ticket-1", workspaceId: "workspace-1",
    });
  });
});

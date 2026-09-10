import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignedTool } from "./orchestration";

const mocks = vi.hoisted(() => ({
  aiActivityCreate: vi.fn(),
  executeBuiltInTool: vi.fn(),
  executeHttpTool: vi.fn(),
  executeMcpTool: vi.fn(),
  resolveRequiredTool: vi.fn(),
  resolveTools: vi.fn(),
}));

vi.mock("../../utils/prisma", () => ({
  unscopedPrisma: { aiActivity: { create: mocks.aiActivityCreate } },
}));
vi.mock("./execution", () => ({ executeHttpTool: mocks.executeHttpTool }));
vi.mock("../mcp/services", () => ({ executeMcpTool: mocks.executeMcpTool }));
vi.mock("./services", () => ({
  executeBuiltInTool: mocks.executeBuiltInTool,
  resolveRequiredTool: mocks.resolveRequiredTool,
  resolveTools: mocks.resolveTools,
}));

const {
  createOptionalToolExecutor,
  describeOptionalTools,
  RequiredToolFailedError,
  runRequiredTool,
} = await import("./orchestration");

function makeTool(
  overrides: Partial<AssignedTool> & Pick<AssignedTool, "id" | "name" | "origin" | "risk">,
) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    description: "Looks up subscription status.",
    enabled: true,
    httpConfig: overrides.origin === "HTTP" ? { toolId: overrides.id } : null,
    inputSchema: { type: "object" },
    mcpTool: null,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    workspaceId: "workspace-1",
    ...overrides,
  } as AssignedTool;
}

const httpTool = makeTool({
  id: "tool-http-1",
  name: "getSubscriptionStatus",
  origin: "HTTP",
  risk: "READ_ONLY",
});

const mutatingTool = makeTool({
  id: "tool-mutating-1",
  name: "cancelSubscription",
  origin: "HTTP",
  risk: "MUTATING",
});

beforeEach(() => {
  mocks.aiActivityCreate.mockReset();
  mocks.executeBuiltInTool.mockReset();
  mocks.executeHttpTool.mockReset();
  mocks.executeMcpTool.mockReset();
  mocks.resolveRequiredTool.mockReset();
  mocks.resolveTools.mockReset();
});

describe("runRequiredTool", () => {
  it("returns null when the Ticket Category has no Tool Policy", async () => {
    mocks.resolveRequiredTool.mockResolvedValue(null);

    await expect(
      runRequiredTool({
        aiAgentId: "agent-1",
        category: "GENERAL",
        ticketId: "t1",
        workspaceId: "w1",
      }),
    ).resolves.toBeNull();
    expect(mocks.executeHttpTool).not.toHaveBeenCalled();
  });

  it("executes the required Tool and records TOOL_CALLED with stable identifiers before generation", async () => {
    mocks.resolveRequiredTool.mockResolvedValue(httpTool);
    mocks.executeHttpTool.mockResolvedValue('{"status":"ACTIVE"}');

    const result = await runRequiredTool({
      aiAgentId: "agent-1",
      category: "SUBSCRIPTION",
      ticketId: "t1",
      workspaceId: "w1",
    });

    expect(result).toEqual({
      id: "tool-http-1",
      name: "getSubscriptionStatus",
      result: '{"status":"ACTIVE"}',
    });
    expect(mocks.executeHttpTool).toHaveBeenCalledWith({
      explicitCustomerRequest: false,
      input: {},
      ticketId: "t1",
      toolId: "tool-http-1",
    });
    expect(mocks.aiActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "TOOL_CALLED",
        metadata: expect.objectContaining({
          origin: "HTTP",
          outcome: "SUCCESS",
          risk: "READ_ONLY",
          tool: "getSubscriptionStatus",
          toolId: "tool-http-1",
        }),
        ticketId: "t1",
        workspaceId: "w1",
      }),
    });
  });

  it("records TOOL_FAILED and throws RequiredToolFailedError when the required Tool fails", async () => {
    mocks.resolveRequiredTool.mockResolvedValue(httpTool);
    mocks.executeHttpTool.mockRejectedValue(new Error("timeout"));

    await expect(
      runRequiredTool({
        aiAgentId: "agent-1",
        category: "SUBSCRIPTION",
        ticketId: "t1",
        workspaceId: "w1",
      }),
    ).rejects.toBeInstanceOf(RequiredToolFailedError);
    expect(mocks.aiActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "TOOL_FAILED" }),
    });
  });
});

describe("describeOptionalTools", () => {
  it("excludes the already-executed required Tool", () => {
    const descriptors = describeOptionalTools([httpTool, mutatingTool], httpTool.id);
    expect(descriptors).toEqual([
      expect.objectContaining({ id: mutatingTool.id, name: mutatingTool.name }),
    ]);
  });
});

describe("createOptionalToolExecutor", () => {
  it("denies a MUTATING Tool call without surfacing a crash to the caller's caller", async () => {
    const executor = createOptionalToolExecutor({
      aiAgentId: "agent-1",
      ticketId: "t1",
      tools: [mutatingTool],
      workspaceId: "w1",
    });

    await expect(executor({ input: {}, toolId: mutatingTool.id })).rejects.toThrow(/explicit/i);
    expect(mocks.executeHttpTool).not.toHaveBeenCalled();
    expect(mocks.aiActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "TOOL_FAILED" }),
    });
  });

  it("rejects a Tool ID that is not in the resolved assigned set (unassigned denial)", async () => {
    const executor = createOptionalToolExecutor({
      aiAgentId: "agent-1",
      ticketId: "t1",
      tools: [httpTool],
      workspaceId: "w1",
    });

    await expect(executor({ input: {}, toolId: "not-assigned" })).rejects.toThrow();
    expect(mocks.executeHttpTool).not.toHaveBeenCalled();
  });

  it("dispatches an MCP-origin Tool and normalizes its result to a string", async () => {
    const mcpTool = makeTool({
      id: "tool-mcp-1",
      name: httpTool.name,
      origin: "MCP",
      risk: "READ_ONLY",
    });
    mocks.executeMcpTool.mockResolvedValue({ status: "PAID" });
    const executor = createOptionalToolExecutor({
      aiAgentId: "agent-1",
      ticketId: "t1",
      tools: [mcpTool],
      workspaceId: "w1",
    });

    await expect(executor({ input: { invoiceId: "inv-1" }, toolId: mcpTool.id })).resolves.toBe(
      '{"status":"PAID"}',
    );
    expect(mocks.executeMcpTool).toHaveBeenCalledWith("tool-mcp-1", "agent-1", {
      invoiceId: "inv-1",
    });
  });
});

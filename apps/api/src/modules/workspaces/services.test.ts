import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../utils/prisma", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/prisma")>()),
  unscopedPrisma: {
    $transaction: mocks.transaction,
    workspace: { findMany: mocks.findMany },
  },
}));

const { createOrganizationWorkspace, listOrganizationWorkspaces, provisionWorkspaceDefaults } =
  await import("./services");

describe("listOrganizationWorkspaces", () => {
  it("lists only that Organization's non-deleted Workspaces", async () => {
    mocks.findMany.mockResolvedValue([]);

    await listOrganizationWorkspaces("org-1");

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true },
    });
  });
});

describe("createOrganizationWorkspace", () => {
  const created: { workspace?: Record<string, unknown> } = {};

  beforeEach(() => {
    mocks.transaction.mockReset();
    created.workspace = undefined;

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        workspace: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            created.workspace = data;
            return data;
          }),
        },
        aiSettings: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
        aiAgent: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
        channel: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
        webWidgetConfig: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
        ticketCategory: {
          createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
        },
      };

      return callback(tx);
    });
  });

  it("creates a Workspace under the given Organization without granting Credits", async () => {
    const result = await createOrganizationWorkspace("org-1", "Second Business");

    expect(created.workspace).toMatchObject({ organizationId: "org-1", name: "Second Business" });
    expect(result).toEqual(created.workspace);
  });
});

describe("provisionWorkspaceDefaults", () => {
  it("creates AiSettings, an AI Agent, a Web Channel, and its Widget config", async () => {
    const created: Record<string, unknown> = {};
    const tx = {
      aiSettings: { create: vi.fn(async ({ data }: { data: unknown }) => data) },
      aiAgent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.aiAgent = data;
          return data;
        }),
      },
      channel: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.channel = data;
          return data;
        }),
      },
      webWidgetConfig: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.webWidgetConfig = data;
          return data;
        }),
      },
      ticketCategory: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      },
    };

    await provisionWorkspaceDefaults(tx, "workspace-1");

    const aiAgent = created.aiAgent as Record<string, unknown>;
    const channel = created.channel as Record<string, unknown>;
    const webWidgetConfig = created.webWidgetConfig as Record<string, unknown>;

    expect(aiAgent).toMatchObject({ name: "AI Agent", workspaceId: "workspace-1" });
    expect(channel).toMatchObject({
      aiAgentId: aiAgent.id,
      type: "WEB",
      workspaceId: "workspace-1",
    });
    expect(webWidgetConfig).toMatchObject({ channelId: channel.id, workspaceId: "workspace-1" });
  });
});

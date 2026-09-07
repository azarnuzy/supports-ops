import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  hashPassword: vi.fn(),
  transaction: vi.fn(),
}));

class FakePrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;

  constructor(message: string, { code, meta }: { code: string; meta?: Record<string, unknown> }) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

vi.mock("../../utils/prisma", () => ({
  Prisma: { PrismaClientKnownRequestError: FakePrismaClientKnownRequestError },
  unscopedPrisma: {
    $transaction: mocks.transaction,
    user: { findUnique: mocks.findUnique },
  },
}));

vi.mock("better-auth/crypto", () => ({
  hashPassword: mocks.hashPassword,
}));

const { EmailAlreadyInUseError, registerAdminWorkspace } = await import("./services");

describe("registerAdminWorkspace", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.hashPassword.mockReset();
    mocks.transaction.mockReset();
    mocks.hashPassword.mockResolvedValue("hashed-password");
  });

  it("throws without starting a transaction when the email is already registered", async () => {
    mocks.findUnique.mockResolvedValue({ id: "existing-user" });

    await expect(
      registerAdminWorkspace({
        email: "ada@example.com",
        name: "Ada Lovelace",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a Workspace, an Admin, and its credential Account in one transaction", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const created: {
      account?: unknown;
      user?: unknown;
      workspace?: unknown;
      aiAgent?: unknown;
      channel?: unknown;
      webWidgetConfig?: unknown;
    } = {};

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        account: {
          create: vi.fn(async ({ data }: { data: unknown }) => {
            created.account = data;
            return data;
          }),
        },
        user: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            created.user = data;
            return data;
          }),
        },
        workspace: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            created.workspace = data;
            return data;
          }),
        },
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
      };

      return callback(tx);
    });

    const result = await registerAdminWorkspace({
      email: "ada@example.com",
      name: "Ada Lovelace",
      password: "password123",
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith("password123");

    const workspace = created.workspace as { id: string; name: string; slug: string };
    const user = created.user as Record<string, unknown>;
    const account = created.account as Record<string, unknown>;

    expect(workspace.name).toBe("Ada Lovelace's Workspace");
    expect(workspace.slug.startsWith("ada-lovelace-")).toBe(true);

    expect(user).toMatchObject({
      email: "ada@example.com",
      name: "Ada Lovelace",
      role: "ADMIN",
      workspaceId: workspace.id,
    });

    expect(account).toMatchObject({
      accountId: user.id,
      password: "hashed-password",
      providerId: "credential",
      userId: user.id,
    });

    expect(result.workspace).toEqual(workspace);
    expect(result.user).toEqual(user);

    const aiAgent = created.aiAgent as Record<string, unknown>;
    const channel = created.channel as Record<string, unknown>;
    const webWidgetConfig = created.webWidgetConfig as Record<string, unknown>;

    expect(aiAgent).toMatchObject({ name: "AI Agent", workspaceId: workspace.id });

    expect(channel).toMatchObject({
      aiAgentId: aiAgent.id,
      type: "WEB",
      workspaceId: workspace.id,
    });

    expect(webWidgetConfig).toMatchObject({
      allowedDomains: [],
      channelId: channel.id,
      workspaceId: workspace.id,
    });
    expect(typeof webWidgetConfig.widgetKey).toBe("string");
    expect((webWidgetConfig.widgetKey as string).startsWith("widget_")).toBe(true);
  });

  it("converts a race-condition unique email violation into a clear error", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.transaction.mockRejectedValue(
      new FakePrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        meta: { target: ["email"] },
      }),
    );

    await expect(
      registerAdminWorkspace({
        email: "ada@example.com",
        name: "Ada Lovelace",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
  });

  it("rethrows unrelated transaction failures", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.transaction.mockRejectedValue(new Error("connection lost"));

    await expect(
      registerAdminWorkspace({
        email: "ada@example.com",
        name: "Ada Lovelace",
        password: "password123",
      }),
    ).rejects.toThrow("connection lost");
  });
});

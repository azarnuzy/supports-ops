import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webWidgetConfigFindFirst: vi.fn(),
  webWidgetConfigUpdate: vi.fn(),
  workspaceFindUnique: vi.fn(),
  workspaceUpdate: vi.fn(),
  transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  requireWorkspaceId: vi.fn(),
}));

vi.mock("../../utils/prisma", () => ({
  prisma: {
    webWidgetConfig: {
      findFirst: mocks.webWidgetConfigFindFirst,
      update: mocks.webWidgetConfigUpdate,
    },
    workspace: {
      findUnique: mocks.workspaceFindUnique,
      update: mocks.workspaceUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../../utils/workspace-context", () => ({
  requireWorkspaceId: mocks.requireWorkspaceId,
}));

const { WebWidgetConfigNotFoundError, getWebWidgetConfig, updateWebWidgetConfig } = await import(
  "./services"
);

const existingConfig = {
  id: "config-1",
  widgetKey: "widget_abc123",
  botName: "Support Bot",
  welcomeMessage: "Hi! How can we help you today?",
  primaryColor: "#2563eb",
  allowedDomains: ["example.com"],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function resetMocks() {
  mocks.webWidgetConfigFindFirst.mockReset();
  mocks.webWidgetConfigUpdate.mockReset();
  mocks.workspaceFindUnique.mockReset();
  mocks.workspaceUpdate.mockReset();
  mocks.transaction
    .mockReset()
    .mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  mocks.requireWorkspaceId.mockReset().mockReturnValue("workspace-1");
}

describe("getWebWidgetConfig", () => {
  beforeEach(resetMocks);

  it("returns the Workspace's Web Widget configuration and closing message", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue(existingConfig);
    mocks.workspaceFindUnique.mockResolvedValue({ closingMessage: "Glad we could help!" });

    const result = await getWebWidgetConfig();

    expect(mocks.workspaceFindUnique).toHaveBeenCalledWith({
      where: { id: "workspace-1" },
      select: { closingMessage: true },
    });
    expect(result).toEqual({
      webWidgetConfig: existingConfig,
      closingMessage: "Glad we could help!",
    });
  });

  it("returns null for a Workspace with no closing message set", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue(existingConfig);
    mocks.workspaceFindUnique.mockResolvedValue({ closingMessage: null });

    const result = await getWebWidgetConfig();

    expect(result.closingMessage).toBeNull();
  });

  it("throws when the Workspace has no Web Widget configuration", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue(null);
    mocks.workspaceFindUnique.mockResolvedValue({ closingMessage: null });

    await expect(getWebWidgetConfig()).rejects.toBeInstanceOf(WebWidgetConfigNotFoundError);
  });
});

describe("updateWebWidgetConfig", () => {
  beforeEach(resetMocks);

  it("updates the configuration and the Workspace's closing message together", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue({ id: "config-1" });
    mocks.webWidgetConfigUpdate.mockResolvedValue({
      ...existingConfig,
      botName: "New Bot",
      allowedDomains: ["example.com", "docs.example.com"],
    });
    mocks.workspaceUpdate.mockResolvedValue({ closingMessage: "See you next time!" });

    const result = await updateWebWidgetConfig({
      allowedDomains: ["example.com", "docs.example.com"],
      botName: "New Bot",
      closingMessage: "See you next time!",
      primaryColor: "#2563eb",
      welcomeMessage: "Hi! How can we help you today?",
    });

    expect(mocks.webWidgetConfigUpdate).toHaveBeenCalledWith({
      where: { id: "config-1" },
      data: {
        allowedDomains: ["example.com", "docs.example.com"],
        botName: "New Bot",
        primaryColor: "#2563eb",
        welcomeMessage: "Hi! How can we help you today?",
      },
    });
    expect(mocks.workspaceUpdate).toHaveBeenCalledWith({
      where: { id: "workspace-1" },
      data: { closingMessage: "See you next time!" },
      select: { closingMessage: true },
    });
    expect(result.webWidgetConfig.botName).toBe("New Bot");
    expect(result.closingMessage).toBe("See you next time!");
  });

  it("throws without updating when the Workspace has no configuration", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue(null);

    await expect(
      updateWebWidgetConfig({
        allowedDomains: [],
        botName: "New Bot",
        closingMessage: null,
        primaryColor: "#2563eb",
        welcomeMessage: "Hi!",
      }),
    ).rejects.toBeInstanceOf(WebWidgetConfigNotFoundError);

    expect(mocks.webWidgetConfigUpdate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

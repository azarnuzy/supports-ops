import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webWidgetConfigFindFirst: vi.fn(),
  webWidgetConfigUpdate: vi.fn(),
  workspaceFindUnique: vi.fn(),
  workspaceUpdate: vi.fn(),
  transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  requireWorkspaceId: vi.fn(),
  putObject: vi.fn(),
  getObjectUrl: vi.fn(),
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

vi.mock("@repo/storage", () => ({
  createStorage: () => ({
    putObject: mocks.putObject,
    getObjectUrl: mocks.getObjectUrl,
  }),
}));

const {
  WebWidgetConfigNotFoundError,
  getWebWidgetConfig,
  updateWebWidgetConfig,
  uploadWebWidgetLogo,
} = await import("./services");

const existingConfig = {
  id: "config-1",
  widgetKey: "widget_abc123",
  botName: "Support Bot",
  welcomeMessage: "Hi! How can we help you today?",
  primaryColor: "#2563eb",
  allowedDomains: ["example.com"],
  logoKey: null,
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
  mocks.putObject.mockReset();
  mocks.getObjectUrl.mockReset().mockReturnValue(null);
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
      webWidgetConfig: { ...existingConfig, logoUrl: null },
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

  it("leaves the logo reference untouched when not provided", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue({ id: "config-1" });
    mocks.webWidgetConfigUpdate.mockResolvedValue(existingConfig);
    mocks.workspaceUpdate.mockResolvedValue({ closingMessage: null });

    await updateWebWidgetConfig({
      allowedDomains: [],
      botName: "New Bot",
      closingMessage: null,
      primaryColor: "#2563eb",
      welcomeMessage: "Hi!",
    });

    expect(mocks.webWidgetConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ logoKey: expect.anything() }),
      }),
    );
  });

  it("clears the logo reference when logoKey is set to null", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue({ id: "config-1" });
    mocks.webWidgetConfigUpdate.mockResolvedValue({ ...existingConfig, logoKey: null });
    mocks.workspaceUpdate.mockResolvedValue({ closingMessage: null });

    await updateWebWidgetConfig({
      allowedDomains: [],
      botName: "New Bot",
      closingMessage: null,
      logoKey: null,
      primaryColor: "#2563eb",
      welcomeMessage: "Hi!",
    });

    expect(mocks.webWidgetConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ logoKey: null }) }),
    );
  });
});

describe("uploadWebWidgetLogo", () => {
  beforeEach(resetMocks);

  function makeFile(type: string, size: number) {
    return new File([new Uint8Array(size)], "logo.png", { type });
  }

  it("stores the file and persists the logo reference for a valid upload", async () => {
    mocks.requireWorkspaceId.mockReturnValue("workspace-1");
    mocks.webWidgetConfigFindFirst.mockResolvedValue({ id: "config-1" });
    mocks.webWidgetConfigUpdate.mockResolvedValue({ ...existingConfig, logoKey: "some-key" });
    mocks.workspaceFindUnique.mockResolvedValue({ closingMessage: null });

    const file = makeFile("image/png", 1024);
    const result = await uploadWebWidgetLogo(file);

    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(mocks.webWidgetConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "config-1" },
        data: { logoKey: expect.stringContaining("web-widget-logos/workspace-1/") },
      }),
    );
    expect(result.webWidgetConfig.logoKey).toBe("some-key");
  });

  it("rejects an unsupported file type without writing to storage", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue({ id: "config-1" });

    await expect(uploadWebWidgetLogo(makeFile("image/gif", 1024))).rejects.toThrow(
      "Upload a PNG, JPG, or SVG image.",
    );
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.webWidgetConfigUpdate).not.toHaveBeenCalled();
  });

  it("rejects an oversized file without writing to storage", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue({ id: "config-1" });

    await expect(uploadWebWidgetLogo(makeFile("image/png", 3 * 1024 * 1024))).rejects.toThrow(
      "Logo must be between 1 byte and 2MB.",
    );
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.webWidgetConfigUpdate).not.toHaveBeenCalled();
  });

  it("throws when the Workspace has no configuration", async () => {
    mocks.webWidgetConfigFindFirst.mockResolvedValue(null);

    await expect(uploadWebWidgetLogo(makeFile("image/png", 1024))).rejects.toBeInstanceOf(
      WebWidgetConfigNotFoundError,
    );
    expect(mocks.putObject).not.toHaveBeenCalled();
  });
});

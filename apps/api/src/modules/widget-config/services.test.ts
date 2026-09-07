import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../utils/prisma", () => ({
  prisma: {
    webWidgetConfig: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
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

describe("getWebWidgetConfig", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.update.mockReset();
  });

  it("returns the Workspace's Web Widget configuration", async () => {
    mocks.findFirst.mockResolvedValue(existingConfig);

    const result = await getWebWidgetConfig();

    expect(result).toEqual({ webWidgetConfig: existingConfig });
  });

  it("throws when the Workspace has no Web Widget configuration", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(getWebWidgetConfig()).rejects.toBeInstanceOf(WebWidgetConfigNotFoundError);
  });
});

describe("updateWebWidgetConfig", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.update.mockReset();
  });

  it("updates the existing configuration in place", async () => {
    mocks.findFirst.mockResolvedValue({ id: "config-1" });
    mocks.update.mockResolvedValue({
      ...existingConfig,
      botName: "New Bot",
      allowedDomains: ["example.com", "docs.example.com"],
    });

    const result = await updateWebWidgetConfig({
      allowedDomains: ["example.com", "docs.example.com"],
      botName: "New Bot",
      primaryColor: "#2563eb",
      welcomeMessage: "Hi! How can we help you today?",
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "config-1" },
      data: {
        allowedDomains: ["example.com", "docs.example.com"],
        botName: "New Bot",
        primaryColor: "#2563eb",
        welcomeMessage: "Hi! How can we help you today?",
      },
    });
    expect(result.webWidgetConfig.botName).toBe("New Bot");
  });

  it("throws without updating when the Workspace has no configuration", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      updateWebWidgetConfig({
        allowedDomains: [],
        botName: "New Bot",
        primaryColor: "#2563eb",
        welcomeMessage: "Hi!",
      }),
    ).rejects.toBeInstanceOf(WebWidgetConfigNotFoundError);

    expect(mocks.update).not.toHaveBeenCalled();
  });
});

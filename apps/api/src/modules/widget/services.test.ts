import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Only the pure helpers live here. Everything that touches the Session, its
 * Agent Memory, or its Message counter is covered against a real database in
 * `services.db.test.ts`, because those are the rules a mocked Prisma client
 * agrees with whether they hold or not.
 */
const mocks = vi.hoisted(() => ({ getObjectUrl: vi.fn() }));

vi.mock("../../utils/prisma", () => ({ isUniqueConstraintError: () => false, unscopedPrisma: {} }));
vi.mock("../../config", () => ({ classificationConfig: {}, storageConfig: {} }));
vi.mock("@repo/storage", () => ({ createStorage: () => ({ getObjectUrl: mocks.getObjectUrl }) }));
vi.mock("@repo/ai-agent", () => ({
  classifyMessage: vi.fn(),
  createClassificationModel: vi.fn(),
}));
vi.mock("./realtime", () => ({
  publishTicketQueueEvent: vi.fn(),
  publishWidgetEvent: vi.fn(),
}));

const { customerRequestedHuman, toPublicWidgetConfig } = await import("./services");

describe("customerRequestedHuman", () => {
  it.each([
    "I want to speak with a person.",
    "Please connect me to a human agent.",
    "Saya mau bicara dengan human.",
    "Tolong hubungkan saya ke CS.",
  ])("recognizes an explicit request in natural language: %s", (content) => {
    expect(customerRequestedHuman(content)).toBe(true);
  });

  it("does not treat an ordinary support question as an escalation request", () => {
    expect(customerRequestedHuman("Where can I download my invoice?")).toBe(false);
  });
});

describe("toPublicWidgetConfig", () => {
  beforeEach(() => {
    mocks.getObjectUrl.mockReset();
  });

  const baseConfig = {
    botName: "Support Bot",
    primaryColor: "#2563eb",
    welcomeMessage: "Hi! How can we help you today?",
  };

  it("includes the logo URL when a logo reference is set", () => {
    mocks.getObjectUrl.mockReturnValue("https://cdn.example.com/logo.png");

    expect(toPublicWidgetConfig({ ...baseConfig, logoKey: "web-widget-logos/w1/logo.png" })).toEqual(
      { ...baseConfig, logoUrl: "https://cdn.example.com/logo.png" },
    );
  });

  it("returns a null logo URL when no logo reference is set", () => {
    expect(toPublicWidgetConfig({ ...baseConfig, logoKey: null })).toEqual({
      ...baseConfig,
      logoUrl: null,
    });
  });
});

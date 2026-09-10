import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));

vi.mock("../../utils/prisma", () => ({
  prisma: { tool: { findFirst: mocks.findFirst, update: mocks.update } },
}));
vi.mock("../../utils/workspace-context", () => ({ requireWorkspaceId: () => "workspace-1" }));
vi.mock("../../config", () => ({ toolEncryptionConfig: { masterKey: "key" } }));
vi.mock("./secrets", () => ({ encryptToolSecret: (value: string) => `encrypted:${value}` }));

const { getHttpTool, updateHttpTool } = await import("./services");

const storedTool = {
  createdAt: new Date("2026-01-01T00:00:00Z"),
  description: "Lookup a subscription",
  enabled: true,
  httpConfig: {
    bearerTokenEncrypted: "encrypted:top-secret",
    method: "GET",
    secretHeadersEncrypted: "encrypted:also-secret",
    url: "https://example.com/subscription",
  },
  id: "tool-1",
  inputSchema: { type: "object" },
  name: "getSubscription",
  risk: "READ_ONLY",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  mocks.findFirst.mockReset().mockResolvedValue(storedTool);
  mocks.update.mockReset().mockResolvedValue(storedTool);
});

describe("HTTP Tool secrets", () => {
  it("returns only presence flags", async () => {
    const result = await getHttpTool("tool-1");
    expect(result).toMatchObject({ hasBearerToken: true, hasSecretHeaders: true });
    expect(JSON.stringify(result)).not.toContain("top-secret");
    expect(JSON.stringify(result)).not.toContain("also-secret");
  });

  it("preserves omitted secrets during update", async () => {
    await updateHttpTool("tool-1", {
      description: storedTool.description,
      enabled: true,
      inputSchema: { type: "object" },
      method: "GET",
      name: storedTool.name,
      risk: "READ_ONLY",
      url: storedTool.httpConfig.url,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          httpConfig: {
            update: expect.objectContaining({
              bearerTokenEncrypted: "encrypted:top-secret",
              secretHeadersEncrypted: "encrypted:also-secret",
            }),
          },
        }),
      }),
    );
  });
});

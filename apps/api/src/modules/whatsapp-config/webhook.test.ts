import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));

vi.mock("../../utils/prisma", () => ({
  unscopedPrisma: {
    whatsAppConfig: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

const { whatsAppWebhookRouter } = await import("./webhook");

describe("WhatsApp webhook verification", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.update.mockReset();
  });

  it("returns Meta's challenge only for a generated verify token", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "config-1" }).mockResolvedValueOnce(null);
    mocks.update.mockResolvedValue({});

    const accepted = await whatsAppWebhookRouter.request(
      "/?hub.mode=subscribe&hub.verify_token=generated-token&hub.challenge=12345",
    );
    expect(accepted.status).toBe(200);
    await expect(accepted.text()).resolves.toBe("12345");
    expect(mocks.update).toHaveBeenCalledWith({
      data: { webhookVerifiedAt: expect.any(Date) },
      where: { id: "config-1" },
    });

    const rejected = await whatsAppWebhookRouter.request(
      "/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    );
    expect(rejected.status).toBe(403);
  });
});

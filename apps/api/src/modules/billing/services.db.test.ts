import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkspaceContext } from "../../utils/workspace-context";

const mayar = vi.hoisted(() => ({
  createMayarPayment: vi.fn(),
  fetchMayarPayment: vi.fn(),
}));
vi.mock("./mayar", () => ({ ...mayar, MayarUnavailableError: class extends Error {} }));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let services: typeof import("./services");
let workspaceId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  services = await import("./services");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  vi.clearAllMocks();
  workspaceId = randomUUID();
  await prisma.workspace.create({
    data: { id: workspaceId, name: "Demo", slug: `demo-${workspaceId.slice(0, 8)}` },
  });
});

async function balance() {
  const { _sum } = await prisma.creditLedgerEntry.aggregate({
    _sum: { credits: true },
    where: { workspaceId },
  });
  return _sum.credits ?? 0;
}

async function checkout(packId = "credits-1000") {
  mayar.createMayarPayment.mockResolvedValueOnce({ id: "mayar-1", link: "https://pay.test/1" });
  return withWorkspaceContext(workspaceId, () =>
    services.createTopUpCheckout({ adminEmail: "admin@example.com", packId }),
  );
}

describe("Top-Up Payments", () => {
  it("creates a pending checkout at the pack's price without adding Credits", async () => {
    const payment = await checkout();
    expect(payment).toMatchObject({ amountIdr: 250_000, credits: 1_000, status: "PENDING" });
    expect(mayar.createMayarPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250_000, email: "admin@example.com" }),
    );
    expect(await balance()).toBe(0);
  });

  it("rejects an unknown pack", async () => {
    await expect(checkout("credits-999")).rejects.toBeInstanceOf(services.UnknownTopUpPackError);
  });

  it("adds Credits exactly once when Mayar confirms, however often the webhook repeats", async () => {
    await checkout();
    mayar.fetchMayarPayment.mockResolvedValue({ amount: 250_000, id: "mayar-1", status: "paid" });

    await services.handleMayarWebhook({ data: { productId: "mayar-1" } });
    await services.handleMayarWebhook({ data: { productId: "mayar-1" } });

    expect(await balance()).toBe(1_000);
    const billing = await withWorkspaceContext(workspaceId, () => services.getBilling());
    expect(billing.payments[0]).toMatchObject({ checkoutUrl: null, status: "PAID" });
  });

  it("never trusts the webhook body: an unpaid or mismatched payment adds nothing", async () => {
    await checkout();
    mayar.fetchMayarPayment.mockResolvedValueOnce({
      amount: 250_000,
      id: "mayar-1",
      status: "unpaid",
    });
    await services.handleMayarWebhook({ event: "payment.received", data: { id: "mayar-1" } });
    mayar.fetchMayarPayment.mockResolvedValueOnce({ amount: 1_000, id: "mayar-1", status: "paid" });
    await services.handleMayarWebhook({ event: "payment.received", data: { id: "mayar-1" } });

    expect(await balance()).toBe(0);
  });

  it("picks up a paid checkout on the Billing page when the webhook never came", async () => {
    await checkout();
    mayar.fetchMayarPayment.mockResolvedValue({ amount: 250_000, id: "mayar-1", status: "paid" });

    const billing = await withWorkspaceContext(workspaceId, () => services.getBilling());

    expect(billing.balance).toBe(1_000);
    expect(billing.payments[0].status).toBe("PAID");
  });

  it("shows an unpaid checkout past its expiry as expired, without a link", async () => {
    const payment = await checkout();
    await prisma.topUpPayment.update({
      data: { expiresAt: new Date(Date.now() - 1_000) },
      where: { id: payment.id },
    });

    const billing = await withWorkspaceContext(workspaceId, () => services.getBilling());

    expect(billing.payments[0]).toMatchObject({ checkoutUrl: null, status: "EXPIRED" });
    expect(mayar.fetchMayarPayment).not.toHaveBeenCalled();
  });
});

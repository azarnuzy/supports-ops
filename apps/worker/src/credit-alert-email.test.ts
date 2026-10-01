import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrganization: vi.fn(),
  findUsers: vi.fn(),
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("./prisma", () => ({
  prisma: {
    organization: { findUniqueOrThrow: mocks.findOrganization },
    user: { findMany: mocks.findUsers },
  },
}));
vi.mock("./session-email", () => ({ sendEmail: mocks.sendEmail }));

import { sendCreditAlertEmail } from "./credit-alert-email";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOrganization.mockResolvedValue({ name: "Shared Organization" });
  mocks.findUsers.mockResolvedValue([{ email: "owner@example.com" }]);
});

it("sends one Organization alert to its Admin even when another Workspace spent", async () => {
  await sendCreditAlertEmail({
    kind: "LOW_BALANCE",
    organizationId: "org-1",
    workspaceId: "workspace-2",
  });

  expect(mocks.findUsers).toHaveBeenCalledWith({
    select: { email: true },
    where: { deletedAt: null, isOrganizationAdmin: true, organizationId: "org-1" },
  });
  expect(mocks.sendEmail).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      subject: "Shared Organization: AI Credits running low",
      to: "owner@example.com",
      workspaceId: "workspace-2",
    }),
  );
});

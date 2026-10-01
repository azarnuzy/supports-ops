import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../auth/instance", () => ({
  auth: {
    api: { getSession: mocks.getSession, signInEmail: vi.fn() },
    handler: vi.fn(),
  },
}));
vi.mock("../../utils/prisma", () => ({
  unscopedPrisma: {
    user: {
      findUnique: vi.fn(async () => ({
        deletedAt: null,
        isOrganizationAdmin: false,
        organizationId: "org-1",
        workspaceId: "ws-1",
      })),
    },
    workspace: { findUnique: vi.fn(async () => ({ deletedAt: null, organizationId: "org-1" })) },
    workspaceMembership: {
      findFirst: vi.fn(async () => ({ workspaceId: "ws-1" })),
      findUnique: vi.fn(async () => ({ role: "HUMAN_AGENT" })),
    },
  },
}));

const humanAgent = {
  email: "agent@demo.supportops.dev",
  id: "user-1",
  name: "Rian Wibowo",
  role: "HUMAN_AGENT",
  organizationId: "org-1",
  workspaceId: "ws-1",
};

describe("AI Usage is Admin-only", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({ session: { id: "session-1" }, user: humanAgent });
  });

  it("forbids a Human Agent from the summary", async () => {
    const res = await app.request("/ai-usage/summary");
    expect(res.status).toBe(403);
  });

  it("forbids a Human Agent from the Credit Ledger", async () => {
    const res = await app.request("/ai-usage/ledger");
    expect(res.status).toBe(403);
  });

  it("forbids a Human Agent from Organization AI Usage", async () => {
    const res = await app.request("/ai-usage/organization-summary");
    expect(res.status).toBe(403);
  });

  it("forbids a signed-out request", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await app.request("/ai-usage/summary")).status).toBe(403);
    expect((await app.request("/ai-usage/ledger")).status).toBe(403);
  });
});

import { type TestDatabase, createTestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ emails: [] as { to: string; text: string }[] }));
vi.mock("../auth/account-email", () => ({
  enqueueAccountEmail: vi.fn(async (job: { to: string; text: string }) => {
    mocks.emails.push(job);
  }),
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;
let registerAdminWorkspace: typeof import("../registration/services").registerAdminWorkspace;

const password = "correct-horse-battery";
const request = (
  path: string,
  init: { method?: string; json?: unknown; cookie?: string; workspace?: string } = {},
) =>
  app.request(path, {
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.workspace ? { "x-workspace-id": init.workspace } : {}),
    },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const tokenFromEmail = () =>
  new URL(mocks.emails.at(-1)?.text.match(/https?:\/\/\S+/)?.[0] ?? "").searchParams.get("token") ??
  "";

async function signIn(email: string, pass = password) {
  const response = await request("/api/auth/sign-in/email", { json: { email, password: pass } });
  return response.status === 200 ? cookieOf(response) : null;
}

async function register(email: string, name: string) {
  const result = await registerAdminWorkspace({ email, name, password }, { emailVerified: true });
  return { ...result, cookie: (await signIn(email)) ?? "" };
}

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ registerAdminWorkspace } = await import("../registration/services"));
  ({ app } = await import("../../app"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  mocks.emails.length = 0;
  await truncateAll(prisma);
});

describe("invitations", () => {
  it("invite → emailed link → accept signs the invitee in with the role, verified", async () => {
    const admin = await register("admin@example.com", "Ada");
    const invited = await request("/invitations", {
      cookie: admin.cookie,
      json: { email: "Grace@Example.com", role: "HUMAN_AGENT" },
    });
    expect(invited.status).toBe(201);
    expect(mocks.emails.at(-1)?.to).toBe("grace@example.com");
    const token = tokenFromEmail();

    const preview = await request(`/invitations/by-token/${token}`, { method: "GET" });
    expect(await preview.json()).toMatchObject({ invitedByName: "Ada", role: "HUMAN_AGENT" });

    const accepted = await request(`/invitations/by-token/${token}/accept`, {
      json: { name: "Grace", password },
    });
    expect(accepted.status).toBe(200);
    const session = await request("/session", { method: "GET", cookie: cookieOf(accepted) });
    expect(await session.json()).toMatchObject({
      user: { email: "grace@example.com", role: "HUMAN_AGENT", emailVerified: true },
    });
    const membership = await prisma.workspaceMembership.findFirstOrThrow({
      where: { user: { email: "grace@example.com" } },
    });
    expect(membership.workspaceId).toBe(admin.workspace.id);

    const again = await request(`/invitations/by-token/${token}/accept`, {
      json: { name: "Grace", password },
    });
    expect(again.status).toBe(410);
  });

  it("limits an Admin to the current Workspace and lets an Organization Admin pick any", async () => {
    const owner = await register("owner@example.com", "Owner");
    const second = await prisma.workspace.create({
      data: { id: "ws-2", organizationId: owner.organization.id, name: "Second", slug: "second" },
    });
    const staffAdmin = await prisma.user.create({
      data: {
        id: "staff-admin",
        email: "staff@example.com",
        name: "Staff",
        role: "ADMIN",
        emailVerified: true,
        organizationId: owner.organization.id,
      },
    });
    await prisma.workspaceMembership.create({
      data: { userId: staffAdmin.id, workspaceId: owner.workspace.id, role: "ADMIN" },
    });
    await prisma.account.create({
      data: {
        id: "staff-account",
        accountId: staffAdmin.id,
        providerId: "credential",
        userId: staffAdmin.id,
        password: (await prisma.account.findFirstOrThrow({ where: { userId: owner.user.id } }))
          .password,
      },
    });
    const staffCookie = (await signIn("staff@example.com")) ?? "";

    const refused = await request("/invitations", {
      cookie: staffCookie,
      json: { email: "x@example.com", role: "ADMIN", workspaceId: second.id },
    });
    expect(refused.status).toBe(403);

    const allowed = await request("/invitations", {
      cookie: owner.cookie,
      json: { email: "x@example.com", role: "ADMIN", workspaceId: second.id },
    });
    expect(allowed.status).toBe(201);
    expect(
      await prisma.invitation.count({ where: { workspaceId: second.id, email: "x@example.com" } }),
    ).toBe(1);
  });

  it("refuses an email from another Organization with 409", async () => {
    const admin = await register("admin@example.com", "Ada");
    await register("other@example.com", "Other");
    const response = await request("/invitations", {
      cookie: admin.cookie,
      json: { email: "other@example.com", role: "ADMIN" },
    });
    expect(response.status).toBe(409);
    expect(await prisma.invitation.count()).toBe(0);
  });

  it("adds an active user of the same Organization directly and notifies them", async () => {
    const owner = await register("owner@example.com", "Owner");
    const second = await prisma.workspace.create({
      data: { id: "ws-2", organizationId: owner.organization.id, name: "Second", slug: "second" },
    });
    const response = await request("/invitations", {
      cookie: owner.cookie,
      json: { email: "owner@example.com", role: "HUMAN_AGENT", workspaceId: second.id },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "added" });
    expect(await prisma.invitation.count()).toBe(0);
    expect(
      await prisma.workspaceMembership.count({
        where: { userId: owner.user.id, workspaceId: second.id },
      }),
    ).toBe(1);
    expect(mocks.emails.at(-1)?.to).toBe("owner@example.com");
  });

  it("reactivates a soft-deleted user on accept and kills the old password", async () => {
    const admin = await register("admin@example.com", "Ada");
    const staff = await prisma.user.create({
      data: {
        id: "gone",
        email: "gone@example.com",
        name: "Gone",
        role: "HUMAN_AGENT",
        emailVerified: true,
        organizationId: admin.organization.id,
        deletedAt: new Date(),
      },
    });
    await prisma.account.create({
      data: {
        id: "gone-acc",
        accountId: staff.id,
        providerId: "credential",
        userId: staff.id,
        password: "stale",
      },
    });

    await request("/invitations", {
      cookie: admin.cookie,
      json: { email: "gone@example.com", role: "ADMIN" },
    });
    const accepted = await request(`/invitations/by-token/${tokenFromEmail()}/accept`, {
      json: { name: "Back Again", password: "brand-new-password" },
    });
    expect(accepted.status).toBe(200);
    expect(await prisma.user.count({ where: { email: "gone@example.com" } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({
      deletedAt: null,
      role: "ADMIN",
      name: "Back Again",
    });
    expect(await signIn("gone@example.com", "stale")).toBeNull();
    expect(await signIn("gone@example.com", "brand-new-password")).not.toBeNull();
  });

  it("refuses revoked and expired links; resend renews expiry and kills the old link", async () => {
    const admin = await register("admin@example.com", "Ada");
    const invite = () =>
      request("/invitations", {
        cookie: admin.cookie,
        json: { email: "new@example.com", role: "ADMIN" },
      });
    const accept = (token: string) =>
      request(`/invitations/by-token/${token}/accept`, { json: { name: "New", password } });

    const created = (await (await invite()).json()) as { invitationId: string };
    const first = tokenFromEmail();
    await prisma.invitation.update({
      where: { id: created.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await accept(first)).status).toBe(410);

    const resend = await request(`/invitations/${created.invitationId}/resend`, {
      cookie: admin.cookie,
    });
    expect(resend.status).toBe(200);
    const second = tokenFromEmail();
    expect(second).not.toBe(first);
    expect((await accept(first)).status).toBe(410);

    const revoke = await request(`/invitations/${created.invitationId}`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(revoke.status).toBe(200);
    expect((await accept(second)).status).toBe(410);
    expect(await prisma.user.count({ where: { email: "new@example.com" } })).toBe(0);
  });

  it("keeps one pending Invitation per email and Workspace", async () => {
    const admin = await register("admin@example.com", "Ada");
    for (const role of ["ADMIN", "HUMAN_AGENT"])
      await request("/invitations", {
        cookie: admin.cookie,
        json: { email: "new@example.com", role },
      });
    expect(await prisma.invitation.count()).toBe(1);
    const list = await request("/invitations", { method: "GET", cookie: admin.cookie });
    expect(((await list.json()) as { invitations: unknown[] }).invitations).toHaveLength(1);
  });

  it("no longer lets an Admin create staff with a password", async () => {
    const admin = await register("admin@example.com", "Ada");
    const response = await request("/users", {
      cookie: admin.cookie,
      json: { email: "x@example.com", name: "X", password, role: "HUMAN_AGENT" },
    });
    expect(response.status).toBe(404);
  });
});

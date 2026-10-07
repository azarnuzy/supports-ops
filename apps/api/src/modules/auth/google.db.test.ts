import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;

const origin = "http://localhost:8000";
const realFetch = globalThis.fetch;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ app } = await import("../../app"));
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

/** Google itself is never called: only its token endpoint is answered, with an ID token for `profile`. */
function stubGoogle(profile: { email: string; name: string }) {
  const idToken = [
    { alg: "none" },
    { sub: `google-${profile.email}`, ...profile, email_verified: true, aud: "google-client" },
  ]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");

  vi.stubGlobal("fetch", async (input: Request | string | URL, init?: RequestInit) => {
    if (
      String(input instanceof Request ? input.url : input).startsWith(
        "https://oauth2.googleapis.com/token",
      )
    )
      return Response.json({ access_token: "token", id_token: `${idToken}.`, expires_in: 3600 });
    return realFetch(input, init);
  });
}

async function continueWithGoogle(
  profile: { email: string; name: string },
  invitationToken?: string,
) {
  stubGoogle(profile);
  const start = await app.request("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      provider: "google",
      callbackURL: "http://localhost:3000/",
      additionalData: invitationToken ? { invitationToken } : undefined,
    }),
  });
  const { url } = (await start.json()) as { url: string };
  const cookie = start.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const state = new URL(url).searchParams.get("state");
  const callback = await app.request(`/api/auth/callback/google?code=abc&state=${state}`, {
    headers: { cookie, origin },
  });
  const session = callback.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { callback, session };
}

it("gives a new Google user their own Organization, Workspace and Trial Grant, verified, with no email sent", async () => {
  const { callback, session } = await continueWithGoogle({
    email: "new@example.com",
    name: "Nia New",
  });

  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("http://localhost:3000/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "new@example.com" },
    include: { memberships: true, accounts: true },
  });
  expect(user).toMatchObject({
    name: "Nia New",
    emailVerified: true,
    role: "ADMIN",
    isOrganizationAdmin: true,
    verificationEmailSentAt: null,
  });
  expect(user.accounts.map((a) => a.providerId)).toEqual(["google"]);
  expect(user.memberships).toHaveLength(1);
  expect(await prisma.organization.count()).toBe(1);
  expect(
    await prisma.creditLedgerEntry.count({
      where: { workspaceId: user.memberships[0]?.workspaceId, type: "TRIAL_GRANT" },
    }),
  ).toBe(1);

  const me = await app.request("/session", { headers: { cookie: session } });
  expect(me.status).toBe(200);
  expect(((await me.json()) as { user: { hasPassword: boolean } }).user.hasPassword).toBe(false);
});

it("signs a verified form user into their existing account instead of creating another", async () => {
  const { registerAdminWorkspace } = await import("../registration/services");
  const { user } = await registerAdminWorkspace(
    { email: "ada@example.com", name: "Ada", password: "correct-horse-battery" },
    { emailVerified: true },
  );

  const { callback } = await continueWithGoogle({ email: "ada@example.com", name: "Ada L" });

  expect(callback.headers.get("location")).toBe("http://localhost:3000/");
  expect(await prisma.user.count()).toBe(1);
  expect(await prisma.organization.count()).toBe(1);
  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  expect(accounts.map((a) => a.providerId).sort()).toEqual(["credential", "google"]);
});

it("lets a Google-only user set a password and then sign in with it", async () => {
  const { session } = await continueWithGoogle({ email: "g@example.com", name: "Gus" });
  const json = { "content-type": "application/json", origin };

  const set = await app.request("/profile/password", {
    method: "POST",
    headers: { ...json, cookie: session },
    body: JSON.stringify({ newPassword: "brand-new-password" }),
  });
  expect(set.status).toBe(200);

  const again = await app.request("/profile/password", {
    method: "POST",
    headers: { ...json, cookie: session },
    body: JSON.stringify({ newPassword: "another-password" }),
  });
  expect(again.status).toBe(409);

  const signIn = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email: "g@example.com", password: "brand-new-password" }),
  });
  expect(signIn.status).toBe(200);
});

it("reports Google as enabled only because its credentials are configured", async () => {
  const res = await app.request("/auth-providers", { headers: { origin } });
  expect(await res.json()).toEqual({ google: true });
});

async function invite(email: string, token = "invite-token") {
  const { createHash } = await import("node:crypto");
  const { registerAdminWorkspace } = await import("../registration/services");
  const { user, workspace } = await registerAdminWorkspace(
    { email: "boss@example.com", name: "Boss", password: "correct-horse-battery" },
    { emailVerified: true },
  );
  await prisma.invitation.create({
    data: {
      id: crypto.randomUUID(),
      email,
      workspaceId: workspace.id,
      role: "HUMAN_AGENT",
      invitedById: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return { workspace, organizationId: user.organizationId };
}

it("joins the inviting Workspace when Google's email matches the Invitation", async () => {
  const { workspace, organizationId } = await invite("invitee@example.com");

  const { callback } = await continueWithGoogle(
    { email: "invitee@example.com", name: "Ivy" },
    "invite-token",
  );

  expect(callback.headers.get("location")).toBe("http://localhost:3000/");
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: "invitee@example.com" },
    include: { memberships: true },
  });
  expect(user).toMatchObject({ role: "HUMAN_AGENT", organizationId, isOrganizationAdmin: false });
  expect(user.memberships).toMatchObject([{ workspaceId: workspace.id, role: "HUMAN_AGENT" }]);
  expect(await prisma.organization.count()).toBe(1);
  expect((await prisma.invitation.findFirstOrThrow()).acceptedAt).not.toBeNull();
});

it("refuses a different Google email, naming the invited address, and creates no User", async () => {
  await invite("invitee@example.com");

  const { callback } = await continueWithGoogle(
    { email: "other@example.com", name: "Oz" },
    "invite-token",
  );

  const location = new URL(callback.headers.get("location") ?? "");
  expect(location.searchParams.get("error")).toBe("invitation_email_mismatch:invitee@example.com");
  expect(await prisma.user.findUnique({ where: { email: "other@example.com" } })).toBeNull();
  expect((await prisma.invitation.findFirstOrThrow()).acceptedAt).toBeNull();
});

it("creates no Organization for Google registration with a pending Invitation and hands over a token", async () => {
  await invite("invitee@example.com");

  const { callback } = await continueWithGoogle({ email: "invitee@example.com", name: "Ivy" });

  const location = new URL(callback.headers.get("location") ?? "");
  const [code, token = ""] = (location.searchParams.get("error") ?? "").split(":");
  expect(code).toBe("invitation_pending");
  expect(token).not.toBe("");
  expect(await prisma.user.findUnique({ where: { email: "invitee@example.com" } })).toBeNull();
  expect(await prisma.organization.count()).toBe(1);

  const preview = await app.request(`/invitations/by-token/${token}`, { headers: { origin } });
  expect(preview.status).toBe(200);
});

it("creates no Organization for form registration with a pending Invitation", async () => {
  await invite("invitee@example.com");

  const res = await app.request("/register", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: "invitee@example.com", name: "Ivy", password: "correct-horse-battery" }),
  });

  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ error: "invitation_pending" });
  expect(await prisma.user.findUnique({ where: { email: "invitee@example.com" } })).toBeNull();
  expect(await prisma.organization.count()).toBe(1);
});

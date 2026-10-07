import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;

const email = "admin@example.com";
const oldPassword = "old-password-123";
const newPassword = "new-password-456";
const origin = "http://localhost:8000";

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ app } = await import("../../app"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  const { registerAdminWorkspace } = await import("../registration/services");
  await registerAdminWorkspace(
    { email, name: "Ada", password: oldPassword },
    { emailVerified: true },
  );
});

const post = (path: string, body: object, cookie = "") =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify(body),
  });

async function signIn(password: string) {
  const res = await post("/api/auth/sign-in/email", { email, password });
  const cookie = (res.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { res, cookie };
}

const me = (cookie: string) => app.request("/session", { headers: { cookie } });

it("changes the password, signs out other sessions and keeps the current one", async () => {
  const current = await signIn(oldPassword);
  const other = await signIn(oldPassword);

  const res = await post(
    "/api/auth/change-password",
    { currentPassword: oldPassword, newPassword, revokeOtherSessions: true },
    current.cookie,
  );
  expect(res.status).toBe(200);

  const refreshed = (res.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
  expect((await me(refreshed || current.cookie)).status).toBe(200);
  expect((await me(other.cookie)).status).toBe(401);
  expect((await signIn(newPassword)).res.status).toBe(200);
  expect((await signIn(oldPassword)).res.status).toBe(401);
});

it("refuses a wrong current password", async () => {
  const current = await signIn(oldPassword);
  const res = await post(
    "/api/auth/change-password",
    { currentPassword: "not-the-password", newPassword, revokeOtherSessions: true },
    current.cookie,
  );
  expect(res.status).toBe(400);
  expect((await signIn(oldPassword)).res.status).toBe(200);
});

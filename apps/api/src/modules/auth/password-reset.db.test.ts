import { type TestDatabase, createTestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ emails: [] as { to: string; text: string }[] }));
vi.mock("./account-email", () => ({
  enqueueAccountEmail: vi.fn(async (job: { to: string; text: string }) => {
    mocks.emails.push(job);
  }),
}));

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let app: typeof import("../../app").app;

const credentials = { email: "ada@example.com", name: "Ada", password: "correct-horse-battery" };
const newPassword = "a-brand-new-password";
const signIn = (password: string, ip: string) =>
  post("/api/auth/sign-in/email", { ...credentials, password }, { "x-forwarded-for": ip });
const post = (path: string, json: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(json),
  });
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
let nextIp = 1;
const requestReset = (email: string, ip = `10.0.1.${nextIp++}`) =>
  post(
    "/api/auth/request-password-reset",
    { email, redirectTo: "http://localhost:3000/reset-password" },
    { "x-forwarded-for": ip },
  );
const resetToken = async () => {
  await vi.waitFor(() => expect(mocks.emails.length).toBeGreaterThan(0));
  return mocks.emails.at(-1)?.text.match(/reset-password\/([^?\s]+)/)?.[1] ?? "";
};

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  vi.stubEnv("AUTH_RATE_LIMIT", "on");
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  ({ app } = await import("../../app"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  mocks.emails.length = 0;
  await truncateAll(prisma);
  await post("/register", credentials);
  await prisma.user.update({ where: { email: credentials.email }, data: { emailVerified: true } });
  mocks.emails.length = 0;
});

describe("password reset", () => {
  it("resets by emailed link, signs in, and rejects the old session", async () => {
    const oldSession = cookieOf(await signIn(credentials.password, "10.9.0.1"));
    expect((await app.request("/session", { headers: { cookie: oldSession } })).status).toBe(200);

    const requested = await requestReset(credentials.email);
    expect(requested.status).toBe(200);
    const token = await resetToken();
    expect(mocks.emails).toHaveLength(1);

    const reset = await post("/api/auth/reset-password", { token, newPassword });
    expect(reset.status).toBe(200);

    expect((await signIn(credentials.password, "10.9.0.2")).status).toBe(401);
    const signedIn = await signIn(newPassword, "10.9.0.3");
    expect(signedIn.status).toBe(200);
    const freshSession = cookieOf(signedIn);
    expect((await app.request("/session", { headers: { cookie: freshSession } })).status).toBe(200);

    // Drop the signed session-data cookie so the lookup must hit the (now deleted) session row.
    const stale = oldSession
      .split("; ")
      .filter((part) => part.includes("session_token"))
      .join("; ");
    expect((await app.request("/session", { headers: { cookie: stale } })).status).toBe(401);
  });

  it("answers known and unknown emails identically and emails only the known one", async () => {
    const known = await requestReset(credentials.email);
    const unknown = await requestReset("nobody@example.com");

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    await resetToken();
    expect(mocks.emails).toHaveLength(1);
    expect(mocks.emails[0]?.to).toBe(credentials.email);
  });

  it("refuses a reused link and an expired link", async () => {
    await requestReset(credentials.email);
    const token = await resetToken();
    expect((await post("/api/auth/reset-password", { token, newPassword })).status).toBe(200);
    expect((await post("/api/auth/reset-password", { token, newPassword })).status).toBe(400);

    mocks.emails.length = 0;
    await requestReset(credentials.email);
    const expiring = await resetToken();
    await prisma.verification.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect((await post("/api/auth/reset-password", { token: expiring, newPassword })).status).toBe(
      400,
    );
  });

  it("rate-limits repeated requests", async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 5; attempt++)
      statuses.push((await requestReset(credentials.email, "10.0.0.9")).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it("gives operators no reset-by-email route", async () => {
    const response = await post("/operator/auth/request-password-reset", {
      email: credentials.email,
      redirectTo: "http://localhost:3000/reset-password",
    });
    expect(response.status).toBe(400);
    expect(mocks.emails).toHaveLength(0);
  });
});

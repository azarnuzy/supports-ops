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

const credentials = { email: "ada@example.com", name: "Ada", password: "correct-horse-battery" };
const post = (path: string, json: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(json),
  });
const verificationLink = () =>
  new URL(mocks.emails.at(-1)?.text.match(/https?:\/\/\S+/)?.[0] ?? "");

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
  mocks.emails.length = 0;
  await truncateAll(prisma);
});

describe("email verification", () => {
  it("registers, emails one link, and the link signs the user in", async () => {
    const registered = await post("/register", credentials);
    expect(registered.status).toBe(201);
    expect(mocks.emails).toHaveLength(1);

    const blocked = await post("/api/auth/sign-in/email", credentials);
    expect(blocked.status).toBe(403);

    const link = verificationLink();
    const verified = await app.request(link.pathname + link.search);
    expect(verified.status).toBe(302);
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token");

    const session = await app.request("/session", { headers: { cookie } });
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(
      credentials.email,
    );
  });

  it("refuses a resend within 60 seconds and allows it afterwards", async () => {
    await post("/register", credentials);
    const resend = () => post("/api/auth/send-verification-email", { email: credentials.email });

    expect((await resend()).status).toBe(429);
    expect(mocks.emails).toHaveLength(1);

    await prisma.user.update({
      where: { email: credentials.email },
      data: { verificationEmailSentAt: new Date(Date.now() - 61_000) },
    });
    expect((await resend()).status).toBe(200);
    expect(mocks.emails).toHaveLength(2);
  });

  it("answers a repeat registration of an unverified email with 409 and a resend hint", async () => {
    await post("/register", credentials);

    const again = await post("/register", credentials);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe("email_unverified");

    await prisma.user.update({
      where: { email: credentials.email },
      data: { emailVerified: true },
    });
    const verifiedAgain = await post("/register", credentials);
    expect(verifiedAgain.status).toBe(409);
    expect(((await verifiedAgain.json()) as { error: string }).error).toBe("email_in_use");
  });

  it("redirects an expired link with an error and a used link without a session", async () => {
    await post("/register", credentials);
    const link = verificationLink();

    const bad = await app.request(
      `${link.pathname}?token=nope&callbackURL=${link.searchParams.get("callbackURL")}`,
    );
    expect(bad.headers.get("location")).toContain("error=");

    await app.request(link.pathname + link.search);
    const used = await app.request(link.pathname + link.search);
    expect(used.headers.get("location")).not.toContain("error=");
    expect(used.headers.getSetCookie()).toHaveLength(0);
  });
});

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../utils/prisma", () => ({ prisma: {} }));
vi.mock("../../config", () => ({
  evalConfig: { destinationAllowedHosts: [] },
  toolEncryptionConfig: { masterKey: "" },
}));

const { evalDestinationRouter } = await import("./router");

const appAs = (role: string) =>
  new Hono()
    .use("*", async (c, next) => {
      c.set("user" as never, { role } as never);
      await next();
    })
    .route("/", evalDestinationRouter);

describe("evaluation destination access", () => {
  it.each([
    ["GET", "/"],
    ["PUT", "/"],
    ["POST", "/check"],
  ])("forbids a Human Agent on %s %s", async (method, path) => {
    const res = await appAs("HUMAN_AGENT").request(path, { method });
    expect(res.status).toBe(403);
  });
});

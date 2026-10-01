import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptToolSecret } from "../tools/secrets";

const key = Buffer.alloc(32, 1).toString("base64");
const mocks = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn() }));

vi.mock("../../utils/prisma", () => ({
  prisma: {
    evalDestination: { create: mocks.create, findFirst: mocks.find, update: mocks.update },
  },
}));
vi.mock("../../utils/workspace-context", () => ({ requireWorkspaceId: () => "w1" }));
vi.mock("../../config", () => ({
  evalConfig: { destinationAllowedHosts: ["lens.internal"] },
  toolEncryptionConfig: { masterKey: key },
}));

const { assertSafeDestination, UnsafeDestinationError } = await import("./outbound");
const { checkEvalDestination, otlpUrls, saveEvalDestination } = await import("./services");

const publicResolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) as never;

describe("assertSafeDestination", () => {
  it.each([
    ["http://example.com", "HTTPS"],
    ["https://user:pw@example.com", "credentials"],
    ["https://127.0.0.1/x", "public"],
    ["https://[::1]/x", "public"],
    ["https://169.254.169.254/latest", "public"],
    ["not a url", "valid"],
  ])("rejects %s", async (url, reason) => {
    await expect(assertSafeDestination(url, publicResolver, [])).rejects.toThrow(reason);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    const resolve = vi.fn(async () => [{ address: "10.0.0.5", family: 4 }]) as never;
    await expect(assertSafeDestination("https://evil.test", resolve, [])).rejects.toBeInstanceOf(
      UnsafeDestinationError,
    );
  });

  it("allows public HTTPS and deployment-allowlisted private HTTP hosts", async () => {
    await expect(
      assertSafeDestination("https://cloud.langfuse.com", publicResolver, []),
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertSafeDestination("http://lens.internal:3001/api", undefined, ["lens.internal"]),
    ).resolves.toBeInstanceOf(URL);
  });
});

describe("otlpUrls", () => {
  it("derives trace and log signal URLs from a base or a full traces URL", () => {
    const expected = {
      logs: "https://h/api/public/otel/v1/logs",
      traces: "https://h/api/public/otel/v1/traces",
    };
    expect(otlpUrls("https://h/api/public/otel")).toEqual(expected);
    expect(otlpUrls("https://h/api/public/otel/v1/traces/")).toEqual(expected);
  });
});

describe("saveEvalDestination", () => {
  beforeEach(() => {
    mocks.find.mockReset();
    mocks.create.mockReset();
    mocks.update.mockReset();
  });

  it("encrypts credentials and returns only last-four hints", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.create.mockImplementation(async ({ data }) => data);
    const result = await saveEvalDestination({
      backend: "LANGFUSE",
      dashboardUrl: "https://cloud.langfuse.com/project/1",
      endpoint: "https://8.8.8.8/api/public/otel",
      publicKey: "pk-lf-1234",
      secretKey: "sk-lf-5678",
    });
    const stored = mocks.create.mock.calls[0]?.[0].data;
    expect(stored.credentialsEncrypted).not.toContain("sk-lf-5678");
    expect(JSON.stringify(result)).not.toContain("sk-lf-5678");
    expect(result.evalDestination).toMatchObject({
      publicKeyLastFour: "1234",
      secretKeyLastFour: "5678",
    });
  });

  it("requires credentials on first save and blocks unsafe endpoints", async () => {
    mocks.find.mockResolvedValue(null);
    const base = {
      backend: "LENS",
      dashboardUrl: "https://d.example",
      endpoint: "https://8.8.8.8",
    } as const;
    await expect(saveEvalDestination(base)).rejects.toThrow("both");
    await expect(
      saveEvalDestination({
        ...base,
        endpoint: "https://127.0.0.1",
        publicKey: "a",
        secretKey: "b",
      }),
    ).rejects.toBeInstanceOf(UnsafeDestinationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps stored credentials when an update omits them", async () => {
    mocks.find.mockResolvedValue({ id: "d1" });
    mocks.update.mockImplementation(async ({ data }) => ({
      ...data,
      publicKeyLastFour: "1234",
      secretKeyLastFour: "5678",
    }));
    await saveEvalDestination({
      backend: "LENS",
      dashboardUrl: "https://d.example",
      endpoint: "https://8.8.8.8",
    });
    expect(mocks.update.mock.calls[0]?.[0].data).not.toHaveProperty("credentialsEncrypted");
  });
});

describe("checkEvalDestination", () => {
  const stored = () => ({
    credentialsEncrypted: encryptToolSecret(
      JSON.stringify({ publicKey: "pk", secretKey: "sk" }),
      key,
    ),
    endpoint: "https://8.8.8.8/api/public/otel",
  });

  it("separates trace acceptance from evaluation-evidence compatibility, without redirects", async () => {
    mocks.find.mockResolvedValue(stored());
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("no", { status: 404 }));
    await expect(checkEvalDestination(request)).resolves.toEqual({
      credentials: "configured",
      endpoint: "accepted",
      reports: "unsupported",
    });
    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe("https://8.8.8.8/api/public/otel/v1/traces");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("pk:sk").toString("base64")}`,
    );
  });

  it("reports rejected credentials and does not probe reports", async () => {
    mocks.find.mockResolvedValue(stored());
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 }));
    await expect(checkEvalDestination(request)).resolves.toMatchObject({
      endpoint: "unauthorized",
      reports: "unchecked",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not call a destination that has become unsafe", async () => {
    mocks.find.mockResolvedValue({ ...stored(), endpoint: "https://10.0.0.1/otel" });
    const request = vi.fn<typeof fetch>();
    await expect(checkEvalDestination(request)).resolves.toMatchObject({ endpoint: "blocked" });
    expect(request).not.toHaveBeenCalled();
  });
});

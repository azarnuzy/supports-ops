import { describe, expect, it } from "vitest";
import { externalErrorCode, externalHttpStatus, externalResponseCode } from "./external-errors";

describe("external error metadata", () => {
  it("uses the provider cause without storing its message", () => {
    const provider = Object.assign(new Error("Customer data must not become metadata"), {
      code: "rate_limited",
      status: 429,
    });
    const wrapped = new Error("Reply failed", { cause: provider });

    expect(externalErrorCode(wrapped)).toBe("rate_limited");
    expect(externalHttpStatus(wrapped)).toBe(429);
    expect(externalResponseCode('{"code":"1300","message":"secret"}')).toBe("1300");
    expect(externalResponseCode('{"code":"email@example.com"}')).toBeUndefined();
    expect(externalErrorCode({ code: "unsafe token=value" })).toBe("UNKNOWN");
  });
});

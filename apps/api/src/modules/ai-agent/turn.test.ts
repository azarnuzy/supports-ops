import { describe, expect, it } from "vitest";
import { acknowledgementFor } from "./turn";

describe("acknowledgementFor", () => {
  it("explains a Knowledge conflict without exposing internal routing", () => {
    const message = acknowledgementFor(
      "Berapa hari batas pengembalian pesanan saya?",
      "CONFLICTING_KNOWLEDGE",
    );

    expect(message).toContain("saling bertentangan");
    expect(message).toContain("Human Agent");
    expect(message).not.toContain("CONFLICTING_KNOWLEDGE");
  });
});

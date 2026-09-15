import { describe, expect, it } from "vitest";
import { replyPrompt } from "./reply";

describe("replyPrompt", () => {
  it("requires complete checkout updates and distinguishes recoverable outcomes from tool failures", () => {
    const prompt = replyPrompt({ attachments: "None.", clarificationCount: 0 });

    expect(prompt).toContain("preserve the full current checkout state");
    expect(prompt).toContain("recoverable validation messages is a business outcome");
  });
});

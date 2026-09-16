import { describe, expect, it } from "vitest";
import { replyPrompt } from "./reply";

describe("replyPrompt", () => {
  it("requires complete checkout updates and distinguishes recoverable outcomes from tool failures", () => {
    const prompt = replyPrompt({ attachments: "None.", clarificationCount: 0 });

    expect(prompt).toContain("preserve the full current checkout state");
    expect(prompt).toContain("recoverable validation messages is a business outcome");
  });

  it("requires Customer-safe escalation reasons and localized resolution closings", () => {
    const prompt = replyPrompt({
      attachments: "None.",
      clarificationCount: 0,
      resolutionMessage: "Glad that's sorted.",
    });

    expect(prompt).toContain("explains in Customer-safe terms why a Human Agent is needed");
    expect(prompt).toContain("in the language of the Customer's latest message");
    expect(prompt).toContain("Glad that's sorted.");
  });

  it("escalates instead of picking a side on conflicting Knowledge or duplicate settled charges", () => {
    const prompt = replyPrompt({ attachments: "None.", clarificationCount: 0 });

    expect(prompt).toContain(
      "do not pick one value, average them, or present both as equally valid",
    );
    expect(prompt).toContain(
      "ESCALATE for payment review even if the Customer explicitly asks you to fix it",
    );
  });
});

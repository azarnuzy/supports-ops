import { describe, expect, it } from "vitest";
import { escalationSummaryPrompt } from "./escalation-summary";
import { suggestedReplyPrompt } from "./suggested-reply";

/**
 * Both Human-Agent-facing prompts used to be pinned to a language by a
 * stopword counter, which scored zero on colloquial Indonesian and fell back
 * to "the Customer's language" — the same unbounded instruction that let
 * replies drift into unrelated languages. The constraint now lives in the
 * prompt text, so it is what these assert.
 */
describe("handoff prompt language rule", () => {
  it("restricts the Escalation Summary to Indonesian or English", () => {
    const prompt = escalationSummaryPrompt();

    expect(prompt).toContain("Indonesian or in English — never in any other language");
    expect(prompt).not.toContain("the Customer's language");
  });

  it("restricts the Suggested Reply to Indonesian or English", () => {
    const prompt = suggestedReplyPrompt({
      customerSafeSources: [],
      internalOnlySources: [],
      previousTicketContext: "",
      currentConversation: "",
    });

    expect(prompt).toContain("Indonesian or in English — never in any other language");
    expect(prompt).toContain("does not identify a language");
  });
});

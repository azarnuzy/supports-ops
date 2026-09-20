import { describe, expect, it } from "vitest";
import { classificationInstructions } from "../classification";
import { escalationSummaryPrompt } from "./escalation-summary";
import { replyPrompt } from "./reply";
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

/**
 * "A language close to it" was the loophole: a small model reads Tagalog as
 * close to Indonesian and answers in it. Every prompt that picks a language
 * names the allowed ones instead.
 */
describe("every language rule names the allowed languages", () => {
  const prompts = [
    classificationInstructions,
    escalationSummaryPrompt(),
    replyPrompt({ attachments: "None.", clarificationCount: 0 }),
    suggestedReplyPrompt({
      customerSafeSources: [],
      internalOnlySources: [],
      previousTicketContext: "",
      currentConversation: "",
    }),
  ];

  it.each(prompts.map((prompt, index) => [index, prompt]))("prompt %i", (_index, prompt) => {
    expect(prompt).toContain("Indonesian, Malay, or a regional language of Indonesia");
    expect(prompt).toContain("such as Tagalog");
    expect(prompt).not.toContain("close to it");
  });
});

/**
 * The greeting reply comes from the classification step, not from the reply
 * prompt — so the Indonesian-or-English rule has to be stated there too, or a
 * "halo selamat sore" gets mirrored into whatever language it resembles.
 */
describe("classification prompt language rule", () => {
  it("restricts classification output to Indonesian or English", () => {
    expect(classificationInstructions).toContain(
      "Indonesian or in English — never in any other language",
    );
    expect(classificationInstructions).not.toContain("in the same language the Customer wrote in");
  });
});

import { describe, expect, it } from "vitest";
import { nextCaseKeys, splitPastedMessages } from "./paste";

describe("splitPastedMessages", () => {
  it("splits on a line of only three hyphens and keeps multi-line messages", () => {
    expect(splitPastedMessages("Hi\nthere\n---\n\n---\nRefund?\n  ---  \nThird")).toEqual([
      "Hi\nthere",
      "Refund?",
      "Third",
    ]);
  });
  it("does not split on hyphens inside text", () => {
    expect(splitPastedMessages("a --- b")).toEqual(["a --- b"]);
  });
});

describe("nextCaseKeys", () => {
  it("skips taken IDs", () => {
    expect(nextCaseKeys(["case-1", "case-3"], 3)).toEqual(["case-2", "case-4", "case-5"]);
  });
});

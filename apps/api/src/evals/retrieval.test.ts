import { describe, expect, it } from "vitest";
import {
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  type ResolvedExpectedPassage,
} from "./retrieval";

const resolved: ResolvedExpectedPassage[] = [
  { chunkIds: ["gold-1", "gold-1-neighbor"], fragment: "1-2 business days", source: "02" },
];

const graded: ResolvedExpectedPassage[] = [
  { chunkIds: ["answer"], fragment: "verify handoff", source: "02" },
  { chunkIds: ["support"], fragment: "first-scan window", grade: 1, source: "02" },
];

describe("recallAtK", () => {
  it("passes when a retrieved chunk matches the expected passage", () => {
    expect(recallAtK(resolved, ["other", "gold-1"])).toBe(1);
  });

  it("fails when nothing retrieved matches", () => {
    expect(recallAtK(resolved, ["other-1", "other-2"])).toBe(0);
  });

  it("averages across multiple labels", () => {
    const twoLabels: ResolvedExpectedPassage[] = [
      ...resolved,
      { chunkIds: ["gold-2"], fragment: "5-10 business days", source: "03" },
    ];
    expect(recallAtK(twoLabels, ["gold-1"])).toBe(0.5);
  });

  it("only requires grade-2 passages", () => {
    expect(recallAtK(graded, ["answer"])).toBe(1);
    expect(recallAtK(graded, ["support"])).toBe(0);
  });
});

describe("precisionAtK", () => {
  it("counts only the relevant share of what was retrieved", () => {
    expect(precisionAtK(resolved, ["gold-1", "other-1", "other-2"])).toBeCloseTo(1 / 3);
  });

  it("counts supporting passages as relevant", () => {
    expect(precisionAtK(graded, ["support", "answer"])).toBe(1);
  });

  it("is zero when nothing was retrieved", () => {
    expect(precisionAtK(resolved, [])).toBe(0);
  });
});

describe("reciprocalRank", () => {
  it("is 1 / rank of the first relevant chunk", () => {
    expect(reciprocalRank(resolved, ["other", "gold-1-neighbor", "gold-1"])).toBe(0.5);
  });

  it("is 0 when nothing relevant was retrieved", () => {
    expect(reciprocalRank(resolved, ["other-1", "other-2"])).toBe(0);
  });
});

describe("ndcgAtK", () => {
  it("is 1 for the ideal ranking", () => {
    expect(ndcgAtK(graded, ["answer", "support", "other"], 5)).toBe(1);
  });

  it("penalizes the answer ranked below supporting context", () => {
    // (1 + 3/log2 3) / (3 + 1/log2 3)
    expect(ndcgAtK(graded, ["support", "answer"], 5)).toBeCloseTo(0.797, 3);
  });

  it("credits a passage once even when neighbors repeat it", () => {
    expect(ndcgAtK(resolved, ["gold-1", "gold-1-neighbor"], 5)).toBe(1);
  });

  it("ignores anything past k", () => {
    expect(ndcgAtK(resolved, ["other", "gold-1"], 1)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  firstRelevantRank,
  precisionAtK,
  recallAtK,
  type ResolvedExpectedPassage,
} from "./retrieval";

const resolved: ResolvedExpectedPassage[] = [
  { chunkIds: ["gold-1", "gold-1-neighbor"], fragment: "1-2 business days", source: "02" },
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
});

describe("precisionAtK", () => {
  it("counts only the relevant share of what was retrieved", () => {
    expect(precisionAtK(resolved, ["gold-1", "other-1", "other-2"])).toBeCloseTo(1 / 3);
  });

  it("is zero when nothing was retrieved", () => {
    expect(precisionAtK(resolved, [])).toBe(0);
  });
});

describe("firstRelevantRank", () => {
  it("reports the 1-based rank of the first relevant chunk", () => {
    expect(firstRelevantRank(resolved, ["other", "gold-1-neighbor", "gold-1"])).toBe(2);
  });

  it("is null when nothing relevant was retrieved", () => {
    expect(firstRelevantRank(resolved, ["other-1", "other-2"])).toBeNull();
  });
});

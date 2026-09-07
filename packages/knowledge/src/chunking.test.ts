import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking";

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    const result = chunkText("Click the forgot password link on the login page.");

    expect(result).toEqual([
      { content: "Click the forgot password link on the login page.", position: 0 },
    ]);
  });

  it("packs adjacent paragraphs into one chunk while under the limit", () => {
    const result = chunkText("First paragraph.\n\nSecond paragraph.", { maxChars: 200 });

    expect(result).toEqual([{ content: "First paragraph.\n\nSecond paragraph.", position: 0 }]);
  });

  it("starts a new chunk once the packed paragraphs would exceed maxChars", () => {
    const result = chunkText(`${"a".repeat(50)}\n\n${"b".repeat(50)}`, { maxChars: 60 });

    expect(result).toEqual([
      { content: "a".repeat(50), position: 0 },
      { content: "b".repeat(50), position: 1 },
    ]);
  });

  it("splits a single paragraph longer than maxChars with overlap", () => {
    const paragraph = "x".repeat(25);

    const result = chunkText(paragraph, { maxChars: 10, overlapChars: 2 });

    expect(result.map((chunk) => chunk.content)).toEqual([
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(9),
    ]);
    expect(result.map((chunk) => chunk.position)).toEqual([0, 1, 2]);
  });

  it("assigns deterministic, contiguous positions", () => {
    const result = chunkText("One.\n\nTwo.\n\nThree.", { maxChars: 5 });

    expect(result.map((chunk) => chunk.position)).toEqual(result.map((_, index) => index));
  });
});

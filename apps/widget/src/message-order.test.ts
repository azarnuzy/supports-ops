import { describe, expect, it } from "vitest";
import { orderedInsertIndex } from "./message-order";

describe("orderedInsertIndex", () => {
  it("appends a Message that is newer than everything rendered", () => {
    expect(orderedInsertIndex([1, 2], 3)).toBe(-1);
  });

  it("puts a replayed Message back between its neighbours", () => {
    expect(orderedInsertIndex([1, 3], 2)).toBe(1);
  });

  it("lands above the optimistic bubble of a newer turn", () => {
    // customer(1), agent(2), the customer's third turn sent optimistically —
    // the agent's reply to turn 2 must not fall behind it.
    expect(orderedInsertIndex([1, 2, undefined], 3)).toBe(2);
  });

  it("lands above a streamed reply and the typing indicator", () => {
    expect(orderedInsertIndex([1, undefined, undefined], 2)).toBe(1);
  });
});

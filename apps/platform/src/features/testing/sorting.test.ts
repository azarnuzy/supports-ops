import { expect, it } from "vitest";
import { nextSort, sortRows } from "@repo/shared/table-sort";

it("cycles a single sort and orders all rows before pagination without mutating the source", () => {
  const ascending = nextSort(null, "value");
  const descending = nextSort(ascending, "value");
  expect(nextSort(descending, "value")).toBeNull();
  expect(nextSort(descending, "other")).toEqual({ column: "other", direction: "asc" });
  const rows = ["case-10", null, "case-2", "Case-1"];
  expect(sortRows(rows, ascending, (value) => value).slice(0, 2)).toEqual(["Case-1", "case-2"]);
  expect(sortRows(rows, descending, (value) => value)).toEqual([
    "case-10",
    "case-2",
    "Case-1",
    null,
  ]);
  expect(sortRows([10, 2, 1], ascending, (value) => value)).toEqual([1, 2, 10]);
  expect(sortRows(rows, null, (value) => value)).toBe(rows);
  expect(rows).toEqual(["case-10", null, "case-2", "Case-1"]);
});

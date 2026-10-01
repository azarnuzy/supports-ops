export type TableSort<K extends string = string> = { column: K; direction: "asc" | "desc" } | null;

export function nextSort<K extends string>(sort: TableSort<K>, column: K): TableSort<K> {
  if (sort?.column !== column) return { column, direction: "asc" };
  return sort.direction === "asc" ? { column, direction: "desc" } : null;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function sortRows<T>(
  rows: T[],
  sort: TableSort,
  value: (row: T) => string | number | null | undefined,
): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    // Missing values stay last in either direction.
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const compared =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : collator.compare(String(left), String(right));
    return sort.direction === "asc" ? compared : -compared;
  });
}

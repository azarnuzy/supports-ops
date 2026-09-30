import { z } from "zod";
import { type CaseInput, caseSchema } from "./schema";

/** Imports beyond this many rows are cut and reported, never silently dropped. */
export const IMPORT_ROW_LIMIT = 100;

/** Max preceding turns copied from a Session (the case schema allows 50). */
const HISTORY_LIMIT = 20;

const MESSAGE_COLUMNS = ["message", "user_message", "prompt", "input", "text"];

export type ImportRow = {
  /** Paste block, CSV line or Session message number, 1-based. */
  row: number;
  /** Null when the row is invalid. */
  case: CaseInput | null;
  errors: string[];
};

export type ImportPreview = {
  rows: ImportRow[];
  /** Set when the source had more than IMPORT_ROW_LIMIT rows; rows past the limit are not listed. */
  truncated: { limit: number; total: number } | null;
  /** Source-level problem (no rows, no message column, malformed CSV). */
  error: string | null;
};

export const importSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("paste"), text: z.string().max(1_000_000) }),
  z.object({ source: z.literal("csv"), text: z.string().max(5_000_000) }),
  z.object({
    selections: z
      .array(z.object({ includeHistory: z.boolean().default(false), messageId: z.string().min(1) }))
      .min(1)
      .max(500),
    source: z.literal("sessions"),
  }),
]);
export type ImportSource = z.infer<typeof importSourceSchema>;

/** Draft keys are taken from the dataset's free `import-N` slots. */
export function keyAllocator(taken: Iterable<string>) {
  const used = new Set(taken);
  let next = 1;
  return {
    claim(key: string) {
      if (used.has(key)) return false;
      used.add(key);
      return true;
    },
    /** Next free draft key; not reserved until `claim`ed (validate does that). */
    fresh() {
      while (used.has(`import-${next}`)) next++;
      return `import-${next}`;
    },
  };
}

/** Splits only on a line that is exactly `---`, keeping multiline content of each block. */
export function parsePaste(text: string): { blocks: { row: number; message: string }[] } {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/^[ \t]*---[ \t]*$/m)
    .map((block, index) => ({ message: block.trim(), row: index + 1 }));
  return { blocks };
}

/** RFC 4180 CSV: quoted commas, newlines and doubled quotes. Returns null for malformed input. */
export function parseCsv(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === '"')
      return null; // stray quote inside an unquoted field
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) return null; // unterminated quote
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function jsonCell(value: string | undefined, fallback: unknown, label: string) {
  if (!value?.trim()) return { value: fallback };
  try {
    return { value: JSON.parse(value) as unknown };
  } catch {
    return { error: `${label} is not valid JSON.` };
  }
}

const cell = (record: Record<string, string>, ...names: string[]) => {
  for (const name of names) if (record[name] !== undefined) return record[name].trim();
  return "";
};

export function validate(row: number, candidate: unknown, alloc: ReturnType<typeof keyAllocator>) {
  const parsed = caseSchema.safeParse(candidate);
  if (!parsed.success)
    return {
      case: null,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`),
      row,
    } satisfies ImportRow;
  if (!alloc.claim(parsed.data.caseKey))
    return {
      case: null,
      errors: [`caseKey: "${parsed.data.caseKey}" is already used.`],
      row,
    } satisfies ImportRow;
  return { case: parsed.data, errors: [], row } satisfies ImportRow;
}

function finish(rows: ImportRow[], total: number, error: string | null = null): ImportPreview {
  return {
    error,
    rows: rows.slice(0, IMPORT_ROW_LIMIT),
    truncated: total > IMPORT_ROW_LIMIT ? { limit: IMPORT_ROW_LIMIT, total } : null,
  };
}

export function previewPaste(text: string, alloc: ReturnType<typeof keyAllocator>): ImportPreview {
  const { blocks } = parsePaste(text);
  if (blocks.every((b) => !b.message))
    return finish([], 0, "Paste at least one message. Separate messages with a line of ---.");
  // Empty blocks are reported, not silently skipped; only the first rows are validated.
  const rows = blocks
    .slice(0, IMPORT_ROW_LIMIT)
    .map((b) =>
      b.message
        ? validate(b.row, { caseKey: alloc.fresh(), message: b.message }, alloc)
        : { case: null, errors: ["Empty message block."], row: b.row },
    );
  return finish(rows, blocks.length);
}

export function previewCsv(text: string, alloc: ReturnType<typeof keyAllocator>): ImportPreview {
  const table = parseCsv(text);
  if (!table) return finish([], 0, "Malformed CSV: check for an unclosed or misplaced quote.");
  if (!table.length) return finish([], 0, "The CSV file is empty.");

  const header = table[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const messageIndex = lower.findIndex((h) => MESSAGE_COLUMNS.includes(h));
  const singleColumn = header.length === 1 && messageIndex === -1;
  if (messageIndex === -1 && !singleColumn)
    return finish([], 0, `Add a message column named one of: ${MESSAGE_COLUMNS.join(", ")}.`);

  // A single unnamed column is plain input, so its first line is data, not a header.
  const dataRows = singleColumn ? table : table.slice(1);
  const rows = dataRows.slice(0, IMPORT_ROW_LIMIT).map((cells, index): ImportRow => {
    const row = index + (singleColumn ? 1 : 2);
    if (singleColumn) {
      return validate(row, { caseKey: alloc.fresh(), message: cells[0]?.trim() ?? "" }, alloc);
    }
    if (cells.length > header.length)
      return { case: null, errors: ["Row has more columns than the header."], row };
    const record: Record<string, string> = {};
    lower.forEach((name, i) => {
      if (i !== messageIndex) record[name] = cells[i] ?? "";
    });
    const errors: string[] = [];
    const json = (names: string[], fallback: unknown, label: string) => {
      const found = jsonCell(cell(record, ...names), fallback, label);
      if ("error" in found) errors.push(found.error as string);
      return found.value;
    };
    const history = json(["history"], [], "history");
    const attachments = json(["attachments"], [], "attachments");
    const metadata = json(["metadata"], {}, "metadata");
    if (errors.length) return { case: null, errors, row };

    const clarification = cell(record, "clarificationcount", "clarification_count");
    const candidate = {
      attachments,
      caseKey: cell(record, "casekey", "case_key", "case_id", "id") || alloc.fresh(),
      category: cell(record, "category"),
      clarificationCount: clarification === "" ? 0 : Number(clarification),
      expected: cell(record, "expected"),
      history,
      message: (cells[messageIndex] ?? "").trim(),
      metadata,
      metric: cell(record, "metric") || null,
    };
    return validate(row, candidate, alloc);
  });
  return finish(rows, dataRows.length);
}

export type SessionMessageRow = {
  content: string;
  id: string;
  position: number;
  senderType: "AI_AGENT" | "CUSTOMER" | "HUMAN_AGENT" | "SYSTEM";
  sessionId: string;
};

/** Maps a Session's earlier turns to fixed history. Old AI replies stay history only:
 * they are never copied into `expected`. */
export function historyBefore(
  messages: SessionMessageRow[],
  position: number,
): CaseInput["history"] {
  const turns: CaseInput["history"] = [];
  for (const m of messages) {
    if (m.position >= position || !m.content.trim()) continue;
    const role =
      m.senderType === "CUSTOMER" ? "user" : m.senderType === "AI_AGENT" ? "assistant" : null;
    if (role) turns.push({ content: m.content.slice(0, 4000), role });
  }
  return turns.slice(-HISTORY_LIMIT);
}

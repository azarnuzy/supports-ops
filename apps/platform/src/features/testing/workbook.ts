import { evalMetrics } from "@repo/shared/eval-schema";
import type { CellValue } from "exceljs";

export const workbookColumns = [
  "message",
  "caseKey",
  "category",
  "metric",
  "expected",
  "decision",
  "language",
  "retrievalTarget",
  "tool",
  "toolMustNotBeCalled",
  "clarificationCount",
  "history",
  "attachments",
  "metadata",
];

export async function createTemplate() {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const cases = workbook.addWorksheet("Cases", { views: [{ state: "frozen", ySplit: 1 }] });
  const guide = workbook.addWorksheet("Guide");
  const options = workbook.addWorksheet("Options");
  const examples = workbook.addWorksheet("Examples");
  const choices = [
    { column: 4, name: "EvaluationTypes", values: [...evalMetrics] },
    { column: 6, name: "Decisions", values: ["CLARIFY", "ESCALATE", "REPLY", "RESOLVE"] },
    { column: 7, name: "Languages", values: ["en", "id"] },
    { column: 8, name: "RetrievalTargets", values: ["agent", "retriever"] },
    { column: 10, name: "BooleanValues", values: ["true", "false"] },
    {
      column: 11,
      name: "ClarificationCounts",
      values: Array.from({ length: 11 }, (_, index) => String(index)),
    },
  ];
  cases.columns = workbookColumns.map((header) => ({
    header,
    width: header === "message" || header === "expected" ? 55 : 24,
  }));
  cases.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  cases.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3152D5" } };
  cases.columns.forEach((column) => {
    column.alignment = { vertical: "top", wrapText: true };
  });
  cases.autoFilter = "A1:N1";
  choices.forEach((choice, index) => {
    options.getColumn(index + 1).width = 25;
    options.getCell(1, index + 1).value = choice.name;
    choice.values.forEach((value, row) => {
      options.getCell(row + 2, index + 1).value = value;
    });
    const letter = options.getColumn(index + 1).letter;
    workbook.definedNames.add(
      `Options!$${letter}$2:$${letter}$${choice.values.length + 1}`,
      choice.name,
    );
    for (let row = 2; row <= 5001; row++)
      cases.getCell(row, choice.column).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [choice.name],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Choose a listed value",
        error: "Use the dropdown or leave this cell blank for a draft.",
      };
  });
  guide.columns = [
    { header: "Field / task", width: 28 },
    { header: "How to fill it", width: 105 },
  ];
  guide.addRows([
    [
      "Start here",
      "Fill the Cases sheet only. Guide, Options and Examples are not imported. Delete no headers. Blank rows are ignored.",
    ],
    [
      "Drafts",
      "Only message is required to save. Choose metric and its expectations to make a case ready to run.",
    ],
    [
      "Dropdowns",
      "Dropdowns are prepared for 5,000 rows. Copy a validated row to extend them; the import does not have a 100-row limit.",
    ],
    [
      "message",
      "Customer Message; multiline text is supported. Excel itself limits a cell to 32,767 characters; CSV or the case editor can hold longer messages.",
    ],
    [
      "caseKey",
      "Optional unique ID within this dataset. Use letters, digits, dots, underscores, colons or hyphens. Generated when blank.",
    ],
    [
      "category",
      "Optional free-text group, e.g. refunds. Maximum 60 characters; there is no fixed category list.",
    ],
    [
      "contains / exactMatch",
      "Set expected to the text that must appear / the exact reference answer.",
    ],
    [
      "gEval",
      "Set expected to the desired answer or behaviour. Dataset grading criteria provide the default rubric.",
    ],
    [
      "decision",
      'Choose the accepted decision in the decision column. For multiple accepted decisions, leave it blank and use metadata JSON: {"decisions":["CLARIFY","ESCALATE"]}.',
    ],
    ["language", "Choose en (English) or id (Indonesian) in the language column."],
    [
      "tool",
      "Set tool to the Tool name. toolMustNotBeCalled=true checks that it is NOT called; false requires it.",
    ],
    ["visibility", 'Set metadata JSON, e.g. {"canaries":["internal secret"]}.'],
    [
      "retrieval",
      'Choose retrievalTarget. Set metadata, e.g. {"expectedPassages":[{"source":"refund-policy","fragment":"30 days","grade":2}]}.',
    ],
    [
      "faithfulness / relevancy",
      "No reference answer required; evaluated against retrieved Knowledge or the Customer Message.",
    ],
    [
      "negativeControl",
      "Checks evaluator health without an AI Agent call. Its expected failure is not a product regression.",
    ],
    ["clarificationCount", "Optional whole number 0–10. Defaults to 0."],
    [
      "history",
      'Optional JSON: [{"role":"user","content":"Earlier question"},{"role":"assistant","content":"Earlier reply"}]. Earlier replies are context, never expected answers.',
    ],
    ["attachments", 'Optional JSON: [{"id":"receipt.txt","content":"Extracted text"}].'],
    [
      "metadata",
      "Optional advanced JSON. Nonempty flat decision/language/retrievalTarget/tool columns override their matching metadata fields.",
    ],
    [
      "Upload",
      "Upload this XLSX directly, or export Cases as CSV. File limit: 5 MB; expanded CSV content limit: 5 million characters. All valid rows are imported; runs use up to 100 cases per batch.",
    ],
  ]);
  guide.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  examples.addRow(workbookColumns);
  examples.addRows([
    ["How can I reset my password?", "password-reset", "grounding", "contains", "reset"],
    ["I want to talk to a person", "request-human", "escalation", "decision", "", "ESCALATE"],
    [
      "Bagaimana cara mengembalikan pesanan?",
      "reply-language",
      "language",
      "language",
      "",
      "",
      "id",
    ],
  ]);
  examples.columns.forEach((column) => {
    column.width = 28;
    column.alignment = { wrapText: true };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if ("formula" in value || "sharedFormula" in value)
    throw new Error(
      "Formulas are not supported in Cases. Replace them with plain values before importing.",
    );
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return value.text;
  throw new Error("Cases contains an unsupported cell value. Use plain text, numbers or booleans.");
}

export async function readWorkbook(buffer: ArrayBuffer) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Cases");
  if (!sheet) throw new Error("Add a sheet named Cases, or use the downloadable template.");
  const lines: string[] = [];
  let size = 0;
  for (let index = 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const cells = Array.from({ length: sheet.getRow(1).cellCount }, (_, column) =>
      cellText(row.getCell(column + 1).value),
    );
    if (cells.every((cell) => !cell.trim())) continue;
    const line = cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
    size += line.length + 2;
    if (size > 5_000_000)
      throw new Error(
        "Expanded workbook exceeds 5 million characters. Split it into smaller files; no rows were imported.",
      );
    lines.push(line);
  }
  return lines.join("\r\n");
}

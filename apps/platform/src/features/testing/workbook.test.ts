import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import { keyAllocator, previewCsv } from "@repo/shared/eval-import";
import { createTemplate, readWorkbook } from "./workbook";

it("round-trips the dropdown workbook and imports only Cases with flat expectations", async () => {
  const bytes = await createTemplate();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    "Cases",
    "Guide",
    "Options",
    "Examples",
  ]);
  const sheet = workbook.getWorksheet("Cases");
  if (!sheet) throw new Error("Cases worksheet is missing.");
  expect(sheet.getCell("D2").dataValidation.formulae).toEqual(["EvaluationTypes"]);
  expect(sheet.getCell("F2").dataValidation.formulae).toEqual(["Decisions"]);
  sheet.getCell("A2").value = 'A long question, with "quotes"\nand another line';
  sheet.getCell("D2").value = "decision";
  sheet.getCell("F2").value = "ESCALATE";
  sheet.getCell("A132").value = "Last question";
  const csv = await readWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer);
  const result = previewCsv(csv, keyAllocator([]));
  expect(result.error).toBeNull();
  expect(result.rows).toHaveLength(2);
  expect(result.rows[0].case).toMatchObject({
    message: sheet.getCell("A2").value,
    metric: "decision",
    metadata: { decisions: ["ESCALATE"] },
  });
  expect(result.rows[1].case?.message).toBe("Last question");
  sheet.getCell("A2").value = { formula: "1+1", result: 2 };
  await expect(
    readWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer),
  ).rejects.toThrow("Formulas are not supported");
});

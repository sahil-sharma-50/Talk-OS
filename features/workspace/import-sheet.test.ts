// @vitest-environment node
import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { importSheetFile } from "./import-sheet";
import { evaluateSheet } from "./sheet-formulas";

it("imports multiple Excel worksheets with formulas, dates and formatting", async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Costs");
  sheet.addRows([["Item", "Cost"], ["Train", 30], ["Hotel", 70]]);
  sheet.getCell("B4").value = { formula: "SUM($B$2:B3)" }; sheet.getCell("A1").font = { bold: true };
  book.addWorksheet("Dates").getCell("A1").value = new Date("2026-09-13T00:00:00Z");
  const buffer = await book.xlsx.writeBuffer();
  const results = await importSheetFile(new File([new Uint8Array(buffer)], "Trip.xlsx"));
  expect(results.map((sheet) => sheet.title)).toEqual(["Trip · Costs", "Trip · Dates"]);
  expect(results[0].cells.B4.value).toBe("=SUM($B$2:B3)");
  expect(results[0].cells.A1.style?.bold).toBe(true);
  expect(evaluateSheet(results[0].cells).B4).toBe(100);
  expect(results[1].cells.A1.value).toBe("2026-09-13");
});

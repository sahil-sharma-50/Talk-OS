import { evaluateSheet } from "./sheet-formulas";
import type { SheetCell, SheetCellFormat, WorkspaceSheet } from "./workspace.types";

export const SHEET_ROW_LIMIT = 1000;
export const SHEET_COLUMNS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
export const validSheetAddress = (value: string) => /^[A-Z]([1-9]\d{0,2}|1000)$/.test(value);

export function sheetRangeAddresses(range: string): string[] {
  const [start, end = start] = range.toUpperCase().split(":");
  if (!validSheetAddress(start) || !validSheetAddress(end) || range.split(":").length > 2) throw new Error("Invalid sheet range. Use A1 or A1:B10.");
  const addresses: string[] = [];
  for (let row = Math.min(Number(start.slice(1)), Number(end.slice(1))); row <= Math.max(Number(start.slice(1)), Number(end.slice(1))); row++) {
    for (let col = Math.min(start.charCodeAt(0), end.charCodeAt(0)); col <= Math.max(start.charCodeAt(0), end.charCodeAt(0)); col++) addresses.push(`${String.fromCharCode(col)}${row}`);
  }
  return addresses;
}

export function insertSheetRows(cells: Record<string, SheetCell>, before: number, count = 1): Record<string, SheetCell> {
  if (!Number.isInteger(before) || !Number.isInteger(count) || before < 1 || count < 1 || before + count - 1 > SHEET_ROW_LIMIT) throw new Error("Row limit is 1,000.");
  const result: Record<string, SheetCell> = {};
  for (const [address, cell] of Object.entries(cells)) {
    const row = Number(address.slice(1)); const nextRow = row >= before ? row + count : row;
    if (nextRow > SHEET_ROW_LIMIT) { if (cell.value !== "") throw new Error("Row limit reached. Inserting would discard existing data."); continue; }
    let value = cell.value;
    if (typeof value === "string" && value.startsWith("=")) value = value.replace(/(\$?[A-Z]\$?)([1-9]\d*)/gi, (reference, column: string, number: string) => {
      const target = Number(number); const shifted = target >= before ? target + count : target;
      return shifted > SHEET_ROW_LIMIT ? "#REF!" : `${column}${shifted}`;
    });
    result[`${address[0]}${nextRow}`] = { ...cell, value };
  }
  return result;
}

export function formatSheetValue(value: string | number | undefined, format?: SheetCellFormat): string {
  if (value === undefined) return "";
  if (typeof value !== "number") return value;
  if (format === "percent") return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 }).format(value);
  if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(value);
  if (format === "number") return new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value);
  return String(value);
}

export interface SheetColumnInfo { letter: string; label: string; range: string; headerRow: number | null; firstRow: number; lastRow: number; type: "number" | "text" | "mixed"; count: number; samples: (string | number)[] }

export function inferSheetColumns(sheet: WorkspaceSheet): SheetColumnInfo[] {
  const calculated = evaluateSheet(sheet.cells);
  const populated = Object.keys(sheet.cells).filter((address) => validSheetAddress(address) && sheet.cells[address].value !== "");
  if (!populated.length) return [];
  const first = Math.min(...populated.map((address) => Number(address.slice(1))));
  let last = Math.max(...populated.map((address) => Number(address.slice(1))));
  const letters = SHEET_COLUMNS.filter((letter) => populated.some((address) => address[0] === letter));
  // A title above the table is not a column heading. Prefer the first populated row spanning the table.
  const candidate = Array.from({ length: Math.min(25, last - first + 1) }, (_, i) => first + i).find((row) => letters.filter((letter) => String(calculated[`${letter}${row}`] ?? "").trim()).length >= Math.min(letters.length, 2)) ?? first;
  const candidateValues = letters.map((letter) => calculated[`${letter}${candidate}`]).filter((value) => value !== undefined && value !== "");
  const header = candidateValues.length > 0 && candidateValues.every((value) => typeof value === "string") && candidate < last;
  const firstRow = header ? candidate + 1 : candidate;
  // A labeled summary formula is not another record. Keep it available in the sheet,
  // but omit trailing totals from suggested dashboard aggregations.
  while (last > firstRow && letters.some((letter) => /^(grand\s+total|total|subtotal)$/i.test(String(calculated[`${letter}${last}`] ?? "").trim())) && letters.some((letter) => /^=\s*(SUM|SUBTOTAL|AVERAGE|COUNT)\s*\(/i.test(String(sheet.cells[`${letter}${last}`]?.value ?? "")))) last--;
  return letters.map((letter) => {
    const values = Array.from({ length: last - firstRow + 1 }, (_, i) => calculated[`${letter}${firstRow + i}`]).filter((value): value is string | number => value !== undefined && value !== "");
    const numbers = values.filter((value) => typeof value === "number").length;
    return { letter, label: header && calculated[`${letter}${candidate}`] !== undefined ? String(calculated[`${letter}${candidate}`]) : `Column ${letter}`, headerRow: header ? candidate : null, firstRow, lastRow: last, range: `${letter}${firstRow}:${letter}${last}`, type: numbers === values.length && numbers > 0 ? "number" : numbers === 0 ? "text" : "mixed", count: values.length, samples: values.slice(0, 3) };
  });
}

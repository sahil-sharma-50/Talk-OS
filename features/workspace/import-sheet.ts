import Papa from "papaparse";
import type { SheetCell, WorkspaceSheet } from "./workspace.types";

export async function importSheetFile(file: File): Promise<Array<{ title: string; cells: WorkspaceSheet["cells"] }>> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Sheets must be 10 MB or smaller.");
  const title = file.name.replace(/\.(csv|xlsx)$/i, "");
  if (/\.csv$/i.test(file.name)) {
    const { data, errors } = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true });
    if (errors.length) throw new Error("That CSV could not be read. Check its separators and quotes.");
    if (data.length > 1000 || data.some((row) => row.length > 26)) throw new Error("Sheets support up to 1,000 rows and 26 columns per worksheet.");
    return [{ title, cells: Object.fromEntries(data.flatMap((row, r) => row.map((value, c) => [`${String.fromCharCode(65 + c)}${r + 1}`, { value }]))) }];
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx or .csv file.");
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(await file.arrayBuffer()); } catch { throw new Error("That Excel file could not be read. Save it as an unencrypted .xlsx workbook and try again."); }
  if (!book.worksheets.length) throw new Error("This workbook contains no worksheets.");
  if (book.worksheets.length > 30) throw new Error("Import up to 30 worksheets at a time.");
  return book.worksheets.map((worksheet) => {
    if (worksheet.rowCount > 1000 || worksheet.columnCount > 26) throw new Error(`${worksheet.name} exceeds 1,000 rows or 26 columns. Split it into smaller worksheets.`);
    const cells: Record<string, SheetCell> = {};
    worksheet.eachRow((row) => row.eachCell((cell) => {
      const raw = cell.value;
      if (raw === null || raw === undefined) return;
      let value: string | number;
      if (cell.formula) value = `=${cell.formula}`;
      else if (raw instanceof Date) value = raw.toISOString().slice(0, 10);
      else if (typeof raw === "number" || typeof raw === "string") value = raw;
      else if (typeof raw === "boolean") value = raw ? "TRUE" : "FALSE";
      else value = cell.text;
      cells[cell.address] = { value, format: cell.numFmt?.includes("%") ? "percent" : /[$€£]/.test(cell.numFmt || "") ? "currency" : cell.numFmt === "@" ? "text" : undefined, style: { bold: Boolean(cell.font?.bold), italic: Boolean(cell.font?.italic), underline: Boolean(cell.font?.underline), ...(["left", "center", "right"].includes(cell.alignment?.horizontal ?? "") ? { align: cell.alignment.horizontal as "left" | "center" | "right" } : {}) } };
    }));
    return { title: book.worksheets.length === 1 ? title : `${title} · ${worksheet.name}`, cells };
  });
}

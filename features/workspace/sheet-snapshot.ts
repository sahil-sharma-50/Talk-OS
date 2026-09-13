import { evaluateSheet } from "./sheet-formulas";
import { formatSheetValue, sheetRangeAddresses, validSheetAddress } from "./sheet-operations";
import type { SheetCellStyle, SheetDocumentEmbed, SheetSnapshotCell, WorkspaceSheet } from "./workspace.types";

export function snapshotCellStyle(style?: SheetCellStyle): SheetCellStyle | undefined {
  if (!style) return undefined;
  const hex = (value?: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
  return { bold: style.bold === true, italic: style.italic === true, underline: style.underline === true,
    align: ["left", "center", "right"].includes(style.align ?? "") ? style.align : undefined,
    color: hex(style.color), background: hex(style.background) };
}

export function createSheetSnapshot(sheet: WorkspaceSheet, range?: string, headerRow?: boolean):
  | Pick<SheetDocumentEmbed, "range" | "sourceRange" | "headerRow" | "rows">
  | { error: string } | { question: string } {
  const populated = Object.keys(sheet.cells).filter(address => validSheetAddress(address) && sheet.cells[address].value !== "");
  if (!populated.length) return { question: "This sheet is empty. Which sheet or cells should I put in the document?" };
  let selectedRange = range?.trim().toUpperCase().replace(/\$/g, "");
  if (selectedRange === undefined) {
    const columns = populated.map(address => address.charCodeAt(0));
    const rows = populated.map(address => Number(address.slice(1)));
    selectedRange = `${String.fromCharCode(Math.min(...columns))}${Math.min(...rows)}:${String.fromCharCode(Math.max(...columns))}${Math.max(...rows)}`;
  }
  let addresses: string[];
  try { addresses = sheetRangeAddresses(selectedRange); } catch { return { error: "invalid_sheet_range" }; }
  if (!addresses.some(address => sheet.cells[address]?.value !== undefined && sheet.cells[address].value !== "")) return { question: "That range has no data. Which cells should I include?" };
  const normalizedRange = `${addresses[0]}:${addresses.at(-1)}`;
  const computed = evaluateSheet(sheet.cells);
  const rows: SheetSnapshotCell[][] = [];
  let rowNumber = 0;
  for (const address of addresses) {
    const row = Number(address.slice(1));
    if (row !== rowNumber) { rows.push([]); rowNumber = row; }
    const cell = sheet.cells[address]; const value = computed[address];
    rows.at(-1)!.push({ address, text: formatSheetValue(value, cell?.format), numeric: typeof value === "number", ...(cell?.style ? { style: snapshotCellStyle(cell.style) } : {}) });
  }
  const firstValues = rows[0].filter(cell => cell.text.trim());
  return { range: normalizedRange, ...(range !== undefined ? { sourceRange: normalizedRange } : {}), rows,
    headerRow: headerRow ?? (rows.length > 1 && firstValues.length > 0 && firstValues.every(cell => !cell.numeric)) };
}

function markdownCell(cell: SheetSnapshotCell): string {
  let text = cell.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\|`*_[\]~])/g, "\\$1").replace(/\r?\n/g, "<br>");
  if (!text) return "";
  if (cell.style?.bold) text = `**${text}**`;
  if (cell.style?.italic) text = `_${text}_`;
  if (cell.style?.underline) text = `<u>${text}</u>`;
  return text;
}

export function sheetSnapshotMarkdown(snapshot: SheetDocumentEmbed): string {
  const headings = snapshot.headerRow ? snapshot.rows[0].map(markdownCell) : snapshot.rows[0].map(cell => `Column ${cell.address[0]}`);
  const body = snapshot.headerRow ? snapshot.rows.slice(1) : snapshot.rows;
  const separator = snapshot.rows[0].map((cell, column) => {
    const align = cell.style?.align ?? (body.some(row => row[column]?.numeric) ? "right" : "left");
    return align === "right" ? "---:" : align === "center" ? ":---:" : ":---";
  });
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return `${snapshot.title.replace(/([\\*_[\]`<>])/g, "\\$1")}\n\n${[row(headings), row(separator), ...body.map(cells => row(cells.map(markdownCell)))].join("\n")}`;
}

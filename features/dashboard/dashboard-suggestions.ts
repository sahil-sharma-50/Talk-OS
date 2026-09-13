import type { DashboardWidget } from "./dashboard.types";
import type { WorkspaceSheet } from "@/features/workspace/workspace.types";
import { inferSheetColumns } from "@/features/workspace/sheet-operations";

export function suggestedSheetWidgets(sheet: WorkspaceSheet, options: { measureColumns?: string[]; categoryColumn?: string } = {}): DashboardWidget[] {
  const columns = inferSheetColumns(sheet); const numbers = columns.filter((column) => column.type === "number" && (!options.measureColumns || options.measureColumns.includes(column.letter))); const category = options.categoryColumn ? columns.find((column) => column.letter === options.categoryColumn) : columns.find((column) => column.type === "text");
  if (options.measureColumns?.some((letter) => !numbers.some((column) => column.letter === letter))) throw new Error("Choose numeric measure columns from the returned sheet column metadata.");
  if (options.categoryColumn && !category) throw new Error("That category column is not present in the sheet.");
  const widgets: DashboardWidget[] = numbers.slice(0, 4).map((column, order) => ({ id: `widget-${crypto.randomUUID()}`, title: `Total ${column.label}`, type: "metric", size: "compact", order, color: ["#2563eb", "#0f766e", "#9333ea", "#b45309"][order % 4], binding: { kind: "sheet_sum", sheetId: sheet.id, range: column.range, currency: sheet.cells[`${column.letter}${column.firstRow}`]?.format === "currency" ? "EUR" : undefined } }));
  if (category && numbers[0]) widgets.push({ id: `widget-${crypto.randomUUID()}`, title: `${numbers[0].label} by ${category.label}`, type: "bar_chart", size: "wide", order: widgets.length, binding: { kind: "category_sum", sheetId: sheet.id, categoryRange: category.range, amountRange: numbers[0].range, currency: sheet.cells[`${numbers[0].letter}${numbers[0].firstRow}`]?.format === "currency" ? "EUR" : "" } });
  return widgets;
}

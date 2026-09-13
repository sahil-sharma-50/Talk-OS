"use client";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import type { DashboardWidget } from "@/features/dashboard/dashboard.types";
import type { WorkspaceSheet } from "@/features/workspace/workspace.types";
import { inferSheetColumns } from "@/features/workspace/sheet-operations";
import { suggestedSheetWidgets } from "@/features/dashboard/dashboard-suggestions";

export function DashboardSheetBuilder({ sheets, onAdd }: { sheets: WorkspaceSheet[]; onAdd: (widgets: DashboardWidget[]) => void }) {
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? "");
  const sheet = sheets.find((item) => item.id === sheetId) ?? sheets[0];
  return <section className="dashboard-sheet-panel"><div className="dashboard-sheet-panel__heading"><strong>From your sheet</strong><select aria-label="Dashboard sheet" value={sheet?.id ?? ""} onChange={(event) => setSheetId(event.target.value)}>{sheets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>{sheet ? <SheetFields key={sheet.id} sheet={sheet} onAdd={onAdd} /> : null}</section>;
}

function SheetFields({ sheet, onAdd }: { sheet: WorkspaceSheet; onAdd: (widgets: DashboardWidget[]) => void }) {
  const columns = inferSheetColumns(sheet);
  const numeric = columns.filter((column) => column.type === "number");
  const [category, setCategory] = useState(columns.find((column) => column.type === "text")?.letter ?? columns[0]?.letter ?? "");
  const [amount, setAmount] = useState(numeric[0]?.letter ?? "");
  const [rangeA, setRangeA] = useState(""); const [rangeB, setRangeB] = useState(""); const [budgetCell, setBudgetCell] = useState("");
  const [currency, setCurrency] = useState("");
  const categoryColumn = columns.find((column) => column.letter === category); const amountColumn = columns.find((column) => column.letter === amount);
  const firstRange = rangeA || categoryColumn?.range || ""; const secondRange = rangeB || amountColumn?.range || "";
  const add = (widget: Omit<DashboardWidget, "id" | "order">) => onAdd([{ ...widget, id: `widget-${crypto.randomUUID()}`, order: 0 } as DashboardWidget]);
  return <><p className="dashboard-column-summary">{columns.length ? `${columns.length} columns detected: ${columns.map((column) => column.label).join(", ")}.` : "Add column headings and data to your sheet first."}</p>
    <div className="dashboard-sheet-builder">
      <label>Group by<select aria-label="Category column" value={category} onChange={(event) => { setCategory(event.target.value); setRangeA(""); }}>{columns.map((column) => <option key={column.letter} value={column.letter}>{column.label} ({column.letter})</option>)}</select></label>
      <label>Measure<select aria-label="Value column" value={amount} onChange={(event) => { setAmount(event.target.value); setRangeB(""); }}>{numeric.length ? numeric.map((column) => <option key={column.letter} value={column.letter}>{column.label} ({column.letter})</option>) : <option value="">No numeric column</option>}</select></label>
      <label>Display<select aria-label="Dashboard number format" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="">Number</option><option value="EUR">Euro (€)</option><option value="USD">US dollar ($)</option><option value="GBP">Pound (£)</option></select></label>
      <button type="button" disabled={!amountColumn || !categoryColumn} onClick={() => add({ type: "bar_chart", title: `${amountColumn?.label} by ${categoryColumn?.label}`, size: "wide", binding: { kind: "category_sum", sheetId: sheet.id, categoryRange: firstRange, amountRange: secondRange, currency } })}><Plus size={14} /> Category chart</button>
      <button type="button" disabled={!amountColumn} onClick={() => add({ type: "metric", title: `Total ${amountColumn?.label}`, size: "compact", binding: { kind: "sheet_sum", sheetId: sheet.id, range: secondRange, currency } })}>Sum</button>
      <button className="dashboard-smart-add" type="button" disabled={!numeric.length} onClick={() => onAdd(suggestedSheetWidgets(sheet))}><Sparkles size={14} /> Build from sheet</button>
    </div>
    <details className="dashboard-ranges"><summary>Custom ranges and budget</summary><div><label>Categories<input aria-label="First range" value={firstRange} onChange={(event) => setRangeA(event.target.value.toUpperCase())} /></label><label>Values<input aria-label="Second range" value={secondRange} onChange={(event) => setRangeB(event.target.value.toUpperCase())} /></label><label>Budget cell<input aria-label="Budget cell" placeholder="D2" value={budgetCell} onChange={(event) => setBudgetCell(event.target.value.toUpperCase())} /></label><button type="button" disabled={!budgetCell || !secondRange} onClick={() => add({ type: "metric", title: `${amountColumn?.label ?? "Budget"} used`, size: "compact", binding: { kind: "budget", sheetId: sheet.id, spendRange: secondRange, budgetCell, currency } })}>Budget</button></div></details>
  </>;
}

"use client";

import { BarChart3, FilePlus2, Upload } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { applyWorkspaceChanges, createSheet, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import { evaluateSheet } from "@/features/workspace/sheet-formulas";
import type { WorkspaceSheet, WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

const COLUMNS = Array.from({ length: 8 }, (_, index) => String.fromCharCode(65 + index));
const ROWS = Array.from({ length: 16 }, (_, index) => index + 1);
const download = (name: string, content: string) => { const url = URL.createObjectURL(new Blob([content], { type: "text/csv" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
const exportCsv = (sheet: WorkspaceSheet) => {
  const computed = evaluateSheet(sheet.cells);
  const maxRow = Math.max(1, ...Object.keys(sheet.cells).map((address) => Number(address.match(/\d+$/)?.[0] ?? 1)));
  return Papa.unparse(Array.from({ length: Math.min(1000, maxRow) }, (_, index) => Array.from({ length: 26 }, (_, column) => computed[`${String.fromCharCode(65 + column)}${index + 1}`] ?? "")), { escapeFormulae: true });
};

export function SheetsWorkspace({ workspace, onChange }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }) {
  const active = workspace.sheets.find((sheet) => sheet.id === workspace.activeSheetId) ?? workspace.sheets[0];
  const [selected, setSelected] = useState("A1");
  const [message, setMessage] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const computed = useMemo(() => active ? evaluateSheet(active.cells) : {}, [active]);
  const chartData = ROWS.map((row) => ({ label: String(active?.cells[`A${row}`]?.value ?? ""), value: computed[`B${row}`] })).filter((item): item is { label: string; value: number } => Boolean(item.label) && typeof item.value === "number").slice(0, 8);
  const chartMax = Math.max(...chartData.map((item) => Math.abs(item.value)), 1);
  if (!active) return <div className="tool-empty"><BarChart3 size={30} /><h2>Build a working budget or comparison</h2><p>Cells recalculate when you or TalkOS changes the inputs.</p><button type="button" onClick={() => onChange(createSheet(workspace, "Untitled sheet"))}><FilePlus2 size={14} /> Create a sheet</button></div>;
  const commit = (address: string, value: string | number) => {
    const result = applyWorkspaceChanges(workspace, `Updated ${active.title}`, [{ kind: "sheet", artifactId: active.id, expectedRevision: active.revision, cells: { [address]: value } }], "user");
    if (result.ok) onChange(result.workspace);
  };
  return <div className="sheet-workspace">
    <aside className="artifact-list"><div className="artifact-list__heading"><strong>Sheets</strong><span>{workspace.sheets.length}</span></div><div className="artifact-list__actions"><button type="button" onClick={() => onChange(createSheet(workspace, "Untitled sheet"))}><FilePlus2 size={14} /> New</button><button type="button" onClick={() => uploadRef.current?.click()}><Upload size={14} /> Import</button><input className="visually-hidden" ref={uploadRef} type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; Papa.parse<string[]>(file, { skipEmptyLines: true, complete: ({ data, errors }) => { if (errors.length) { setMessage("That CSV could not be read."); return; } if (data.length > 1000 || data.some((row) => row.length > 26)) { setMessage("CSV files can contain up to 1,000 rows and 26 columns."); return; } const imported = Object.fromEntries(data.flatMap((row, rowIndex) => row.map((value, columnIndex) => [`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, { value }] as const))); onChange(createSheet(workspace, file.name.replace(/\.csv$/i, ""), imported)); setMessage(""); } }); }} /></div>
      {workspace.sheets.map((sheet) => <div className="artifact-row" data-active={sheet.id === active.id} key={sheet.id} onClick={() => onChange({ ...workspace, activeSheetId: sheet.id })}><button type="button"><strong>{sheet.title}</strong><small>r{sheet.revision}</small></button><FileActionMenu name={sheet.title} onRename={(title) => onChange(renameArtifact(workspace, "sheet", sheet.id, title))} onDuplicate={() => onChange(duplicateArtifact(workspace, "sheet", sheet.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "sheet", sheet.id))} onExport={() => download(`${sheet.title}.csv`, exportCsv(sheet))} /></div>)}
    </aside>
    <section className="sheet-editor"><header><strong>{active.title}</strong></header>
      <div className="sheet-main" data-has-chart={chartData.length >= 2}><div className="grid-scroll"><div className="sheet-grid" role="grid" aria-label={active.title}><span className="grid-corner" />{COLUMNS.map((column) => <strong key={column}>{column}</strong>)}{ROWS.flatMap((row) => [<strong key={`row-${row}`}>{row}</strong>, ...COLUMNS.map((column) => { const address = `${column}${row}`; return <input key={address} aria-label={address} data-selected={selected === address} value={String(active.cells[address]?.value ?? "")} title={String(computed[address] ?? "")} onFocus={() => setSelected(address)} onChange={(event) => commit(address, event.target.value)} />; })])}</div></div>{chartData.length >= 2 ? <aside className="sheet-chart" aria-label="Chart of column B"><header><BarChart3 size={14} /><strong>Column B overview</strong></header>{chartData.map((item) => <div key={item.label}><span>{item.label}</span><i style={{ width: `${Math.max(3, Math.abs(item.value) / chartMax * 100)}%` }} /><strong>{item.value}</strong></div>)}</aside> : null}</div>
      <div className="sheet-status"><span>{message || `${selected}: ${String(computed[selected] ?? "empty")}`}</span><span>{Object.keys(active.cells).length} populated cells</span></div>
    </section>
    <WorkspaceResizeHandle />
  </div>;
}

"use client";

import { BarChart3, FilePlus2, Plus, Table2, Upload } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { applyWorkspaceChanges, createSheet, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import { evaluateSheet } from "@/features/workspace/sheet-formulas";
import type { WorkspaceSheet, WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
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
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const computed = useMemo(() => active ? evaluateSheet(active.cells) : {}, [active]);
  const chartData = ROWS.map((row) => ({ label: String(active?.cells[`A${row}`]?.value ?? ""), value: computed[`B${row}`] })).filter((item): item is { label: string; value: number } => Boolean(item.label) && typeof item.value === "number").slice(0, 8);
  const chartMax = Math.max(...chartData.map((item) => Math.abs(item.value)), 1);
  if (!active) return <div className="tool-empty"><BarChart3 size={30} /><h2>Build a working budget or comparison</h2><p>Cells recalculate when you or TalkOS changes the inputs.</p><button type="button" onClick={() => onChange(createSheet(workspace, "Untitled sheet"))}><FilePlus2 size={14} /> Create a sheet</button></div>;
  const commit = (address: string, value: string | number) => {
    const result = applyWorkspaceChanges(workspace, `Updated ${active.title}`, [{ kind: "sheet", artifactId: active.id, expectedRevision: active.revision, cells: { [address]: value } }], "user");
    if (result.ok) onChange(result.workspace);
  };
  const moveCellFocus = (rowIndex: number, columnIndex: number, key: string) => {
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const offset = offsets[key];
    if (!offset) return false;
    const nextRow = rowIndex + offset[0];
    const nextColumn = columnIndex + offset[1];
    if (nextRow < 0 || nextRow >= ROWS.length || nextColumn < 0 || nextColumn >= COLUMNS.length) return false;
    cellRefs.current[`${COLUMNS[nextColumn]}${ROWS[nextRow]}`]?.focus();
    return true;
  };
  return <div className="sheet-workspace">
    <ArtifactNavigator label="Sheets" count={workspace.sheets.length} countLabel={`${workspace.sheets.length} sheets`} actions={<>
      <button type="button" onClick={() => onChange(createSheet(workspace, "Untitled sheet"))}><Plus size={14} /> New</button>
      <button type="button" aria-label="Import sheet" title="Import sheet" onClick={() => uploadRef.current?.click()}><Upload size={14} /></button>
      <input className="visually-hidden" ref={uploadRef} type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; Papa.parse<string[]>(file, { skipEmptyLines: true, complete: ({ data, errors }) => { if (errors.length) { setMessage("That CSV could not be read."); return; } if (data.length > 1000 || data.some((row) => row.length > 26)) { setMessage("CSV files can contain up to 1,000 rows and 26 columns."); return; } const imported = Object.fromEntries(data.flatMap((row, rowIndex) => row.map((value, columnIndex) => [`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, { value }] as const))); onChange(createSheet(workspace, file.name.replace(/\.csv$/i, ""), imported)); setMessage(""); } }); }} />
    </>}>
      {workspace.sheets.map((sheet) => <ArtifactNavigatorItem active={sheet.id === active.id} icon={Table2} title={sheet.title} meta={`Revision ${sheet.revision}`} key={sheet.id} onSelect={() => onChange({ ...workspace, activeSheetId: sheet.id })} menu={<FileActionMenu name={sheet.title} kind="sheet" onRename={(title) => onChange(renameArtifact(workspace, "sheet", sheet.id, title))} onDuplicate={() => onChange(duplicateArtifact(workspace, "sheet", sheet.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "sheet", sheet.id))} onExport={() => download(`${sheet.title}.csv`, exportCsv(sheet))} />} />)}
    </ArtifactNavigator>
    <section className="sheet-editor"><header><EditableArtifactTitle title={active.title} ariaLabel="Sheet title" onCommit={(title) => onChange(renameArtifact(workspace, "sheet", active.id, title))} /></header>
      <div className="sheet-main" data-has-chart={chartData.length >= 2}><div className="grid-scroll"><div className="sheet-grid" role="grid" aria-label={active.title}><span className="grid-corner" />{COLUMNS.map((column) => <strong key={column}>{column}</strong>)}{ROWS.flatMap((row, rowIndex) => [<strong key={`row-${row}`}>{row}</strong>, ...COLUMNS.map((column, columnIndex) => { const address = `${column}${row}`; return <input key={address} ref={(node) => { cellRefs.current[address] = node; }} aria-label={address} data-selected={selected === address} value={String(active.cells[address]?.value ?? "")} title={String(computed[address] ?? "")} onFocus={() => setSelected(address)} onKeyDown={(event) => { if (moveCellFocus(rowIndex, columnIndex, event.key)) event.preventDefault(); }} onChange={(event) => commit(address, event.target.value)} />; })])}</div></div>{chartData.length >= 2 ? <aside className="sheet-chart" aria-label="Chart of column B"><header><BarChart3 size={14} /><strong>Column B overview</strong></header>{chartData.map((item) => <div key={item.label}><span>{item.label}</span><i style={{ width: `${Math.max(3, Math.abs(item.value) / chartMax * 100)}%` }} /><strong>{item.value}</strong></div>)}</aside> : null}</div>
      <div className="sheet-status"><span>{message || `${selected}: ${String(computed[selected] ?? "empty")}`}</span><span>{Object.keys(active.cells).length} populated cells</span></div>
    </section>
    <WorkspaceResizeHandle />
  </div>;
}

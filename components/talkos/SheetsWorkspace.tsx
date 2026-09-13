"use client";

import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, BarChart3, FilePlus2, Plus, Table2, Upload, Sigma } from "lucide-react";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState } from "react";
import { setWorkspaceSelection } from "@/features/workspace/workspace-context";
import { applyWorkspaceChanges, createSheet, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import { evaluateSheet } from "@/features/workspace/sheet-formulas";
import { formatSheetValue, insertSheetRows, SHEET_COLUMNS as COLUMNS, inferSheetColumns } from "@/features/workspace/sheet-operations";
import { importSheetFile } from "@/features/workspace/import-sheet";
import type { SheetCellStyle, SheetCellFormat, WorkspaceSheet, WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

const ROW_HEIGHT = 34;
const WINDOW_ROWS = 44;
const download = (name: string, content: string) => { const url = URL.createObjectURL(new Blob([content], { type: "text/csv" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
const exportCsv = (sheet: WorkspaceSheet) => {
  const computed = evaluateSheet(sheet.cells);
  const populated = Object.keys(sheet.cells).filter((address) => sheet.cells[address].value !== "");
  const maxRow = Math.max(1, ...populated.map((address) => Number(address.slice(1))));
  const maxCol = Math.max(0, ...populated.map((address) => address.charCodeAt(0) - 65));
  return Papa.unparse(Array.from({ length: Math.min(1000, maxRow) }, (_, index) => Array.from({ length: maxCol + 1 }, (_, column) => computed[`${String.fromCharCode(65 + column)}${index + 1}`] ?? "")), { escapeFormulae: true });
};

export function SheetsWorkspace({ workspace, onChange }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }) {
  const active = workspace.sheets.find((sheet) => sheet.id === workspace.activeSheetId) ?? workspace.sheets[0];
  const [selected, setSelected] = useState("A1");
  const [editing, setEditing] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [rowStart, setRowStart] = useState(0);
  const [chartOpen, setChartOpen] = useState(false);
  const latestRef = useRef({ workspace, onChange });
  useEffect(() => { latestRef.current = { workspace, onChange }; }, [workspace, onChange]);
  const uploadRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const computed = useMemo(() => active ? evaluateSheet(active.cells) : {}, [active]);
  const schema = useMemo(() => active ? inferSheetColumns(active) : [], [active]);
  const rows = Array.from({ length: Math.min(WINDOW_ROWS, 1000 - rowStart) }, (_, index) => rowStart + index + 1);
  const importFile = async (file?: File) => {
    if (!file) return; setMessage("Importing sheet…");
    try {
      const imported = await importSheetFile(file);
      let next = latestRef.current.workspace;
      for (const sheet of imported) next = createSheet(next, sheet.title, sheet.cells);
      latestRef.current.onChange(next); setMessage(`Imported ${imported.length} ${imported.length === 1 ? "sheet" : "sheets"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import that sheet."); }
  };
  const upload = <input className="visually-hidden" aria-label="Choose CSV or Excel file" ref={uploadRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />;
  if (!active) return <div className="tool-empty"><BarChart3 size={30} /><h2>Build a working budget or comparison</h2><p>Import Excel or CSV, enter formulas, or ask TalkOS to build a sheet.</p><div className="tool-empty__actions"><button type="button" onClick={() => onChange(createSheet(workspace, "Untitled sheet"))}><FilePlus2 size={16} /> Create a sheet</button><button className="tool-empty__secondary" type="button" onClick={() => uploadRef.current?.click()}><Upload size={16} /> Import sheet</button></div>{upload}<p role="status">{message}</p></div>;
  const commit = (cells: Record<string, string | number>, formats?: Record<string, SheetCellFormat>, styles?: Record<string, SheetCellStyle>, replaceCells?: WorkspaceSheet["cells"]) => {
    const result = applyWorkspaceChanges(workspace, `Updated ${active.title}`, [{ kind: "sheet", artifactId: active.id, expectedRevision: active.revision, cells, formats, styles, replaceCells }], "user");
    if (result.ok) onChange(result.workspace); else setMessage("The sheet changed. Try your edit again.");
  };
  const selectedAddresses = () => columns.length ? columns.flatMap((column) => Array.from({ length: 1000 }, (_, index) => `${column}${index + 1}`)) : selectedRow ? COLUMNS.map((column) => `${column}${selectedRow}`) : [selected];
  const style = active.cells[selected]?.style ?? {};
  const formatSelection = (patch: SheetCellStyle) => commit({}, undefined, Object.fromEntries(selectedAddresses().map((address) => [address, patch])));
  const jumpToRow = (row: number) => { const start = Math.max(0, Math.min(999, row - 1)); setRowStart(start); if (gridRef.current) gridRef.current.scrollTop = start * ROW_HEIGHT; };
  const moveCellFocus = (address: string, key: string) => {
    const row = Number(address.slice(1)); const col = address.charCodeAt(0) - 65;
    const nextRow = row + (key === "ArrowUp" ? -1 : key === "ArrowDown" || key === "Enter" ? 1 : 0);
    const nextCol = col + (key === "ArrowLeft" ? -1 : key === "ArrowRight" || key === "Tab" ? 1 : 0);
    if (nextRow < 1 || nextRow > 1000 || nextCol < 0 || nextCol > 25) return false;
    const next = `${COLUMNS[nextCol]}${nextRow}`;
    if (!cellRefs.current[next]) jumpToRow(Math.max(1, nextRow - 5));
    const focus = () => { const cell = cellRefs.current[next]; cell?.focus(); if (cell) cell.setSelectionRange(key === "ArrowLeft" ? cell.value.length : 0, key === "ArrowLeft" ? cell.value.length : 0); };
    if (cellRefs.current[next]) focus(); else requestAnimationFrame(focus);
    return true;
  };
  const labelColumn = schema.find((column) => column.type === "text"); const numberColumn = schema.find((column) => column.type === "number");
  const chartData = labelColumn && numberColumn ? Array.from({ length: Math.min(20, numberColumn.lastRow - numberColumn.firstRow + 1) }, (_, i) => { const row = numberColumn.firstRow + i; return { label: String(computed[`${labelColumn.letter}${row}`] ?? ""), value: computed[`${numberColumn.letter}${row}`] }; }).filter((item): item is { label: string; value: number } => Boolean(item.label) && typeof item.value === "number") : [];
  const chartMax = Math.max(1, ...chartData.map((item) => Math.abs(item.value)));
  return <div className="sheet-workspace">
    <ArtifactNavigator label="Sheets" count={workspace.sheets.length} countLabel={`${workspace.sheets.length} sheets`} actions={<><button type="button" onClick={() => onChange(createSheet(workspace, "Untitled sheet"))}><Plus size={14} /> New</button><button type="button" aria-label="Import sheet" title="Import Excel or CSV" onClick={() => uploadRef.current?.click()}><Upload size={14} /></button>{upload}</>}>
      {workspace.sheets.map((sheet) => <ArtifactNavigatorItem active={sheet.id === active.id} icon={Table2} title={sheet.title} meta={`Revision ${sheet.revision}`} key={sheet.id} onSelect={() => { setColumns([]); setSelectedRow(null); setSelected("A1"); jumpToRow(1); onChange({ ...workspace, activeSheetId: sheet.id }); }} menu={<FileActionMenu name={sheet.title} kind="sheet" onRename={(title) => onChange(renameArtifact(workspace, "sheet", sheet.id, title))} onDuplicate={() => onChange(duplicateArtifact(workspace, "sheet", sheet.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "sheet", sheet.id))} onExport={() => download(`${sheet.title}.csv`, exportCsv(sheet))} />} />)}
    </ArtifactNavigator>
    <section className="sheet-editor"><header><EditableArtifactTitle title={active.title} ariaLabel="Sheet title" onCommit={(title) => onChange(renameArtifact(workspace, "sheet", active.id, title))} /><button className="quiet-action" type="button" aria-pressed={chartOpen} onClick={() => setChartOpen(!chartOpen)}><BarChart3 size={14} /> Chart</button></header>
      <div className="sheet-formatbar" role="toolbar" aria-label="Sheet formatting">
        {([{ key: "bold", label: "Bold", icon: Bold }, { key: "italic", label: "Italic", icon: Italic }, { key: "underline", label: "Underline", icon: Underline }] as const).map(({ key, label, icon: Icon }) => <button type="button" key={key} aria-label={label} title={label} aria-pressed={Boolean(style[key])} onClick={() => formatSelection({ [key]: !style[key] })}><Icon size={15} /></button>)}
        <select aria-label="Cell number format" value={active.cells[selected]?.format ?? "general"} onChange={(event) => commit({}, Object.fromEntries(selectedAddresses().map((address) => [address, event.target.value as SheetCellFormat])))}><option value="general" disabled>Automatic</option><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency (€)</option><option value="percent">Percent</option></select>
        {([{ align: "left", icon: AlignLeft }, { align: "center", icon: AlignCenter }, { align: "right", icon: AlignRight }] as const).map(({ align, icon: Icon }) => <button type="button" key={align} title={`Align ${align}`} aria-label={`Align ${align}`} aria-pressed={style.align === align} onClick={() => formatSelection({ align })}><Icon size={15} /></button>)}
        <label className="sheet-fill">Fill<input aria-label="Cell background" type="color" value={style.background ?? "#ffffff"} onChange={(event) => formatSelection({ background: event.target.value })} /></label>
        <button type="button" onClick={() => { try { commit({}, undefined, undefined, insertSheetRows(active.cells, Number(selected.slice(1)))); setMessage(`Inserted row ${selected.slice(1)}.`); } catch (error) { setMessage((error as Error).message); } }}><Plus size={14} /> Insert row</button>
        <button type="button" title="Sum the values above the selected cell" onClick={() => { const row = Number(selected.slice(1)); if (row <= 1) { setMessage("Select a cell below the numbers to sum."); return; } commit({ [selected]: `=SUM(${selected[0]}1:${selected[0]}${row - 1})` }); }}><Sigma size={14} /> Sum</button>
      </div>
      <div className="sheet-formula-bar"><span>{columns.length ? columns.join(", ") : selectedRow ? `Row ${selectedRow}` : selected}</span><label htmlFor="sheet-formula">fx</label><input id="sheet-formula" aria-label="Formula or cell value" placeholder="Enter a value or formula, e.g. =SUM(B2:B10)" value={String(active.cells[selected]?.value ?? "")} onChange={(event) => commit({ [selected]: event.target.value })} /><output>{formatSheetValue(computed[selected], active.cells[selected]?.format)}</output></div>
      <div className="sheet-main" data-has-chart={chartOpen && chartData.length > 0}><div className="grid-scroll" tabIndex={0} ref={gridRef} role="region" aria-label="Sheet grid" onScroll={(event) => setRowStart(Math.max(0, Math.min(999, Math.floor(event.currentTarget.scrollTop / ROW_HEIGHT) - 4)))}><div className="sheet-grid" role="group" style={{ gridTemplateColumns: "42px repeat(26, 112px)" }} aria-label={active.title}>
        <span className="grid-corner" />{COLUMNS.map((column) => <button className="sheet-column" type="button" key={column} aria-label={`Select column ${column}`} aria-pressed={columns.includes(column)} onClick={(event) => { const anchor = columns[0] ?? selected[0]; const nextColumns = event.shiftKey ? COLUMNS.slice(Math.min(COLUMNS.indexOf(anchor), COLUMNS.indexOf(column)), Math.max(COLUMNS.indexOf(anchor), COLUMNS.indexOf(column)) + 1) : [column]; setColumns(nextColumns); setSelectedRow(null); setSelected(`${column}1`); setWorkspaceSelection({ kind: "sheet", artifactId: active.id, range: `${nextColumns[0]}:${nextColumns.at(-1)}` }); setEditing(null); }}>{column}</button>)}
        {rowStart > 0 ? <div className="sheet-row-spacer" style={{ height: rowStart * ROW_HEIGHT }} /> : null}
        {rows.flatMap((row) => [<button className="sheet-row-number" type="button" key={`row-${row}`} aria-label={`Select row ${row}`} aria-pressed={selectedRow === row} onClick={() => { setSelectedRow(row); setColumns([]); setSelected(`A${row}`); setWorkspaceSelection({ kind: "sheet", artifactId: active.id, range: `A${row}:Z${row}` }); setEditing(null); }}>{row}</button>, ...COLUMNS.map((column) => {
          const address = `${column}${row}`; const cell = active.cells[address]; const cellStyle = cell?.style; const raw = String(cell?.value ?? ""); const displayed = editing === address ? raw : formatSheetValue(computed[address], cell?.format);
          return <input key={`${active.id}-${address}`} ref={(node) => { if (node) cellRefs.current[address] = node; else delete cellRefs.current[address]; }} aria-label={address} data-selected={selected === address || columns.includes(column) || selectedRow === row} data-error={String(computed[address] ?? "").startsWith("#")} value={displayed} title={raw.startsWith("=") ? `${raw} → ${computed[address]}` : raw} style={{ fontWeight: cellStyle?.bold ? 700 : undefined, fontStyle: cellStyle?.italic ? "italic" : undefined, textDecoration: cellStyle?.underline ? "underline" : undefined, textAlign: cellStyle?.align ?? (typeof computed[address] === "number" ? "right" : "left"), color: cellStyle?.color, backgroundColor: cellStyle?.background }} onFocus={() => { setSelected(address); setWorkspaceSelection({ kind: "sheet", artifactId: active.id, range: address }); setEditing(address); setColumns([]); setSelectedRow(null); }} onBlur={() => setEditing(null)} onKeyDown={(event) => {
            const input = event.currentTarget;
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
            if (event.key === "ArrowLeft" && (input.selectionStart !== 0 || input.selectionEnd !== 0)) return;
            if (event.key === "ArrowRight" && (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length)) return;
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key) && moveCellFocus(address, event.key)) event.preventDefault();
          }} onChange={(event) => commit({ [address]: event.target.value })} onPaste={(event) => { const text = event.clipboardData.getData("text"); if (!text.includes("\t") && !text.includes("\n")) return; const data = Papa.parse<string[]>(text, { delimiter: "\t", skipEmptyLines: true }).data; const col = column.charCodeAt(0) - 65; if (row + data.length - 1 > 1000 || data.some((line) => col + line.length > 26)) { event.preventDefault(); setMessage("Pasted data exceeds the sheet limits."); return; } event.preventDefault(); commit(Object.fromEntries(data.flatMap((line, i) => line.map((value, j) => [`${COLUMNS[col + j]}${row + i}`, value])))); }} />;
        })])}
        {rowStart + rows.length < 1000 ? <div className="sheet-row-spacer" style={{ height: (1000 - rowStart - rows.length) * ROW_HEIGHT }} /> : null}
      </div></div>{chartOpen && chartData.length ? <aside className="sheet-chart" aria-label={`Chart of ${numberColumn?.label}`}><header><BarChart3 size={14} /><strong>{numberColumn?.label} by {labelColumn?.label}</strong></header>{chartData.map((item, i) => <div key={i}><span>{item.label}</span><i style={{ width: `${Math.max(3, Math.abs(item.value) / chartMax * 100)}%` }} /><strong>{item.value}</strong></div>)}</aside> : null}</div>
      <div className="sheet-status"><label>Jump to rows <select aria-label="Sheet rows" value={Math.min(62, Math.floor(rowStart / 16))} onChange={(event) => jumpToRow(Number(event.target.value) * 16 + 1)}>{Array.from({ length: 63 }, (_, page) => <option key={page} value={page}>{page * 16 + 1}–{Math.min(1000, (page + 1) * 16)}</option>)}</select></label><span role="status">{message || `${selected}: ${String(computed[selected] ?? "empty")}`}</span><span>1,000 rows · A–Z</span></div>
    </section><WorkspaceResizeHandle />
  </div>;
}

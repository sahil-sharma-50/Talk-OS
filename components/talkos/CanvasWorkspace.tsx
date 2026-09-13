"use client";

import { AlignHorizontalDistributeCenter, Circle, Diamond, Download, FileImage, FilePlus2, ImagePlus, Minus, MousePointer2, Pencil, Plus, Redo2, Square, StickyNote, Trash2, Type, Undo2, Waypoints } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { CanvasElement } from "@/features/canvas/canvas.types";
import { createCanvas } from "@/features/canvas/canvas-scene";
import { arrangeCanvas } from "@/features/canvas/canvas-layout";
import { exportCanvasPng, exportCanvasSvg } from "@/features/canvas/canvas-export";
import { applyWorkspaceChanges, duplicateArtifact, moveArtifactToTrash, redoWorkspaceChange, renameArtifact, undoLastWorkspaceChange } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { CanvasEditor, type CanvasTool } from "./CanvasEditor";
import { CanvasOutline } from "./CanvasOutline";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

const download = (name: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
};
const downloadBlob = (name: string, blob: Blob) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };

export function CanvasWorkspace({ workspace, onChange }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }) {
  const active = workspace.canvases.find((canvas) => canvas.id === workspace.activeCanvasId) ?? workspace.canvases[0];
  const [tool, setTool] = useState<CanvasTool>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const createBoard = () => {
    const result = createCanvas(workspace, "Untitled canvas", [], "user");
    if (result.ok) onChange(result.workspace);
  };
  const commit = useCallback((elements: CanvasElement[], label: string) => {
    if (!active) return;
    const result = applyWorkspaceChanges(workspace, label, [{ kind: "canvas", artifactId: active.id, expectedRevision: active.revision, elements }], "user");
    if (result.ok) onChange(result.workspace);
    else setNotice("The canvas changed elsewhere. Your edit was not applied.");
  }, [active, onChange, workspace]);
  const add = (element: CanvasElement, label: string) => active && commit([...active.elements, element], label);
  const nextPosition = () => { const count = active?.elements.filter((item) => !["arrow", "line"].includes(item.type)).length ?? 0; return { x: 70 + (count % 2) * 240, y: 70 + Math.floor(count / 2) * 170 }; };
  const addNode = (type: CanvasElement["type"], text: string) => { const position = nextPosition(); add({ id: `${type}-${crypto.randomUUID()}`, type, text, ...position, width: 180, height: type === "sticky" ? 140 : 80 }, `Added ${text}`); };
  const undo = () => { const result = undoLastWorkspaceChange(workspace); if (result.ok) onChange(result.workspace); };
  const redo = () => { const change = workspace.changeHistory.findLast((item) => item.undone); if (!change) return; const result = redoWorkspaceChange(workspace, change.id); if (result.ok) onChange(result.workspace); };
  const removeSelection = () => { if (active && selectedIds.length) { const ids = new Set(selectedIds); commit(active.elements.filter((item) => !ids.has(item.id) && !ids.has(item.sourceId ?? "") && !ids.has(item.targetId ?? "")), "Removed canvas items"); setSelectedIds([]); } };
  const groupSelection = () => { if (!active || selectedIds.length < 2) { setNotice("Select at least two items to group."); return; } const ids = new Set(selectedIds); const groupId = `group-${crypto.randomUUID()}`; commit(active.elements.map((item) => ids.has(item.id) ? { ...item, groupId } : item), "Grouped canvas items"); };
  const ungroupSelection = () => { if (!active) return; const ids = new Set(selectedIds); commit(active.elements.map((item) => ids.has(item.id) ? { ...item, groupId: undefined } : item), "Ungrouped canvas items"); };
  const arrange = () => { if (!active) return; const nodeIds = selectedIds.filter((id) => active.elements.some((item) => item.id === id && !["arrow", "line", "freehand", "image"].includes(item.type))); if (!nodeIds.length) { setNotice("Select diagram nodes to arrange."); return; } const result = arrangeCanvas(active, nodeIds, "LR"); if (result.ok) commit(result.canvas.elements, "Arranged canvas items"); else setNotice(result.detail); };
  const exportSvg = () => { if (!active) return; const svg = exportCanvasSvg(active, workspace.canvasAssets); downloadBlob(`${active.title}.svg`, new Blob([svg], { type: "image/svg+xml" })); };
  const exportPng = async () => { if (!active) return; try { downloadBlob(`${active.title}.png`, await exportCanvasPng(exportCanvasSvg(active, workspace.canvasAssets))); } catch { setNotice("PNG export is unavailable in this browser. SVG and JSON export still work."); } };

  if (!active) return <div className="tool-empty"><Waypoints size={30} /><h2>Think where you can see it</h2><p>Sketch freely, build diagrams, or ask TalkOS to map an idea.</p><button type="button" onClick={createBoard}><FilePlus2 size={14} /> Create a canvas</button></div>;

  const addConnector = () => {
    const nodes = selectedIds.filter((id) => active.elements.some((item) => item.id === id && item.type !== "arrow" && item.type !== "freehand"));
    if (nodes.length !== 2) { setNotice("Select exactly two items, then add an arrow."); return; }
    add({ id: `arrow-${crypto.randomUUID()}`, type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: nodes[0], targetId: nodes[1] }, "Connected canvas items");
  };

  return <div className="canvas-workspace">
    <ArtifactNavigator label="Canvases" count={workspace.canvases.length} countLabel={`${workspace.canvases.length} canvases`} actions={<button type="button" onClick={createBoard}><Plus size={14} /> New</button>}>
      {workspace.canvases.map((canvas) => <ArtifactNavigatorItem active={canvas.id === active.id} icon={Waypoints} title={canvas.title} meta={`${canvas.elements.length} ${canvas.elements.length === 1 ? "item" : "items"}`} key={canvas.id} onSelect={() => onChange({ ...workspace, activeCanvasId: canvas.id })} menu={<FileActionMenu name={canvas.title} kind="canvas" onRename={(name) => onChange(renameArtifact(workspace, "canvas", canvas.id, name))} onDuplicate={() => onChange(duplicateArtifact(workspace, "canvas", canvas.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "canvas", canvas.id))} onExport={() => download(`${canvas.title}.talkos-canvas.json`, { canvas, assets: workspace.canvasAssets })} />} />)}
    </ArtifactNavigator>
    <section className="canvas-main">
      <header className="canvas-toolbar">
        <div className="canvas-title"><EditableArtifactTitle title={active.title} ariaLabel="Canvas title" onCommit={(title) => onChange(renameArtifact(workspace, "canvas", active.id, title))} /><span>rev {active.revision} · scroll to zoom · Alt-drag to pan</span></div>
        <div role="toolbar" aria-label="Canvas tools">
          <button type="button" aria-pressed={tool === "select"} onClick={() => setTool("select")}><MousePointer2 size={15} /> Select</button>
          <button type="button" aria-pressed={tool === "draw"} onClick={() => setTool("draw")}><Pencil size={15} /> Draw</button>
          <button type="button" onClick={() => addNode("sticky", "Sticky note")}><StickyNote size={15} /> Sticky</button>
          <button type="button" onClick={() => addNode("text", "Text")}><Type size={15} /> Text</button>
          <button type="button" onClick={() => addNode("process", "Process")}><Square size={15} /> Process</button>
          <button type="button" onClick={() => addNode("decision", "Decision?")}><Diamond size={15} /> Decision</button>
          <button type="button" onClick={() => add({ id: `rectangle-${crypto.randomUUID()}`, type: "rectangle", ...nextPosition(), width: 190, height: 110 }, "Added rectangle")}><Square size={15} /> Rectangle</button>
          <button type="button" onClick={() => add({ id: `ellipse-${crypto.randomUUID()}`, type: "ellipse", ...nextPosition(), width: 170, height: 110 }, "Added ellipse")}><Circle size={15} /> Ellipse</button>
          <button type="button" onClick={() => add({ id: `line-${crypto.randomUUID()}`, type: "line", ...nextPosition(), width: 180, height: 0 }, "Added line")}><Minus size={15} /> Line</button>
          <button type="button" onClick={addConnector}><Waypoints size={15} /> Arrow</button>
          <button type="button" onClick={arrange} disabled={!selectedIds.length}><AlignHorizontalDistributeCenter size={15} /> Arrange</button>
          <button type="button" onClick={groupSelection} disabled={selectedIds.length < 2}>Group</button>
          <button type="button" onClick={ungroupSelection} disabled={!selectedIds.length}>Ungroup</button>
          <button type="button" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} /> Image</button>
          <button type="button" onClick={removeSelection} disabled={!selectedIds.length}><Trash2 size={15} /> Delete</button>
          <button type="button" onClick={undo} disabled={!workspace.changeHistory.some((item) => !item.undone)}><Undo2 size={15} /> Undo</button>
          <button type="button" onClick={redo} disabled={!workspace.changeHistory.some((item) => item.undone)}><Redo2 size={15} /> Redo</button>
          <button type="button" onClick={exportSvg}><Download size={15} /> SVG</button>
          <button type="button" onClick={() => void exportPng()}><FileImage size={15} /> PNG</button>
          <button type="button" onClick={() => download(`${active.title}.talkos-canvas.json`, { canvas: active, assets: workspace.canvasAssets })}><Download size={15} /> JSON</button>
        </div>
        <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Add image to canvas" onChange={(event) => {
          const file = event.target.files?.[0]; if (!file) return;
          if (file.size > 10 * 1024 * 1024) { setNotice("Images must be 10 MB or smaller."); return; }
          const reader = new FileReader(); reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : ""; if (!dataUrl) return;
            const assetId = `asset-${crypto.randomUUID()}`;
            const result = applyWorkspaceChanges(workspace, "Added image", [{ kind: "canvas", artifactId: active.id, expectedRevision: active.revision, elements: [...active.elements, { id: `image-${crypto.randomUUID()}`, type: "image", x: 180, y: 140, width: 240, height: 160, assetId }] }], "user");
            if (result.ok) onChange({ ...result.workspace, canvasAssets: { ...workspace.canvasAssets, [assetId]: { id: assetId, mimeType: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif", dataUrl } } });
          }; reader.readAsDataURL(file);
        }} />
      </header>
      {notice ? <p className="canvas-notice" role="status">{notice}</p> : null}
      <CanvasEditor board={active} assets={workspace.canvasAssets} tool={tool} onCommit={commit} onSelectionChange={setSelectedIds} onUndo={undo} onRedo={redo} onDeleteSelection={removeSelection} />
      <CanvasOutline elements={active.elements} selectedIds={selectedIds} onSelect={(id) => setSelectedIds([id])} onTextChange={(id, value) => commit(active.elements.map((item) => item.id === id ? { ...item, text: value } : item), "Edited canvas label")} />
    </section>
    <WorkspaceResizeHandle />
  </div>;
}

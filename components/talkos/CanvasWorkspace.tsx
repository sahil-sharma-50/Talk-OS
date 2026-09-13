"use client";

import { Eraser, Hand, Maximize, AlignHorizontalDistributeCenter, Circle, Diamond, Download, FileImage, FilePlus2, ImagePlus, Minus, MousePointer2, Pencil, Plus, Redo2, Square, StickyNote, Trash2, Type, Undo2, Waypoints } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasElement } from "@/features/canvas/canvas.types";
import { setWorkspaceSelection } from "@/features/workspace/workspace-context";
import { canvasLabelSize } from "@/features/canvas/canvas-geometry";
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
  const [fitRequest, setFitRequest] = useState(0);
  const [clearRevision, setClearRevision] = useState(0);
  const viewportRef = useRef({ x: 300, y: 220, width: 600, height: 440 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const latestRef = useRef({ workspace, onChange });
  useEffect(() => { latestRef.current = { workspace, onChange }; }, [workspace, onChange]);
  const finishImage = (canvasId: string, dataUrl: string, mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif") => {
    const { workspace, onChange } = latestRef.current;
    const target = workspace.canvases.find((item) => item.id === canvasId);
    if (!target) { setNotice("The destination canvas was removed before the image finished loading."); return; }
    const assetId = `asset-${crypto.randomUUID()}`;
    const result = applyWorkspaceChanges(workspace, "Added image", [{ kind: "canvas", artifactId: target.id, expectedRevision: target.revision, elements: [...target.elements, { id: `image-${crypto.randomUUID()}`, type: "image", x: viewportRef.current.x - 120, y: viewportRef.current.y - 80, width: 240, height: 160, assetId }] }], "user");
    if (result.ok) { onChange({ ...result.workspace, canvasAssets: { ...workspace.canvasAssets, [assetId]: { id: assetId, mimeType, dataUrl } } }); setNotice(""); }
  };

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
  const addSticky = () => {
    if (!active) return;
    const size = canvasLabelSize("sticky", "Sticky note");
    const offset = active.elements.filter((item) => item.type === "sticky").length % 5 * 16;
    add({ id: `sticky-${crypto.randomUUID()}`, type: "sticky", text: "Sticky note", x: viewportRef.current.x - size.width / 2 + offset, y: viewportRef.current.y - size.height / 2 + offset, ...size }, "Added sticky note");
    setTool("select"); setNotice("");
  };
  const undoable = workspace.changeHistory.findLast((item) => !item.undone && active && Object.hasOwn(item.afterRevisions, active.id));
  const redoable = workspace.changeHistory.findLast((item) => item.undone && (active ? Object.hasOwn(item.afterRevisions, active.id) : item.after?.some((snapshot) => snapshot.artifactType === "canvas")));
  const undo = () => { if (!undoable) return; const result = undoLastWorkspaceChange(workspace, undoable.id); if (result.ok) { onChange(result.workspace); setNotice(""); } else setNotice("This change can no longer be undone because its files changed again."); };
  const redo = () => { if (!redoable) return; const result = redoWorkspaceChange(workspace, redoable.id); if (result.ok) { onChange(result.workspace); setNotice(""); } else setNotice("This change can no longer be redone because its files changed again."); };
  const removeSelection = () => { if (active && selectedIds.length) { const ids = new Set(selectedIds); commit(active.elements.filter((item) => !ids.has(item.id) && !ids.has(item.sourceId ?? "") && !ids.has(item.targetId ?? "")), "Removed canvas items"); setSelectedIds([]); } };
  const clearAll = () => {
    if (!active?.elements.length) return;
    commit([], "Cleared canvas"); setSelectedIds([]); setTool("select"); setClearRevision((value) => value + 1);
    setNotice("Canvas cleared. Use Undo to restore all items.");
  };
  const groupSelection = () => { if (!active || selectedIds.length < 2) { setNotice("Select at least two items to group."); return; } const ids = new Set(selectedIds); const groupId = `group-${crypto.randomUUID()}`; commit(active.elements.map((item) => ids.has(item.id) ? { ...item, groupId } : item), "Grouped canvas items"); };
  const ungroupSelection = () => { if (!active) return; const ids = new Set(selectedIds); commit(active.elements.map((item) => ids.has(item.id) ? { ...item, groupId: undefined } : item), "Ungrouped canvas items"); };
  const arrange = () => { if (!active) return; const nodeIds = selectedIds.filter((id) => active.elements.some((item) => item.id === id && !["arrow", "line", "freehand", "image"].includes(item.type))); if (!nodeIds.length) { setNotice("Select diagram nodes to arrange."); return; } const result = arrangeCanvas(active, nodeIds, "LR"); if (result.ok) { commit(result.canvas.elements, "Arranged canvas items"); setFitRequest((value) => value + 1); } else setNotice(result.detail); };
  const exportSvg = () => { if (!active) return; const svg = exportCanvasSvg(active, workspace.canvasAssets); downloadBlob(`${active.title}.svg`, new Blob([svg], { type: "image/svg+xml" })); };
  const exportPng = async () => { if (!active) return; try { downloadBlob(`${active.title}.png`, await exportCanvasPng(exportCanvasSvg(active, workspace.canvasAssets))); } catch { setNotice("PNG export is unavailable in this browser. SVG and JSON export still work."); } };

  if (!active) return <div className="tool-empty"><Waypoints size={30} /><h2>Create a canvas</h2><p>Draw, add images, or ask TalkOS to build a diagram.</p><button type="button" onClick={createBoard}><FilePlus2 size={14} /> Create a canvas</button>{redoable ? <button type="button" onClick={redo}><Redo2 size={14} /> Redo canvas</button> : null}</div>;

  const addConnector = () => {
    const nodes = selectedIds.filter((id) => active.elements.some((item) => item.id === id && item.type !== "arrow" && item.type !== "freehand"));
    if (nodes.length !== 2) { setNotice("Select exactly two items, then connect them."); return; }
    add({ id: `arrow-${crypto.randomUUID()}`, type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: nodes[0], targetId: nodes[1] }, "Connected canvas items");
  };

  return <div className="canvas-workspace">
    <ArtifactNavigator label="Canvases" count={workspace.canvases.length} countLabel={`${workspace.canvases.length} canvases`} actions={<button type="button" onClick={createBoard}><Plus size={14} /> New</button>}>
      {workspace.canvases.map((canvas) => <ArtifactNavigatorItem active={canvas.id === active.id} icon={Waypoints} title={canvas.title} meta={`${canvas.elements.length} ${canvas.elements.length === 1 ? "item" : "items"}`} key={canvas.id} onSelect={() => onChange({ ...workspace, activeCanvasId: canvas.id })} menu={<FileActionMenu name={canvas.title} kind="canvas" onRename={(name) => onChange(renameArtifact(workspace, "canvas", canvas.id, name))} onDuplicate={() => onChange(duplicateArtifact(workspace, "canvas", canvas.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "canvas", canvas.id))} onExport={() => download(`${canvas.title}.talkos-canvas.json`, { canvas, assets: workspace.canvasAssets })} />} />)}
    </ArtifactNavigator>
    <section className="canvas-main">
      <header className="canvas-toolbar">
        <div className="canvas-header-row">        <div className="canvas-title"><EditableArtifactTitle title={active.title} ariaLabel="Canvas title" onCommit={(title) => onChange(renameArtifact(workspace, "canvas", active.id, title))} /><span role="status">{selectedIds.length ? `${selectedIds.length} selected · ` : ""}{tool === "pan" ? "Drag to move the canvas" : tool === "select" ? "Drag to select · right-drag also selects" : `Drag to draw ${tool}`}</span></div><div className="canvas-actions" role="toolbar" aria-label="Canvas actions">          <button className="canvas-action--danger" type="button" onClick={removeSelection} disabled={!selectedIds.length}><Trash2 size={15} /> Delete</button>
          <button className="canvas-action--danger" type="button" onClick={clearAll} disabled={!active.elements.length} title="Clear every item on this canvas. Undo restores them."><Eraser size={15} /> Clear all</button>
          <button type="button" onClick={undo} disabled={!undoable}><Undo2 size={15} /> Undo</button>
          <button type="button" onClick={redo} disabled={!redoable}><Redo2 size={15} /> Redo</button>
          <button type="button" onClick={exportSvg}><Download size={15} /> SVG</button>
          <button type="button" onClick={() => void exportPng()}><FileImage size={15} /> PNG</button>
          <button type="button" onClick={() => download(`${active.title}.talkos-canvas.json`, { canvas: active, assets: workspace.canvasAssets })}><Download size={15} /> JSON</button><button type="button" onClick={() => setFitRequest((value) => value + 1)}><Maximize size={15} /> Fit</button></div></div>
        <div role="toolbar" aria-label="Canvas tools">
          <button type="button" aria-pressed={tool === "select"} title="Drag a selection box with either mouse button. Shift-click adds items. Alt-drag pans." onClick={() => setTool("select")}><MousePointer2 size={15} /> Select</button>
          <button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")}><Hand size={15} /> Pan</button>
          <button type="button" aria-pressed={tool === "draw"} onClick={() => setTool("draw")}><Pencil size={15} /> Draw</button>
          <button type="button" onClick={addSticky} title="Add a sticky note in view"><StickyNote size={15} /> Sticky</button>
          <button type="button" aria-pressed={tool === "text"} onClick={() => setTool("text")} ><Type size={15} /> Text</button>
          <button type="button" aria-pressed={tool === "process"} onClick={() => setTool("process")} ><Square size={15} /> Process</button>
          <button type="button" aria-pressed={tool === "decision"} onClick={() => setTool("decision")} ><Diamond size={15} /> Decision</button>
          <button type="button" aria-pressed={tool === "rectangle"} onClick={() => setTool("rectangle")} ><Square size={15} /> Rectangle</button>
          <button type="button" aria-pressed={tool === "ellipse"} onClick={() => setTool("ellipse")} ><Circle size={15} /> Ellipse</button>
          <button type="button" aria-pressed={tool === "line"} onClick={() => setTool("line")} ><Minus size={15} /> Line</button>
          <button type="button" aria-pressed={tool === "arrow"} onClick={() => setTool("arrow")}><Waypoints size={15} /> Arrow</button>
          <button type="button" onClick={addConnector} disabled={selectedIds.length !== 2} title="Connect two selected items with an arrow">Connect</button>
          <button type="button" onClick={arrange} disabled={!selectedIds.length}><AlignHorizontalDistributeCenter size={15} /> Arrange</button>
          <button type="button" onClick={groupSelection} disabled={selectedIds.length < 2}>Group</button>
          <button type="button" onClick={ungroupSelection} disabled={!selectedIds.length}>Ungroup</button>
          <button type="button" onClick={() => imageInputRef.current?.click()}><ImagePlus size={15} /> Image</button>

        </div>
        <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Add image to canvas" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          if (file.size > 10 * 1024 * 1024) { setNotice("Images must be 10 MB or smaller."); return; }
          if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) { setNotice("Choose a PNG, JPEG, WebP, or GIF image."); return; }
          const canvasId = active.id;
          setNotice("Loading image…");
          const reader = new FileReader(); reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : ""; if (!dataUrl) return;
            const image = new Image();
            image.onload = () => finishImage(canvasId, dataUrl, file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif");
            image.onerror = () => setNotice("That image could not be decoded. Try another file.");
            image.src = dataUrl;
          }; reader.onerror = () => setNotice("That image could not be read."); reader.readAsDataURL(file);
        }} />
      </header>
      {notice ? <p className="canvas-notice" role="status">{notice}</p> : null}
      <CanvasEditor key={clearRevision} fitRequest={fitRequest} onToolChange={setTool} onViewportChange={(viewport) => { viewportRef.current = viewport; }} board={active} assets={workspace.canvasAssets} tool={tool} onCommit={commit} onSelectionChange={(ids) => { setSelectedIds(ids); setWorkspaceSelection({ kind: "canvas", artifactId: active.id, ids }); }} onUndo={undo} onRedo={redo} onDeleteSelection={removeSelection} />
      <CanvasOutline elements={active.elements} selectedIds={selectedIds} onSelect={(id) => setSelectedIds([id])} onTextChange={(id, value) => commit(active.elements.map((item) => item.id === id ? { ...item, text: value } : item), "Edited canvas label")} />
    </section>
    <WorkspaceResizeHandle />
  </div>;
}

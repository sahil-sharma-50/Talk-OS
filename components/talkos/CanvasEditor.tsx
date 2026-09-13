"use client";

import type { Canvas as FabricCanvas, FabricObject, Path as FabricPath } from "fabric";
import { useEffect, useRef, useState } from "react";
import { getCanvasRenderMetrics } from "@/features/canvas/canvas-rendering";
import { mergeCanvasTransform } from "@/features/canvas/canvas-transform";
import type { CanvasAsset, CanvasElement, WorkspaceCanvas } from "@/features/canvas/canvas.types";

export type CanvasTool = "select" | "draw";

interface TaggedObject extends FabricObject {
  talkosId?: string;
  talkosType?: CanvasElement["type"];
}

interface CanvasEditorProps {
  board: WorkspaceCanvas;
  assets: Record<string, CanvasAsset>;
  tool: CanvasTool;
  onCommit: (elements: CanvasElement[], label: string) => void;
  onSelectionChange: (ids: string[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelection: () => void;
}

const center = (element: CanvasElement) => ({ x: element.x + element.width / 2, y: element.y + element.height / 2 });
const canvasFontFamily = '"Segoe UI Variable Text", "Segoe UI", sans-serif';

const mergeTransform = (elements: CanvasElement[], target: TaggedObject) => mergeCanvasTransform(elements, {
  id: target.talkosId,
  left: target.left,
  top: target.top,
  width: target.width,
  height: target.height,
  scaleX: target.scaleX,
  scaleY: target.scaleY,
  angle: target.angle,
  text: "text" in target && typeof target.text === "string" ? target.text : undefined,
});

export function CanvasEditor({ board, assets, tool, onCommit, onSelectionChange, onUndo, onRedo, onDeleteSelection }: CanvasEditorProps) {
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((revision) => revision + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvasElementRef.current;
    const host = hostRef.current;
    if (!element || !host) return;
    let disposed = false;
    let canvas: FabricCanvas | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void import("fabric").then(async (fabric) => {
      if (disposed) return;
      const styles = getComputedStyle(host);
      const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
      const ink = color("--ink", "#202532");
      const surface = color("--surface", "#ffffff");
      const line = color("--line-strong", "#303846");
      const muted = color("--muted", "#596273");
      const blue = color("--blue", "#2563eb");
      const renderMetrics = getCanvasRenderMetrics(host.clientWidth, host.clientHeight, window.devicePixelRatio);
      fabric.config.configure({ devicePixelRatio: renderMetrics.pixelRatio });
      canvas = new fabric.Canvas(element, {
        width: renderMetrics.width,
        height: renderMetrics.height,
        backgroundColor: "transparent",
        enableRetinaScaling: true,
        preserveObjectStacking: true,
        selection: tool === "select",
      });
      canvas.isDrawingMode = tool === "draw";
      if (canvas.isDrawingMode) {
        const brush = new fabric.PencilBrush(canvas);
        brush.color = blue;
        brush.width = 3;
        canvas.freeDrawingBrush = brush;
      }

      const byId = new Map(board.elements.map((item) => [item.id, item]));
      for (const item of board.elements) {
        let object: TaggedObject | null = null;
        const common = { left: item.x, top: item.y, angle: item.rotation ?? 0, fill: item.fill ?? surface, stroke: item.stroke ?? line, strokeWidth: 1.5 };
        if (item.type === "arrow" || item.type === "line") {
          const source = item.sourceId ? byId.get(item.sourceId) : undefined;
          const target = item.targetId ? byId.get(item.targetId) : undefined;
          const from = source ? center(source) : { x: item.x, y: item.y };
          const to = target ? center(target) : { x: item.x + item.width, y: item.y + item.height };
          const connector = new fabric.Line([from.x, from.y, to.x, to.y], { stroke: item.stroke ?? muted, strokeWidth: 2 });
          if (item.type === "arrow") {
            const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90;
            const arrowhead = new fabric.Triangle({ left: to.x, top: to.y, width: 11, height: 13, fill: item.stroke ?? muted, angle, originX: "center", originY: "center" });
            const parts: FabricObject[] = [connector, arrowhead];
            if (item.text) parts.push(new fabric.Text(item.text, { left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 - 13, originX: "center", originY: "center", fontFamily: canvasFontFamily, fontSize: 13, fill: ink, backgroundColor: surface, objectCaching: false }));
            object = new fabric.Group(parts, { selectable: false, evented: false, objectCaching: false }) as TaggedObject;
          } else object = connector as TaggedObject;
        } else if (item.type === "freehand" && item.points?.length) {
          const path = item.points.map(([x, y], index) => `${index ? "L" : "M"} ${x + item.x} ${y + item.y}`).join(" ");
          object = new fabric.Path(path, { fill: "", stroke: item.stroke ?? blue, strokeWidth: 3 }) as TaggedObject;
        } else if (item.type === "image" && item.assetId && assets[item.assetId]) {
          try {
            const image = await fabric.FabricImage.fromURL(assets[item.assetId].dataUrl);
            image.set({ left: item.x, top: item.y, angle: item.rotation ?? 0 });
            image.scaleToWidth(item.width);
            image.scaleToHeight(item.height);
            object = image as TaggedObject;
          } catch {
            object = new fabric.Textbox("Image unavailable", { ...common, width: item.width, height: item.height, fill: "#b42318", fontSize: 14 }) as TaggedObject;
          }
        } else if (item.type === "ellipse") {
          object = new fabric.Ellipse({ ...common, rx: item.width / 2, ry: item.height / 2 }) as TaggedObject;
        } else if (item.type === "decision") {
          const shape = new fabric.Polygon([
            { x: item.width / 2, y: 0 }, { x: item.width, y: item.height / 2 },
            { x: item.width / 2, y: item.height }, { x: 0, y: item.height / 2 },
          ], { fill: item.fill ?? surface, stroke: item.stroke ?? line, strokeWidth: 1.5, selectable: false, evented: false });
          const label = new fabric.Textbox(item.text || "Decision?", { left: item.width / 2, top: item.height / 2, width: item.width * .6, originX: "center", originY: "center", textAlign: "center", fontFamily: canvasFontFamily, fontSize: 15, fill: ink, selectable: false, evented: false, objectCaching: false });
          object = new fabric.Group([shape, label], { left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: false, subTargetCheck: false, objectCaching: false }) as TaggedObject;
        } else if (item.type === "rectangle") {
          object = new fabric.Rect({ ...common, width: item.width, height: item.height, rx: 8, ry: 8 }) as TaggedObject;
        } else if (item.type === "process" || item.type === "sticky") {
          const shape = new fabric.Rect({ left: 0, top: 0, width: item.width, height: item.height, rx: 8, ry: 8, fill: item.type === "sticky" ? "#fff1a8" : item.fill ?? surface, stroke: item.stroke ?? line, strokeWidth: 1.5, selectable: false, evented: false });
          const label = new fabric.Textbox(item.text || (item.type === "sticky" ? "Sticky note" : "Process"), { left: 14, top: 14, width: item.width - 28, textAlign: item.type === "process" ? "center" : "left", fontFamily: canvasFontFamily, fontSize: 16, lineHeight: 1.3, fill: item.type === "sticky" ? "#202532" : ink, selectable: false, evented: false, objectCaching: false });
          object = new fabric.Group([shape, label], { left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: false, subTargetCheck: false, objectCaching: false }) as TaggedObject;
        } else {
          object = new fabric.Textbox(item.text || "Text", {
            left: item.x,
            top: item.y,
            angle: item.rotation ?? 0,
            width: item.width,
            minWidth: 80,
            fontFamily: canvasFontFamily,
            fontSize: item.type === "text" ? 20 : 16,
            fontWeight: item.type === "text" ? 600 : 400,
            lineHeight: 1.3,
            padding: 14,
            fill: ink,
            strokeWidth: 0,
            backgroundColor: "transparent",
            objectCaching: false,
          }) as TaggedObject;
        }
        if (!object || disposed || !canvas) continue;
        object.talkosId = item.id;
        object.talkosType = item.type;
        const movable = tool === "select" && item.type !== "arrow";
        object.set({ selectable: movable, evented: movable, hasControls: movable, lockMovementX: false, lockMovementY: false, objectCaching: false });
        canvas.add(object);
        if (object instanceof fabric.IText) object.on("editing:exited", () => onCommit(mergeTransform(board.elements, object!), `Edited ${item.text || item.type}`));
      }

      canvas.on("object:modified", ({ target }) => {
        if (target) onCommit(mergeTransform(board.elements, target as TaggedObject), "Moved canvas item");
      });
      canvas.on("path:created", ({ path }) => {
        const fabricPath = path as FabricPath;
        const bounds = fabricPath.getBoundingRect();
        const pathData = fabricPath.path ?? [];
        const points = pathData.flatMap((command) => { const values = command.slice(1).filter((value): value is number => typeof value === "number"); return values.length >= 2 ? [[values.at(-2)! - bounds.left, values.at(-1)! - bounds.top] as [number, number]] : []; });
        const drawing: CanvasElement = { id: `draw-${crypto.randomUUID()}`, type: "freehand", x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height, points, stroke: blue };
        onCommit([...board.elements, drawing], "Added drawing");
      });
      const selected = (selection: FabricObject[] = []) => onSelectionChange(selection.flatMap((item) => (item as TaggedObject).talkosId ? [(item as TaggedObject).talkosId!] : []));
      canvas.on("selection:created", ({ selected: items }) => selected(items));
      canvas.on("selection:updated", ({ selected: items }) => selected(items));
      canvas.on("selection:cleared", () => selected());
      canvas.on("mouse:wheel", ({ e }) => {
        const wheel = e as WheelEvent; const zoom = Math.max(0.2, Math.min(3, canvas!.getZoom() * (0.999 ** wheel.deltaY)));
        canvas!.zoomToPoint(new fabric.Point(wheel.offsetX, wheel.offsetY), zoom); wheel.preventDefault(); wheel.stopPropagation();
      });
      let dragging = false; let lastX = 0; let lastY = 0;
      canvas.on("mouse:down", ({ e }) => { const mouse = e as MouseEvent; if (mouse.altKey || mouse.button === 1) { dragging = true; lastX = mouse.clientX; lastY = mouse.clientY; canvas!.selection = false; mouse.preventDefault(); } });
      canvas.on("mouse:move", ({ e }) => { if (!dragging) return; const mouse = e as MouseEvent; canvas!.relativePan(new fabric.Point(mouse.clientX - lastX, mouse.clientY - lastY)); lastX = mouse.clientX; lastY = mouse.clientY; });
      canvas.on("mouse:up", () => { dragging = false; canvas!.selection = tool === "select"; });
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => {
          if (!canvas || disposed) return;
          const next = getCanvasRenderMetrics(host.clientWidth, host.clientHeight, window.devicePixelRatio);
          canvas.setDimensions({ width: next.width, height: next.height });
          canvas.requestRenderAll();
        });
        resizeObserver.observe(host);
      }
      canvas.requestRenderAll();
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (canvas) void canvas.dispose();
    };
  }, [assets, board, onCommit, onSelectionChange, themeRevision, tool]);

  return <div className="canvas-editor-host" ref={hostRef} tabIndex={0} aria-label="Canvas drawing area" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) onRedo(); else onUndo();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); onDeleteSelection();
    }
  }}><canvas ref={canvasElementRef} /></div>;
}

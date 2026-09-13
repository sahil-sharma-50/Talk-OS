"use client";

import type { Canvas as FabricCanvas, FabricObject, Path as FabricPath } from "fabric";
import { useEffect, useRef } from "react";
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

function mergeTransform(elements: CanvasElement[], target: TaggedObject): CanvasElement[] {
  if (!target.talkosId) return elements;
  const before = elements.find((element) => element.id === target.talkosId);
  const deltaX = before ? target.left - before.x : 0; const deltaY = before ? target.top - before.y : 0;
  return elements.map((element) => element.id === target.talkosId ? {
    ...element,
    x: target.left,
    y: target.top,
    width: Math.max(1, target.width * target.scaleX),
    height: Math.max(1, target.height * target.scaleY),
    rotation: target.angle,
    text: "text" in target && typeof target.text === "string" ? target.text : element.text,
  } : before?.groupId && element.groupId === before.groupId ? { ...element, x: element.x + deltaX, y: element.y + deltaY } : element);
}

export function CanvasEditor({ board, assets, tool, onCommit, onSelectionChange, onUndo, onRedo, onDeleteSelection }: CanvasEditorProps) {
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = canvasElementRef.current;
    const host = hostRef.current;
    if (!element || !host) return;
    let disposed = false;
    let canvas: FabricCanvas | null = null;

    void import("fabric").then(async (fabric) => {
      if (disposed) return;
      canvas = new fabric.Canvas(element, {
        width: Math.max(760, host.clientWidth || 960),
        height: Math.max(520, host.clientHeight || 620),
        backgroundColor: "transparent",
        preserveObjectStacking: true,
        selection: tool === "select",
      });
      canvas.isDrawingMode = tool === "draw";
      if (canvas.isDrawingMode) {
        const brush = new fabric.PencilBrush(canvas);
        brush.color = "#2563eb";
        brush.width = 3;
        canvas.freeDrawingBrush = brush;
      }

      const byId = new Map(board.elements.map((item) => [item.id, item]));
      for (const item of board.elements) {
        let object: TaggedObject | null = null;
        const common = { left: item.x, top: item.y, angle: item.rotation ?? 0, fill: item.fill ?? "#ffffff", stroke: item.stroke ?? "#303846", strokeWidth: 1.5 };
        if (item.type === "arrow" || item.type === "line") {
          const source = item.sourceId ? byId.get(item.sourceId) : undefined;
          const target = item.targetId ? byId.get(item.targetId) : undefined;
          const from = source ? center(source) : { x: item.x, y: item.y };
          const to = target ? center(target) : { x: item.x + item.width, y: item.y + item.height };
          const line = new fabric.Line([from.x, from.y, to.x, to.y], { stroke: item.stroke ?? "#596273", strokeWidth: 2 });
          if (item.type === "arrow") {
            const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90;
            const arrowhead = new fabric.Triangle({ left: to.x, top: to.y, width: 11, height: 13, fill: item.stroke ?? "#596273", angle, originX: "center", originY: "center" });
            const parts: FabricObject[] = [line, arrowhead];
            if (item.text) parts.push(new fabric.Text(item.text, { left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 - 13, originX: "center", originY: "center", fontFamily: "Arial", fontSize: 13, fill: "#303846", backgroundColor: "#f7f8fa" }));
            object = new fabric.Group(parts, { selectable: false, evented: false }) as TaggedObject;
          } else object = line as TaggedObject;
        } else if (item.type === "freehand" && item.points?.length) {
          const path = item.points.map(([x, y], index) => `${index ? "L" : "M"} ${x + item.x} ${y + item.y}`).join(" ");
          object = new fabric.Path(path, { fill: "", stroke: item.stroke ?? "#2563eb", strokeWidth: 3 }) as TaggedObject;
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
          ], { fill: item.fill ?? "#ffffff", stroke: item.stroke ?? "#303846", strokeWidth: 1.5 });
          const label = new fabric.Textbox(item.text || "Decision?", { left: item.width / 2, top: item.height / 2, width: item.width * .6, originX: "center", originY: "center", textAlign: "center", fontFamily: "Arial", fontSize: 15, fill: "#202532" });
          object = new fabric.Group([shape, label], { left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: true, subTargetCheck: true }) as TaggedObject;
        } else if (item.type === "rectangle") {
          object = new fabric.Rect({ ...common, width: item.width, height: item.height, rx: 8, ry: 8 }) as TaggedObject;
        } else if (item.type === "process" || item.type === "sticky") {
          const shape = new fabric.Rect({ left: 0, top: 0, width: item.width, height: item.height, rx: 8, ry: 8, fill: item.type === "sticky" ? "#fff1a8" : item.fill ?? "#ffffff", stroke: item.stroke ?? "#303846", strokeWidth: 1.5 });
          const label = new fabric.Textbox(item.text || (item.type === "sticky" ? "Sticky note" : "Process"), { left: 14, top: 14, width: item.width - 28, textAlign: item.type === "process" ? "center" : "left", fontFamily: "Arial", fontSize: 16, lineHeight: 1.3, fill: "#202532" });
          object = new fabric.Group([shape, label], { left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: true, subTargetCheck: true }) as TaggedObject;
        } else {
          object = new fabric.Textbox(item.text || "Text", {
            ...common,
            width: item.width,
            minWidth: 80,
            fontFamily: "Arial",
            fontSize: item.type === "text" ? 20 : 16,
            lineHeight: 1.3,
            padding: 14,
            fill: "#202532",
            backgroundColor: "transparent",
          }) as TaggedObject;
        }
        if (!object || disposed || !canvas) continue;
        object.talkosId = item.id;
        object.talkosType = item.type;
        object.set({ selectable: tool === "select" && item.type !== "arrow" });
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
        const drawing: CanvasElement = { id: `draw-${crypto.randomUUID()}`, type: "freehand", x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height, points, stroke: "#2563eb" };
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
      canvas.requestRenderAll();
    });

    return () => {
      disposed = true;
      if (canvas) void canvas.dispose();
    };
  }, [assets, board, onCommit, onSelectionChange, tool]);

  return <div className="canvas-editor-host" ref={hostRef} tabIndex={0} aria-label="Canvas drawing area" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) onRedo(); else onUndo();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); onDeleteSelection();
    }
  }}><canvas ref={canvasElementRef} /></div>;
}

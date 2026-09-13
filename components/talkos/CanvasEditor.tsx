"use client";

import type { Canvas as FabricCanvas, FabricObject, Path as FabricPath } from "fabric";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { canvasLabelSize, connectorEndpoints, shapeFromDrag } from "@/features/canvas/canvas-geometry";
import { getCanvasRenderMetrics } from "@/features/canvas/canvas-rendering";
import { mergeCanvasTransform } from "@/features/canvas/canvas-transform";
import type { CanvasAsset, CanvasElement, WorkspaceCanvas } from "@/features/canvas/canvas.types";

export type CanvasTool = "select" | "pan" | "draw" | "sticky" | "text" | "process" | "decision" | "rectangle" | "ellipse" | "line" | "arrow";

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
  onToolChange?: (tool: CanvasTool) => void;
  onViewportChange?: (viewport: { x: number; y: number; width: number; height: number }) => void;
  fitRequest?: number;
}

const center = (element: CanvasElement) => { const angle = (element.rotation ?? 0) * Math.PI / 180; return { x: element.x + element.width / 2 * Math.cos(angle) - element.height / 2 * Math.sin(angle), y: element.y + element.width / 2 * Math.sin(angle) + element.height / 2 * Math.cos(angle) }; };
const canvasFontFamily = '"Segoe UI Variable Text", "Segoe UI", sans-serif';

const mergeTransform = (elements: CanvasElement[], target: TaggedObject) => {
  const model = elements.find((item) => item.id === target.talkosId);
  const freeArrow = model?.type === "arrow" && !model.sourceId && !model.targetId;
  const groupedShape = ["process", "decision", "sticky", "freehand", "rectangle", "ellipse"].includes(target.talkosType ?? "");
  return mergeCanvasTransform(elements, {
  id: target.talkosId,
  left: target.left,
  top: target.top,
  width: freeArrow ? Math.hypot(model.width, model.height) : groupedShape && model ? model.width : target.width,
  height: freeArrow ? 0 : groupedShape && model ? model.height : target.height,
  scaleX: target.scaleX,
  scaleY: target.scaleY,
  angle: target.angle,
  text: "text" in target && typeof target.text === "string" ? target.text : undefined,
}); };

export function CanvasEditor({ board, assets, tool, onCommit, onSelectionChange, onUndo, onRedo, onDeleteSelection, onToolChange, onViewportChange, fitRequest = 0 }: CanvasEditorProps) {
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const [textEdit, setTextEdit] = useState<{ id: string; value: string; x: number; y: number } | null>(null);
  const fitRef = useRef(fitRequest);
  const [loadError, setLoadError] = useState(false);
  const viewportRef = useRef(new Map<string, [number, number, number, number, number, number]>());
  const selectedRef = useRef(new Map<string, string[]>());
  const commit = useEffectEvent(onCommit);
  const changeSelection = useEffectEvent(onSelectionChange);
  const changeTool = useEffectEvent((next: CanvasTool) => onToolChange?.(next));
  const viewportChanged = useEffectEvent((next: { x: number; y: number; width: number; height: number }) => onViewportChange?.(next));
  const saveText = () => {
    if (!textEdit) return;
    const value = textEdit.value.trim();
    if (value) onCommit(board.elements.map((item) => item.id === textEdit.id ? { ...item, text: value, height: Math.max(item.height, canvasLabelSize(item.type, value).height) } : item), "Edited canvas text");
    setTextEdit(null);
  };

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((revision) => revision + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvasElementRef.current;
    const host = hostRef.current;
    if (!element || !host) return;
    const savedViewports = viewportRef.current;
    let disposed = false;
    let canvas: FabricCanvas | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const inputEvents = new AbortController();

    void import("fabric").then(async (fabric) => {
      if (disposed) return;
      const styles = getComputedStyle(host);
      const color = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
      const ink = color("--ink", "#202532");
      const surface = color("--surface", "#ffffff");
      const line = color("--line-strong", "#303846");
      const muted = color("--muted", "#596273");
      const blue = color("--blue", "#2563eb");
      const origin = { originX: "left" as const, originY: "top" as const };
      const renderMetrics = getCanvasRenderMetrics(host.clientWidth, host.clientHeight, window.devicePixelRatio);
      fabric.config.configure({ devicePixelRatio: renderMetrics.pixelRatio });
      canvas = new fabric.Canvas(element, {
        width: renderMetrics.width,
        height: renderMetrics.height,
        backgroundColor: "transparent",
        enableRetinaScaling: true,
        preserveObjectStacking: true,
        selection: tool === "select",
        skipTargetFind: tool !== "select",
        fireRightClick: true,
        fireMiddleClick: true,
        stopContextMenu: true,
        selectionColor: "rgba(37, 99, 235, 0.12)",
        selectionBorderColor: blue,
        defaultCursor: tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair",
        hoverCursor: tool === "select" ? "move" : tool === "pan" ? "grab" : "crosshair",
      });
      canvas.isDrawingMode = tool === "draw";
      const viewport = savedViewports.get(board.id);
      if (viewport) canvas.setViewportTransform(viewport);
      if (canvas.isDrawingMode) {
        const brush = new fabric.PencilBrush(canvas);
        brush.color = blue;
        brush.width = 3;
        canvas.freeDrawingBrush = brush;
      }

      const reportViewport = () => {
        if (!canvas) return;
        const zoom = canvas.getZoom(); const transform = canvas.viewportTransform;
        viewportChanged({ x: (canvas.width / 2 - transform[4]) / zoom, y: (canvas.height / 2 - transform[5]) / zoom, width: canvas.width / zoom, height: canvas.height / zoom });
      };
      const nodes = board.elements.filter((item) => item.type !== "arrow" || !item.sourceId);
      if (nodes.length && (!viewport || fitRef.current !== fitRequest)) {
        const corners = nodes.flatMap((item) => { const angle = (item.rotation ?? 0) * Math.PI / 180; return [[0, 0], [item.width, 0], [0, item.height], [item.width, item.height]].map(([x, y]) => ({ x: item.x + x * Math.cos(angle) - y * Math.sin(angle), y: item.y + x * Math.sin(angle) + y * Math.cos(angle) })); });
        const minX = Math.min(...corners.map((point) => point.x)); const minY = Math.min(...corners.map((point) => point.y));
        const maxX = Math.max(...corners.map((point) => point.x)); const maxY = Math.max(...corners.map((point) => point.y));
        const zoom = Math.max(.1, Math.min(1, (canvas.width - 64) / Math.max(1, maxX - minX), (canvas.height - 64) / Math.max(1, maxY - minY)));
        canvas.setViewportTransform([zoom, 0, 0, zoom, (canvas.width - (maxX + minX) * zoom) / 2, (canvas.height - (maxY + minY) * zoom) / 2]);
      }
      fitRef.current = fitRequest;
      reportViewport();
      const byId = new Map(board.elements.map((item) => [item.id, item]));
      for (const item of board.elements) {
        let object: TaggedObject | null = null;
        const common = { ...origin, left: item.x, top: item.y, angle: item.rotation ?? 0, fill: item.fill ?? surface, stroke: item.stroke ?? line, strokeWidth: 1.5 };
        if (item.type === "arrow" && !item.sourceId && !item.targetId) {
          const length = Math.hypot(item.width, item.height); const tip = Math.min(12, length / 3);
          object = new fabric.Path(`M 0 0 L ${length} 0 M ${length - tip} ${-tip / 2} L ${length} 0 L ${length - tip} ${tip / 2}`, { ...origin, originY: "center", left: item.x, top: item.y, angle: (item.rotation ?? 0) + Math.atan2(item.height, item.width) * 180 / Math.PI, fill: "", stroke: item.stroke ?? muted, strokeWidth: 2, strokeLineCap: "round", strokeLineJoin: "round" }) as TaggedObject;
        } else if (item.type === "arrow" || item.type === "line") {
          const source = item.sourceId ? byId.get(item.sourceId) : undefined;
          const target = item.targetId ? byId.get(item.targetId) : undefined;
          const edge = source && target ? connectorEndpoints(source, target) : null;
          const from = edge?.from ?? (source ? center(source) : { x: item.x, y: item.y });
          const to = edge?.to ?? (target ? center(target) : { x: item.x + item.width, y: item.y + item.height });
          const connector = new fabric.Line([from.x, from.y, to.x, to.y], { ...origin, angle: item.type === "line" ? item.rotation ?? 0 : 0, stroke: item.stroke ?? muted, strokeWidth: 2 });
          if (item.type === "arrow") {
            const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90;
            const arrowhead = new fabric.Triangle({ left: to.x, top: to.y, width: 11, height: 13, fill: item.stroke ?? muted, angle, originX: "center", originY: "center" });
            const parts: FabricObject[] = [connector, arrowhead];
            if (item.text) parts.push(new fabric.Text(item.text, { left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 - 13, originX: "center", originY: "center", fontFamily: canvasFontFamily, fontSize: 13, fill: ink, backgroundColor: surface, objectCaching: false }));
            object = new fabric.Group(parts, { selectable: false, evented: false, objectCaching: false }) as TaggedObject;
          } else object = connector as TaggedObject;
        } else if (item.type === "freehand" && item.points?.length) {
          const path = item.points.map(([x, y], index) => `${index ? "L" : "M"} ${x + item.x} ${y + item.y}`).join(" ");
          object = new fabric.Path(path, { ...origin, left: item.x, top: item.y, angle: item.rotation ?? 0, fill: "", stroke: item.stroke ?? blue, strokeWidth: 3 }) as TaggedObject;
        } else if (item.type === "image" && item.assetId && assets[item.assetId]) {
          try {
            const image = await fabric.FabricImage.fromURL(assets[item.assetId].dataUrl);
            image.set({ ...origin, left: item.x, top: item.y, angle: item.rotation ?? 0, scaleX: item.width / image.width, scaleY: item.height / image.height });
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
          ], { ...origin, fill: item.fill ?? surface, stroke: item.stroke ?? line, strokeWidth: 1.5, selectable: false, evented: false });
          const label = new fabric.Textbox(item.text || "Decision?", { left: item.width / 2, top: item.height / 2, width: item.width * .6, originX: "center", originY: "center", textAlign: "center", fontFamily: canvasFontFamily, fontSize: 15, fill: item.fill ? "#202532" : ink, selectable: false, evented: false, objectCaching: false });
          object = new fabric.Group([shape, label], { ...origin, left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: false, subTargetCheck: false, objectCaching: false }) as TaggedObject;
        } else if (item.type === "rectangle") {
          object = new fabric.Rect({ ...common, width: item.width, height: item.height, rx: 8, ry: 8 }) as TaggedObject;
        } else if (item.type === "process" || item.type === "sticky") {
          const shape = new fabric.Rect({ ...origin, left: 0, top: 0, width: item.width, height: item.height, rx: 8, ry: 8, fill: item.fill ?? (item.type === "sticky" ? "#fff1a8" : surface), stroke: item.stroke ?? line, strokeWidth: 1.5, selectable: false, evented: false });
          const label = new fabric.Textbox(item.text || (item.type === "sticky" ? "Sticky note" : "Process"), { ...origin, left: 14, top: 14, width: item.width - 28, textAlign: item.type === "process" ? "center" : "left", fontFamily: canvasFontFamily, fontSize: 16, lineHeight: 1.3, fill: item.fill || item.type === "sticky" ? "#202532" : ink, selectable: false, evented: false, objectCaching: false });
          if (item.type === "process") label.set({ top: item.height / 2, originY: "center" });
          object = new fabric.Group([shape, label], { ...origin, left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: false, subTargetCheck: false, objectCaching: false }) as TaggedObject;
        } else {
          object = new fabric.Textbox(item.text || "Text", {
            ...origin,
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
        if (object && (item.type === "rectangle" || item.type === "ellipse") && item.text) {
          object.set({ left: 0, top: 0, angle: 0, selectable: false, evented: false });
          const label = new fabric.Textbox(item.text, { left: item.width / 2, top: item.height / 2, width: item.width - 28, originX: "center", originY: "center", textAlign: "center", fontFamily: canvasFontFamily, fontSize: 16, fill: item.fill ? "#202532" : ink, selectable: false, evented: false });
          object = new fabric.Group([object, label], { ...origin, left: item.x, top: item.y, angle: item.rotation ?? 0, interactive: false, subTargetCheck: false, objectCaching: false }) as TaggedObject;
        }
        if (!object || disposed || !canvas) continue;
        object.talkosId = item.id;
        object.talkosType = item.type;
        const movable = tool === "select" && (item.type !== "arrow" || !item.sourceId);
        object.set({ selectable: movable, evented: movable, hasControls: movable, lockMovementX: false, lockMovementY: false, objectCaching: false });
        canvas.add(object);
        if (object instanceof fabric.IText) object.set({ editable: false });
      }

      canvas.on("object:modified", ({ target }) => {
        if (target instanceof fabric.ActiveSelection) {
          const changes = new Map(target.getObjects().map((object) => [(object as TaggedObject).talkosId, { point: object.getXY(), scale: object.getObjectScaling(), angle: object.getTotalAngle(), width: object.width, height: object.height }]));
          commit(board.elements.map((item) => { const change = changes.get(item.id); if (!change) return item; const grouped = ["process", "decision", "sticky", "freehand", "rectangle", "ellipse", "arrow"].includes(item.type); return { ...item, x: change.point.x, y: change.point.y, width: (grouped ? item.width : change.width) * change.scale.x, height: (grouped ? item.height : change.height) * change.scale.y, rotation: change.angle, ...(item.type === "freehand" ? { points: item.points?.map(([x, y]) => [x * change.scale.x, y * change.scale.y] as [number, number]) } : {}) }; }), "Moved selected canvas items");
        } else if (target) commit(mergeTransform(board.elements, target as TaggedObject), "Moved canvas item");
      });
      canvas.on("path:created", ({ path }) => {
        const fabricPath = path as FabricPath;
        const bounds = fabricPath.getBoundingRect();
        const pathData = fabricPath.path ?? [];
        const points = pathData.flatMap((command) => { const values = command.slice(1).filter((value): value is number => typeof value === "number"); return values.length >= 2 ? [[values.at(-2)! - bounds.left, values.at(-1)! - bounds.top] as [number, number]] : []; });
        const drawing: CanvasElement = { id: `draw-${crypto.randomUUID()}`, type: "freehand", x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height, points, stroke: blue };
        commit([...board.elements, drawing], "Added drawing");
      });
      const selected = (selection: FabricObject[] = []) => changeSelection(selection.flatMap((item) => (item as TaggedObject).talkosId ? [(item as TaggedObject).talkosId!] : []));
      const syncSelection = () => { if (disposed || !canvas) return; const items = canvas.getActiveObjects(); selectedRef.current.set(board.id, items.flatMap((item) => (item as TaggedObject).talkosId ? [(item as TaggedObject).talkosId!] : [])); selected(items); };
      const savedSelection = selectedRef.current.get(board.id) ?? [];
      const restored = canvas.getObjects().filter((item) => savedSelection.includes((item as TaggedObject).talkosId ?? ""));
      if (tool === "select" && restored.length) canvas.setActiveObject(restored.length === 1 ? restored[0] : new fabric.ActiveSelection(restored, { canvas }));
      canvas.on("selection:created", syncSelection);
      canvas.on("selection:updated", syncSelection);
      canvas.on("selection:cleared", syncSelection);
      syncSelection();
      canvas.on("mouse:wheel", ({ e }) => {
        const wheel = e as WheelEvent; const zoom = Math.max(0.2, Math.min(3, canvas!.getZoom() * (0.999 ** wheel.deltaY)));
        canvas!.zoomToPoint(new fabric.Point(wheel.offsetX, wheel.offsetY), zoom); reportViewport(); wheel.preventDefault(); wheel.stopPropagation();
      });
      let dragging = false; let lastX = 0; let lastY = 0;
      let shapeStart: { x: number; y: number } | null = null; let ghost: FabricObject | null = null; let ghostHead: FabricObject | null = null;
      let rightSelection: { start: InstanceType<typeof fabric.Point>; initial: FabricObject[]; clicked: FabricObject[]; box: InstanceType<typeof fabric.Rect> } | null = null;
      const placing = !["select", "pan", "draw"].includes(tool);
      // Capture before Fabric caches its hit target, so Alt-drag never moves an item.
      host.addEventListener("mousedown", (mouse) => {
        if (tool === "pan" || mouse.altKey || mouse.button === 1) {
          canvas!.selection = false; canvas!.skipTargetFind = true; canvas!.isDrawingMode = false;
        }
      }, { capture: true, signal: inputEvents.signal });
      canvas.on("mouse:down", ({ e, target }) => {
        host.focus(); const mouse = e as MouseEvent;
        if (tool === "pan" || mouse.altKey || mouse.button === 1) {
          dragging = true; lastX = mouse.clientX; lastY = mouse.clientY; canvas!.selection = false; canvas!.setCursor("grabbing"); mouse.preventDefault();
        } else if (tool === "select" && mouse.button === 2) {
          const start = canvas!.getScenePoint(e);
          const initial = mouse.shiftKey ? canvas!.getActiveObjects() : [];
          const clicked = target instanceof fabric.ActiveSelection ? target.getObjects() : target?.selectable ? [target] : [];
          canvas!.discardActiveObject();
          const box = new fabric.Rect({ ...origin, left: start.x, top: start.y, width: 0, height: 0, fill: "rgba(37, 99, 235, 0.12)", stroke: blue, strokeWidth: 1 / canvas!.getZoom(), strokeDashArray: [5, 4], selectable: false, evented: false });
          rightSelection = { start, initial, clicked, box }; canvas!.add(box); canvas!.setCursor("crosshair"); mouse.preventDefault();
        } else if (placing && mouse.button === 0) {
          const point = canvas!.getScenePoint(e); shapeStart = { x: point.x, y: point.y };
          ghost = tool === "line" || tool === "arrow" ? new fabric.Line([point.x, point.y, point.x, point.y], { stroke: blue, strokeWidth: 2, evented: false, selectable: false }) : tool === "ellipse" ? new fabric.Ellipse({ ...origin, left: point.x, top: point.y, rx: 1, ry: 1, fill: "transparent", stroke: blue, strokeDashArray: [5, 5], evented: false, selectable: false }) : new fabric.Rect({ ...origin, left: point.x, top: point.y, width: 1, height: 1, fill: "transparent", stroke: blue, strokeDashArray: [5, 5], evented: false, selectable: false });
          canvas!.add(ghost);
          if (tool === "arrow") { ghostHead = new fabric.Triangle({ left: point.x, top: point.y, originX: "center", originY: "center", width: 10, height: 12, fill: blue, evented: false, selectable: false }); canvas!.add(ghostHead); }
        }
      });
      canvas.on("mouse:move", ({ e }) => {
        const mouse = e as MouseEvent;
        if (dragging) { canvas!.relativePan(new fabric.Point(mouse.clientX - lastX, mouse.clientY - lastY)); canvas!.setCursor("grabbing"); lastX = mouse.clientX; lastY = mouse.clientY; reportViewport(); }
        else if (rightSelection) { const point = canvas!.getScenePoint(e); const start = rightSelection.start; rightSelection.box.set({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }); canvas!.setCursor("crosshair"); canvas!.requestRenderAll(); }
        else if (shapeStart && ghost) { const point = canvas!.getScenePoint(e); const bounds = shapeFromDrag("rectangle", shapeStart, point); if (ghost instanceof fabric.Line) ghost.set({ x1: shapeStart.x, y1: shapeStart.y, x2: point.x, y2: point.y }); else ghost.set({ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }); if (ghost instanceof fabric.Ellipse) ghost.set({ rx: bounds.width / 2, ry: bounds.height / 2 }); if (ghostHead) ghostHead.set({ left: point.x, top: point.y, angle: Math.atan2(point.y - shapeStart.y, point.x - shapeStart.x) * 180 / Math.PI + 90 }); canvas!.requestRenderAll(); }
      });
      canvas.on("mouse:up", ({ e }) => {
        dragging = false; canvas!.selection = tool === "select"; canvas!.skipTargetFind = tool !== "select"; canvas!.isDrawingMode = tool === "draw";
        canvas!.setCursor(tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair");
        if (rightSelection) {
          const { start, initial, clicked, box } = rightSelection; const point = canvas!.getScenePoint(e);
          canvas!.remove(box); rightSelection = null;
          const hits = start.distanceFrom(point) * canvas!.getZoom() < 4 ? clicked : canvas!.collectObjects({ left: Math.min(start.x, point.x), top: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }, { includeIntersecting: true });
          const objects = [...new Set([...initial, ...hits])].filter((item): item is FabricObject => item instanceof fabric.FabricObject && item.selectable && Boolean((item as TaggedObject).talkosId));
          if (objects.length) canvas!.setActiveObject(objects.length === 1 ? objects[0] : new fabric.ActiveSelection(objects, { canvas: canvas! }));
          syncSelection(); canvas!.requestRenderAll(); return;
        }
        if (!shapeStart) return;
        const point = canvas!.getScenePoint(e); const type = tool as CanvasElement["type"]; const clicked = Math.hypot(point.x - shapeStart.x, point.y - shapeStart.y) < 8;
        const label = type === "sticky" ? "Sticky note" : type === "process" ? "Process" : type === "decision" ? "Decision?" : type === "text" ? "Text" : undefined;
        const size = canvasLabelSize(type, label ?? "");
        const bounds = clicked ? { type, ...shapeStart, width: size.width, height: type === "line" || type === "arrow" ? 0 : size.height } : shapeFromDrag(type, shapeStart, point);
        const item: CanvasElement = { ...bounds, id: `${type}-${crypto.randomUUID()}`, ...(label ? { text: label } : {}) };
        if (ghost) canvas!.remove(ghost); if (ghostHead) canvas!.remove(ghostHead); ghost = null; ghostHead = null; shapeStart = null;
        selectedRef.current.set(board.id, [item.id]); commit([...board.elements, item], `Added ${type}`); changeTool("select");
      });
      canvas.on("mouse:dblclick", ({ e, target }) => {
        if (!["select", "pan", "text"].includes(tool)) return;
        const point = canvas!.getScenePoint(e); const screenPoint = canvas!.getViewportPoint(e);
        const existing = board.elements.find((item) => item.id === (target as TaggedObject | undefined)?.talkosId);
        if (existing && ["image", "freehand", "arrow", "line"].includes(existing.type)) return;
        const id = existing?.id ?? `text-${crypto.randomUUID()}`;
        if (!existing) commit([...board.elements, { id, type: "text", x: point.x, y: point.y, width: 300, height: 64, text: "Text" }], "Added text");
        setTextEdit({ id, value: existing?.text ?? "", x: Math.max(8, Math.min(host.clientWidth - 250, screenPoint.x)), y: Math.max(8, Math.min(host.clientHeight - 120, screenPoint.y)) });
        changeTool("select");
      });
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => {
          if (!canvas || disposed) return;
          const next = getCanvasRenderMetrics(host.clientWidth, host.clientHeight, window.devicePixelRatio);
          canvas.setDimensions({ width: next.width, height: next.height });
          reportViewport();
          canvas.requestRenderAll();
        });
        resizeObserver.observe(host);
      }
      canvas.requestRenderAll();
    }).catch(() => { if (!disposed) setLoadError(true); });

    return () => {
      disposed = true;
      inputEvents.abort();
      resizeObserver?.disconnect();
      if (canvas) { savedViewports.set(board.id, [...canvas.viewportTransform]); void canvas.dispose(); }
    };
  }, [assets, board, themeRevision, tool, fitRequest]);

  return <div className="canvas-editor-host" role="region" ref={hostRef} tabIndex={0} aria-label="Canvas drawing area" onKeyDown={(event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) onRedo(); else onUndo();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); onDeleteSelection();
    }
  }}>{loadError ? <p role="alert">Canvas could not load. Reload the page to try again; your saved work is still available.</p> : null}<canvas ref={canvasElementRef} />{textEdit ? <div className="canvas-text-edit" style={{ left: textEdit.x, top: textEdit.y }}><textarea autoFocus aria-label="Canvas text" value={textEdit.value} onChange={(event) => setTextEdit({ ...textEdit, value: event.target.value })} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setTextEdit(null); if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) saveText(); }} /><div><button type="button" onClick={() => setTextEdit(null)}>Cancel</button><button type="button" onClick={saveText}>Save text</button></div></div> : null}</div>;
}

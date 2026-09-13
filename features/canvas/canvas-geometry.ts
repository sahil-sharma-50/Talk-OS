import type { CanvasElement, CanvasPoint } from "./canvas.types";

export function canvasLabelSize(type: CanvasElement["type"], text: string) {
  const width = type === "decision" ? 260 : type === "text" ? 320 : 240;
  const chars = type === "decision" ? 18 : type === "text" ? 30 : 26;
  const lines = text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / chars)), 0);
  return { width, height: Math.max(type === "decision" ? 160 : type === "sticky" ? 160 : type === "text" ? 40 : 88, lines * 23 * (type === "decision" ? 1.7 : 1) + 34) };
}

export function elementCenter(element: CanvasElement): CanvasPoint {
  const a = (element.rotation ?? 0) * Math.PI / 180;
  return { x: element.x + element.width / 2 * Math.cos(a) - element.height / 2 * Math.sin(a), y: element.y + element.width / 2 * Math.sin(a) + element.height / 2 * Math.cos(a) };
}

function edgePoint(element: CanvasElement, toward: CanvasPoint): CanvasPoint {
  const center = elementCenter(element); const angle = (element.rotation ?? 0) * Math.PI / 180;
  const dx = toward.x - center.x; const dy = toward.y - center.y;
  const x = dx * Math.cos(angle) + dy * Math.sin(angle); const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const halfW = Math.max(1, element.width / 2); const halfH = Math.max(1, element.height / 2);
  const ratio = element.type === "ellipse" ? Math.sqrt(x * x / halfW ** 2 + y * y / halfH ** 2) : element.type === "decision" ? Math.abs(x) / halfW + Math.abs(y) / halfH : Math.max(Math.abs(x) / halfW, Math.abs(y) / halfH);
  const t = ratio ? 1 / ratio : 0;
  return { x: center.x + dx * t, y: center.y + dy * t };
}

export function connectorEndpoints(source: CanvasElement, target: CanvasElement) {
  return { from: edgePoint(source, elementCenter(target)), to: edgePoint(target, elementCenter(source)) };
}

export function shapeFromDrag(type: CanvasElement["type"], start: CanvasPoint, end: CanvasPoint): Omit<CanvasElement, "id"> {
  const dx = end.x - start.x; const dy = end.y - start.y;
  if (type === "line" || type === "arrow") return { type, x: start.x, y: start.y, width: Math.max(1, Math.hypot(dx, dy)), height: 0, rotation: Math.atan2(dy, dx) * 180 / Math.PI };
  return { type, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(24, Math.abs(dx)), height: Math.max(24, Math.abs(dy)) };
}

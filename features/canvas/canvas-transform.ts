import type { CanvasElement } from "./canvas.types";

export interface CanvasTransform {
  id?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  text?: string;
}

export function mergeCanvasTransform(elements: CanvasElement[], target: CanvasTransform): CanvasElement[] {
  if (!target.id) return elements;
  const before = elements.find((element) => element.id === target.id);
  const deltaX = before ? target.left - before.x : 0;
  const deltaY = before ? target.top - before.y : 0;
  return elements.map((element) => element.id === target.id ? {
    ...element,
    x: target.left,
    y: target.top,
    width: Math.max(1, target.width * target.scaleX),
    height: Math.max(["line", "arrow"].includes(element.type) ? 0 : 1, target.height * target.scaleY),
    ...(element.type === "freehand" ? { points: element.points?.map(([x, y]) => [x * target.scaleX, y * target.scaleY] as [number, number]) } : {}),
    rotation: target.angle,
    text: typeof target.text === "string" ? target.text : element.text,
  } : before?.groupId && element.groupId === before.groupId ? {
    ...element,
    x: element.x + deltaX,
    y: element.y + deltaY,
  } : element);
}

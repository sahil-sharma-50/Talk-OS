"use client";

import type { CanvasElement } from "@/features/canvas/canvas.types";

export function CanvasOutline({ elements, selectedIds, onSelect, onTextChange }: { elements: CanvasElement[]; selectedIds: string[]; onSelect: (id: string) => void; onTextChange: (id: string, value: string) => void }) {
  const semantic = elements.filter((item) => item.type !== "freehand" && item.type !== "arrow" && item.type !== "line");
  return <details className="canvas-outline">
    <summary>Outline <span>{semantic.length}</span></summary>
    <div>{semantic.length ? semantic.map((item) => <div className="canvas-outline__item" key={item.id} data-active={selectedIds.includes(item.id)}><button type="button" onClick={() => onSelect(item.id)}>{item.type}</button><input aria-label={`Label for ${item.text || item.type}`} defaultValue={item.text ?? ""} onBlur={(event) => { if (event.target.value !== (item.text ?? "")) onTextChange(item.id, event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>) : <p>No labeled items yet.</p>}</div>
  </details>;
}

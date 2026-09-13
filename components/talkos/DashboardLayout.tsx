"use client";

import { Grip, MoveDiagonal2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { DashboardLayout as Layout, DashboardWidget } from "@/features/dashboard/dashboard.types";

import { defaultDashboardLayouts } from "@/features/dashboard/dashboard-layout";

export function DashboardLayout({ widgets, onLayoutChange, children }: { widgets: DashboardWidget[]; onLayoutChange: (id: string, layout: Layout) => void; children: (widget: DashboardWidget) => ReactNode }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: string; startX: number; startY: number; layout: Layout; mode: "move" | "resize"; boardWidth: number; next: Layout } | null>(null);
  const [preview, setPreview] = useState<{ id: string; layout: Layout } | null>(null);
  const layouts = defaultDashboardLayouts(widgets);
  const height = Math.max(320, ...Object.values(layouts).map((layout) => layout.y + layout.height + 20));
  const clamp = (layout: Layout): Layout => ({ x: Math.max(0, Math.min(100 - layout.width, layout.x)), y: Math.max(0, Math.min(8000, layout.y)), width: Math.max(25, Math.min(100, layout.width)), height: Math.max(180, Math.min(1600, layout.height)) });
  return <div className="dashboard-layout" ref={boardRef} style={{ minHeight: height }} aria-label="Dashboard layout">
    {widgets.map((widget) => {
      const layout = preview?.id === widget.id ? preview.layout : layouts[widget.id];
      const control = (mode: "move" | "resize") => <button className={`dashboard-layout__${mode}`} type="button" aria-label={`${mode === "move" ? "Move" : "Resize"} ${widget.title}`} title={mode === "move" ? "Drag to move. Arrow keys also move this widget." : "Drag to resize. Arrow keys also resize this widget."} onPointerDown={(event) => {
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { id: widget.id, startX: event.clientX, startY: event.clientY, layout, next: layout, mode, boardWidth: boardRef.current?.clientWidth || 1 };
      }} onPointerMove={(event) => {
        const current = gesture.current; if (!current || current.id !== widget.id) return;
        const dx = (event.clientX - current.startX) / current.boardWidth * 100; const dy = event.clientY - current.startY;
        const next = clamp(current.mode === "move" ? { ...current.layout, x: current.layout.x + dx, y: current.layout.y + dy } : { ...current.layout, width: Math.min(100 - current.layout.x, current.layout.width + dx), height: current.layout.height + dy });
        current.next = next; setPreview({ id: widget.id, layout: next });
      }} onPointerUp={() => { const current = gesture.current; if (current) onLayoutChange(current.id, current.next); gesture.current = null; setPreview(null); }} onPointerCancel={() => { gesture.current = null; setPreview(null); }} onKeyDown={(event) => {
        if (!event.key.startsWith("Arrow")) return; event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0; const dy = event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0;
        onLayoutChange(widget.id, clamp(mode === "move" ? { ...layout, x: layout.x + dx, y: layout.y + dy } : { ...layout, width: Math.min(100 - layout.x, layout.width + dx), height: layout.height + dy }));
      }}>{mode === "move" ? <Grip size={14} /> : <MoveDiagonal2 size={14} />}</button>;
      return <div key={widget.id} className="dashboard-layout__item" data-moving={preview?.id === widget.id} style={{ left: `${layout.x}%`, top: layout.y, width: `calc(${layout.width}% - 12px)`, height: layout.height }}>{control("move")}{children(widget)}{control("resize")}</div>;
    })}
  </div>;
}

import type { DashboardLayout, DashboardWidget } from "./dashboard.types";

export function defaultDashboardLayouts(widgets: DashboardWidget[]): Record<string, DashboardLayout> {
  let x = 0; let y = Math.max(0, ...widgets.flatMap((widget) => widget.layout ? [widget.layout.y + widget.layout.height + 14] : [])); let rowHeight = 0;
  return Object.fromEntries([...widgets].sort((a, b) => a.order - b.order).map((widget) => {
    if (widget.layout) return [widget.id, widget.layout];
    const width = widget.size === "wide" ? 100 : 50; const height = widget.type === "bar_chart" ? 300 : 230;
    if (x + width > 100) { y += rowHeight + 14; x = 0; rowHeight = 0; }
    const layout = { x, y, width, height };
    x += width; rowHeight = Math.max(rowHeight, height);
    return [widget.id, layout];
  }));
}

export function placeDashboardWidget(widgets: DashboardWidget[], id: string, layout: DashboardLayout): DashboardWidget[] {
  const layouts = defaultDashboardLayouts(widgets);
  layouts[id] = layout;
  const placed = [layout];
  for (const widget of [...widgets].filter((item) => item.id !== id).sort((a, b) => layouts[a.id].y - layouts[b.id].y || a.order - b.order)) {
    let next = { ...layouts[widget.id] };
    for (let attempt = 0; attempt < widgets.length; attempt++) {
      const collisions = placed.filter((other) => next.x < other.x + other.width - .5 && next.x + next.width - .5 > other.x && next.y < other.y + other.height + 14 && next.y + next.height + 14 > other.y);
      if (!collisions.length) break;
      next = { ...next, y: Math.max(...collisions.map((other) => other.y + other.height + 14)) };
    }
    layouts[widget.id] = next; placed.push(next);
  }
  return widgets.map((widget) => ({ ...widget, layout: layouts[widget.id] }));
}

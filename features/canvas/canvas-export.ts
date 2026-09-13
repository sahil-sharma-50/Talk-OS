import { connectorEndpoints } from "./canvas-geometry";
import type { CanvasAsset, CanvasElement, WorkspaceCanvas } from "./canvas.types";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const center = (item: CanvasElement) => { const angle = (item.rotation ?? 0) * Math.PI / 180; return { x: item.x + item.width / 2 * Math.cos(angle) - item.height / 2 * Math.sin(angle), y: item.y + item.width / 2 * Math.sin(angle) + item.height / 2 * Math.cos(angle) }; };
const text = (item: CanvasElement, x = item.x + item.width / 2, y = item.y + item.height / 2) => {
  if (!item.text) return "";
  const maxChars = Math.max(8, Math.floor((item.type === "decision" ? item.width * .52 : item.width - 28) / 8));
  const lines: string[] = [];
  for (const paragraph of item.text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && line.length + word.length + 1 > maxChars) { lines.push(line); line = ""; }
      line += `${line ? " " : ""}${word}`;
    }
    lines.push(line);
  }
  const firstY = y - (lines.length - 1) * 11;
  return `<text text-anchor="middle" dominant-baseline="middle" fill="#202532" font-family="Arial,sans-serif" font-size="16">${lines.map((line, i) => `<tspan x="${x}" y="${firstY + i * 22}">${escape(line)}</tspan>`).join("")}</text>`;
};

export function exportCanvasSvg(canvas: WorkspaceCanvas, assets: Record<string, CanvasAsset>, options: { fitToContent?: boolean; background?: "transparent" } = {}): string {
  const byId = new Map(canvas.elements.map((item) => [item.id, item]));
  const corners = canvas.elements.flatMap((item) => {
    if (item.sourceId && item.targetId && byId.has(item.sourceId) && byId.has(item.targetId)) {
      const edge = connectorEndpoints(byId.get(item.sourceId)!, byId.get(item.targetId)!);
      return [edge.from, edge.to];
    }
    const angle = (item.rotation ?? 0) * Math.PI / 180;
    const points = item.type === "freehand" && item.points?.length ? item.points : [[0, 0], [item.width, 0], [0, item.height], [item.width, item.height]];
    return points.map(([x, y]) => ({ x: item.x + x * Math.cos(angle) - y * Math.sin(angle), y: item.y + x * Math.sin(angle) + y * Math.cos(angle) }));
  });
  const fitted = options.fitToContent && corners.length > 0;
  const minX = fitted ? Math.min(...corners.map((point) => point.x)) - 32 : Math.min(0, ...corners.map((point) => point.x - 40));
  const minY = fitted ? Math.min(...corners.map((point) => point.y)) - 32 : Math.min(0, ...corners.map((point) => point.y - 40));
  const maxX = fitted ? Math.max(...corners.map((point) => point.x)) + 32 : Math.max(1200, ...corners.map((point) => point.x + 80));
  const maxY = fitted ? Math.max(...corners.map((point) => point.y)) + 32 : Math.max(760, ...corners.map((point) => point.y + 80));
  const elements = canvas.elements.map((item) => {
    const stroke = escape(item.stroke ?? "#596273"); const fill = escape(item.fill ?? "#ffffff"); const transform = item.rotation ? ` transform="rotate(${item.rotation} ${item.x} ${item.y})"` : "";
    if (item.type === "arrow" || item.type === "line") {
      const edge = item.sourceId && item.targetId && byId.get(item.sourceId) && byId.get(item.targetId) ? connectorEndpoints(byId.get(item.sourceId)!, byId.get(item.targetId)!) : null;
      const from = edge?.from ?? (item.sourceId && byId.get(item.sourceId) ? center(byId.get(item.sourceId)!) : { x: item.x, y: item.y });
      const to = edge?.to ?? (item.targetId && byId.get(item.targetId) ? center(byId.get(item.targetId)!) : { x: item.x + item.width, y: item.y + item.height });
      return `<g${!edge ? transform : ""}><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${stroke}" stroke-width="2"${item.type === "arrow" ? " marker-end=\"url(#arrowhead)\"" : ""}/>${text(item, (from.x + to.x) / 2, (from.y + to.y) / 2 - 10)}</g>`;
    }
    if (item.type === "freehand") return `<polyline points="${(item.points ?? []).map(([x, y]) => `${x + item.x},${y + item.y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${transform}/>`;
    if (item.type === "image" && item.assetId && assets[item.assetId]) return `<image href="${escape(assets[item.assetId].dataUrl)}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" preserveAspectRatio="none"${transform}/>`;
    if (item.type === "ellipse") return `<g${transform}><ellipse cx="${item.x + item.width / 2}" cy="${item.y + item.height / 2}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${text(item)}</g>`;
    if (item.type === "decision") { const points = `${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height / 2} ${item.x + item.width / 2},${item.y + item.height} ${item.x},${item.y + item.height / 2}`; return `<g${transform}><polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${text(item)}</g>`; }
    if (item.type === "text") return `<g${transform}>${text(item)}</g>`;
    const color = item.type === "sticky" ? escape(item.fill ?? "#fff1a8") : fill;
    return `<g${transform}><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="8" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>${text(item)}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" role="img" aria-label="${escape(canvas.title)}"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#596273"/></marker></defs>${options.background === "transparent" ? "" : `<rect x="${minX}" y="${minY}" width="100%" height="100%" fill="#f7f8fa"/>`}${elements}</svg>`;
}

export async function exportCanvasPng(svg: string): Promise<Blob> {
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d"); if (!context) throw new Error("canvas_export_unavailable"); context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas_export_unavailable")), "image/png"));
  } finally { URL.revokeObjectURL(source); }
}

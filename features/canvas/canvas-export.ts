import type { CanvasAsset, CanvasElement, WorkspaceCanvas } from "./canvas.types";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const center = (item: CanvasElement) => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
const text = (item: CanvasElement, x = item.x + item.width / 2, y = item.y + item.height / 2) => item.text ? `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#202532" font-family="Arial,sans-serif" font-size="16">${escape(item.text)}</text>` : "";

export function exportCanvasSvg(canvas: WorkspaceCanvas, assets: Record<string, CanvasAsset>): string {
  const byId = new Map(canvas.elements.map((item) => [item.id, item]));
  const maxX = Math.max(1200, ...canvas.elements.map((item) => item.x + item.width + 80));
  const maxY = Math.max(760, ...canvas.elements.map((item) => item.y + item.height + 80));
  const elements = canvas.elements.map((item) => {
    const stroke = escape(item.stroke ?? "#596273"); const fill = escape(item.fill ?? "#ffffff"); const transform = item.rotation ? ` transform="rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})"` : "";
    if (item.type === "arrow" || item.type === "line") {
      const from = item.sourceId && byId.get(item.sourceId) ? center(byId.get(item.sourceId)!) : { x: item.x, y: item.y };
      const to = item.targetId && byId.get(item.targetId) ? center(byId.get(item.targetId)!) : { x: item.x + item.width, y: item.y + item.height };
      return `<g><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${stroke}" stroke-width="2"${item.type === "arrow" ? " marker-end=\"url(#arrowhead)\"" : ""}/>${text(item, (from.x + to.x) / 2, (from.y + to.y) / 2 - 10)}</g>`;
    }
    if (item.type === "freehand") return `<polyline points="${(item.points ?? []).map(([x, y]) => `${x + item.x},${y + item.y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (item.type === "image" && item.assetId && assets[item.assetId]) return `<image href="${escape(assets[item.assetId].dataUrl)}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" preserveAspectRatio="xMidYMid meet"${transform}/>`;
    if (item.type === "ellipse") return `<g${transform}><ellipse cx="${item.x + item.width / 2}" cy="${item.y + item.height / 2}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${text(item)}</g>`;
    if (item.type === "decision") { const points = `${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height / 2} ${item.x + item.width / 2},${item.y + item.height} ${item.x},${item.y + item.height / 2}`; return `<g${transform}><polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${text(item)}</g>`; }
    if (item.type === "text") return `<g${transform}>${text(item)}</g>`;
    const color = item.type === "sticky" ? "#fff1a8" : fill;
    return `<g${transform}><rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="8" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>${text(item)}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}" role="img" aria-label="${escape(canvas.title)}"><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#596273"/></marker></defs><rect width="100%" height="100%" fill="#f7f8fa"/>${elements}</svg>`;
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

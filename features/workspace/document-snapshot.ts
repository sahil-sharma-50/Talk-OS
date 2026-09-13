type Point = { x: number; y: number };
const cache = new Map<string, string>();

// Crop the saved drawing itself, including older full-board exports. This never
// reads the live canvas or mounts SVG markup in the document.
export function drawingOnlySnapshot(svg: string): string {
  if (typeof DOMParser === "undefined") return svg;
  const cached = cache.get(svg); if (cached) return cached;
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror")) return svg;
  const points: Point[] = [];
  const backgrounds: Element[] = [];
  let supported = true;
  const number = (node: Element, key: string, fallback = 0) => {
    const raw = node.getAttribute(key); const value = raw === null ? fallback : Number(raw);
    if (!Number.isFinite(value)) supported = false;
    return value;
  };
  const visit = (node: Element, parentTransform: (point: Point) => Point) => {
    const tag = node.localName;
    if (["defs", "title", "desc"].includes(tag)) return;
    if (node.parentElement === root && tag === "rect" && node.getAttribute("width") === "100%" && node.getAttribute("height") === "100%" && node.getAttribute("fill") === "#f7f8fa") { backgrounds.push(node); return; }
    const transform = node.getAttribute("transform");
    const rotate = transform?.match(/^rotate\(\s*([-\d.e+]+)[ ,]+([-\d.e+]+)[ ,]+([-\d.e+]+)\s*\)$/i);
    if (transform && !rotate) { supported = false; return; }
    const apply = (point: Point) => {
      if (!rotate) return parentTransform(point);
      const angle = Number(rotate[1]) * Math.PI / 180, cx = Number(rotate[2]), cy = Number(rotate[3]);
      return parentTransform({ x: cx + (point.x - cx) * Math.cos(angle) - (point.y - cy) * Math.sin(angle), y: cy + (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle) });
    };
    const add = (x: number, y: number) => points.push(apply({ x, y }));
    const rect = (x: number, y: number, width: number, height: number) => { add(x, y); add(x + width, y); add(x, y + height); add(x + width, y + height); };
    if (["rect", "image"].includes(tag)) rect(number(node, "x"), number(node, "y"), number(node, "width"), number(node, "height"));
    else if (tag === "ellipse") { const rx = number(node, "rx"), ry = number(node, "ry"); rect(number(node, "cx") - rx, number(node, "cy") - ry, rx * 2, ry * 2); }
    else if (tag === "line") { add(number(node, "x1"), number(node, "y1")); add(number(node, "x2"), number(node, "y2")); }
    else if (["polygon", "polyline"].includes(tag)) {
      const values = (node.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
      if (values.length % 2 || !values.every(Number.isFinite)) supported = false;
      else for (let index = 0; index < values.length; index += 2) add(values[index], values[index + 1]);
    } else if (tag === "tspan" || tag === "text" && !node.children.length) {
      const text = node.closest("text") ?? node;
      const fontSize = number(text, "font-size", 16);
      const width = [...(node.textContent ?? "")].reduce((sum, character) => sum + fontSize * (character.charCodeAt(0) > 255 ? 1 : .65), 0);
      const x = number(node, "x", number(text, "x")), y = number(node, "y", number(text, "y"));
      const anchor = text.getAttribute("text-anchor");
      rect(x - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0), y - fontSize, width, fontSize * 1.5);
    } else if (!["g", "text"].includes(tag)) { supported = false; return; }
    for (const child of node.children) visit(child, apply);
  };
  for (const child of root.children) visit(child, point => point);
  if (!supported || !points.length || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return svg;
  const left = Math.min(...points.map(point => point.x)) - 16, top = Math.min(...points.map(point => point.y)) - 16;
  const width = Math.max(...points.map(point => point.x)) - left + 16, height = Math.max(...points.map(point => point.y)) - top + 16;
  backgrounds.forEach(node => node.remove());
  root.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
  root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
  const cropped = new XMLSerializer().serializeToString(root);
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  cache.set(svg, cropped);
  return cropped;
}

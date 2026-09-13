import dagre from "@dagrejs/dagre";
import type { CanvasOperationResult, WorkspaceCanvas } from "./canvas.types";

export function arrangeCanvas(canvas: WorkspaceCanvas, nodeIds: string[], direction: "LR" | "TB", signal?: AbortSignal): CanvasOperationResult {
  if (signal?.aborted) return { ok: false, error: "revision_conflict", detail: "Canvas arrangement was interrupted." };
  const selected = new Set(nodeIds);
  const nodes = canvas.elements.filter((item) => selected.has(item.id) && item.type !== "arrow" && item.type !== "line" && item.type !== "freehand");
  if (!nodes.length || nodes.length !== selected.size) return { ok: false, error: "invalid_canvas_scene", detail: "Every arranged item must be a diagram node." };

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: direction, nodesep: 54, ranksep: 90, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node) => graph.setNode(node.id, { width: node.width, height: node.height }));
  canvas.elements.filter((item) => item.type === "arrow" && selected.has(item.sourceId ?? "") && selected.has(item.targetId ?? ""))
    .forEach((edge) => graph.setEdge(edge.sourceId!, edge.targetId!));
  dagre.layout(graph);
  if (signal?.aborted) return { ok: false, error: "revision_conflict", detail: "Canvas arrangement was interrupted." };

  const elements = canvas.elements.map((item) => {
    if (!selected.has(item.id)) return item;
    const position = graph.node(item.id) as { x: number; y: number } | undefined;
    return position ? { ...item, x: position.x - item.width / 2, y: position.y - item.height / 2 } : item;
  });
  return { ok: true, canvas: { ...canvas, revision: canvas.revision + 1, updatedAt: new Date().toISOString(), elements }, removedConnectorIds: [] };
}


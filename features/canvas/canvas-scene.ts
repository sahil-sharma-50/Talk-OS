import { canvasLabelSize } from "./canvas-geometry";
import type { EditAuthor, WorkspaceSnapshot, WorkspaceChangeResult } from "@/features/workspace/workspace.types";
import type { CanvasElement, CanvasOperation, CanvasOperationResult, WorkspaceCanvas } from "./canvas.types";

export const MAX_CANVAS_ELEMENTS = 2_000;
export const MAX_CANVAS_OPERATIONS = 100;

const now = () => new Date().toISOString();
const finite = (...values: number[]) => values.every(Number.isFinite);
const isConnector = (element: CanvasElement) => element.type === "arrow" && (element.sourceId !== undefined || element.targetId !== undefined);

function validate(elements: CanvasElement[]): string | null {
  if (elements.length > MAX_CANVAS_ELEMENTS) return "Canvas exceeds 2,000 elements.";
  const ids = new Set<string>();
  for (const element of elements) {
    if (!element.id.trim() || ids.has(element.id)) return `Element id ${element.id || "(empty)"} is invalid or duplicated.`;
    ids.add(element.id);
    if (!finite(element.x, element.y, element.width, element.height, element.rotation ?? 0) || element.width < 0 || element.height < 0) {
      return `Element ${element.id} has invalid geometry.`;
    }
  }
  for (const element of elements) {
    if (isConnector(element) && (!element.sourceId || !element.targetId || !ids.has(element.sourceId) || !ids.has(element.targetId))) {
      return `Connector ${element.id} references a missing element.`;
    }
  }
  return null;
}

export function createCanvas(workspace: WorkspaceSnapshot, title: string, elements: CanvasElement[] = [], author: EditAuthor = "agent"): WorkspaceChangeResult {
  const invalid = validate(elements);
  if (invalid) return { ok: false, error: "artifact_not_found", artifactId: invalid };
  const canvas: WorkspaceCanvas = {
    id: `canvas-${crypto.randomUUID()}`,
    title: title.trim() || "Untitled canvas",
    revision: 1,
    updatedAt: now(),
    elements: structuredClone(elements),
  };
  const snapshot = { artifactType: "canvas" as const, artifact: structuredClone(canvas) };
  const change = {
    id: `change-${crypto.randomUUID()}`,
    label: `Created ${canvas.title}`,
    author,
    createdAt: canvas.updatedAt,
    before: [],
    after: [snapshot],
    afterRevisions: { [canvas.id]: 1 },
    undone: false,
  };
  return {
    ok: true,
    workspace: { ...workspace, canvases: [...workspace.canvases, canvas], activeCanvasId: canvas.id, changeHistory: [...workspace.changeHistory, change] },
    change,
  };
}

export function applyCanvasOperations(canvas: WorkspaceCanvas, expectedRevision: number, operations: CanvasOperation[]): CanvasOperationResult {
  if (canvas.revision !== expectedRevision) {
    return { ok: false, error: "revision_conflict", detail: "Canvas changed since it was read.", currentRevision: canvas.revision };
  }
  if (operations.length > MAX_CANVAS_OPERATIONS) {
    return { ok: false, error: "canvas_limit_exceeded", detail: "A Canvas edit may contain at most 100 operations." };
  }

  let elements = structuredClone(canvas.elements);
  const removedConnectorIds: string[] = [];
  const byId = () => new Map(elements.map((element) => [element.id, element]));

  for (const operation of operations) {
    const index = byId();
    if (operation.op === "add_node") {
      if (index.has(operation.id)) return { ok: false, error: "invalid_canvas_scene", detail: `Element id ${operation.id} is invalid or duplicated.` };
      elements.push({ id: operation.id, type: operation.role, text: operation.text.trim(), x: operation.x, y: operation.y, ...canvasLabelSize(operation.role, operation.text), ...(operation.width ? { width: operation.width } : {}), ...(operation.height ? { height: operation.height } : {}), ...(operation.fill ? { fill: operation.fill } : {}) });
    } else if (operation.op === "add_shape") {
      if (index.has(operation.id)) return { ok: false, error: "invalid_canvas_scene", detail: `Element id ${operation.id} is invalid or duplicated.` };
      elements.push({ id: operation.id, type: operation.shape, x: operation.x, y: operation.y, width: operation.width, height: operation.height });
    } else if (operation.op === "connect") {
      if (index.has(operation.id)) return { ok: false, error: "invalid_canvas_scene", detail: `Element id ${operation.id} is invalid or duplicated.` };
      elements.push({ id: operation.id, type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: operation.sourceId, targetId: operation.targetId, text: operation.label.trim() });
    } else if (operation.op === "set_text") {
      const element = index.get(operation.id);
      if (!element) return { ok: false, error: "invalid_canvas_scene", detail: `Element ${operation.id} does not exist.` };
      element.text = operation.text.trim();
      if (!["arrow", "line", "image", "freehand"].includes(element.type)) element.height = Math.max(element.height, canvasLabelSize(element.type, element.text).height);
    } else if (operation.op === "transform") {
      const element = index.get(operation.id);
      if (!element) return { ok: false, error: "invalid_canvas_scene", detail: `Element ${operation.id} does not exist.` };
      Object.assign(element, { x: operation.x, y: operation.y, width: operation.width, height: operation.height, rotation: operation.rotation ?? element.rotation });
    } else if (operation.op === "group") {
      if (!operation.ids.length || operation.ids.some((id) => !index.has(id))) return { ok: false, error: "invalid_canvas_scene", detail: "Every grouped element must exist." };
      elements.forEach((element) => { if (operation.ids.includes(element.id)) element.groupId = operation.groupId; });
    } else if (operation.op === "ungroup") {
      elements.forEach((element) => { if (element.groupId === operation.groupId) delete element.groupId; });
    } else if (operation.op === "link_artifact") {
      const element = index.get(operation.id);
      if (!element) return { ok: false, error: "invalid_canvas_scene", detail: `Element ${operation.id} does not exist.` };
      if (operation.source) element.artifactLink = operation.source;
      else delete element.artifactLink;
    } else {
      const remove = new Set(operation.ids);
      elements.forEach((element) => {
        if (isConnector(element) && !remove.has(element.id) && (remove.has(element.sourceId ?? "") || remove.has(element.targetId ?? ""))) {
          remove.add(element.id);
          removedConnectorIds.push(element.id);
        }
      });
      elements = elements.filter((element) => !remove.has(element.id));
    }
  }

  const invalid = validate(elements);
  if (invalid) return { ok: false, error: invalid.startsWith("Canvas exceeds") ? "canvas_limit_exceeded" : "invalid_canvas_scene", detail: invalid };
  return { ok: true, canvas: { ...canvas, revision: canvas.revision + 1, updatedAt: now(), elements }, removedConnectorIds };
}

import { arrangeCanvas } from "@/features/canvas/canvas-layout";
import { applyCanvasOperations, createCanvas } from "@/features/canvas/canvas-scene";
import type { CanvasOperation, WorkspaceCanvas } from "@/features/canvas/canvas.types";
import type { SessionEvent, WorkspaceView } from "@/features/session/session.types";
import { applyWorkspaceChanges } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";

interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  execution_mode: "interactive";
  timeout_seconds: number;
  parameters: Record<string, unknown>;
}

interface CanvasToolCall { type: "tool.call"; call_id: string; name: string; arguments: Record<string, unknown> }
interface CanvasRuntime {
  getWorkspace(): WorkspaceSnapshot;
  setWorkspace(workspace: WorkspaceSnapshot): void;
  setActiveView?(view: Exclude<WorkspaceView, "settings">): void;
}
interface CanvasToolExecution { events: SessionEvent[]; result: Record<string, unknown>; isError?: boolean }

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): FunctionTool => ({
  type: "function",
  name,
  description,
  execution_mode: "interactive",
  timeout_seconds: 20,
  parameters: { type: "object", properties, ...(required.length ? { required } : {}) },
});

const artifactId = { type: "string", description: "The exact canvas id returned by create_canvas, read_canvas, or get_workspace." };
const expectedRevision = { type: "number", description: "The canvas revision returned by the latest read." };
const operationType = (name: CanvasOperation["op"]) => ({ type: "string", enum: [name] });
const operations = {
  type: "array",
  maxItems: 100,
  description: "Ordered canvas operations. Use stable unique element ids and connect only elements created earlier in the batch or already on the canvas.",
  items: {
    oneOf: [
      { type: "object", properties: { op: operationType("add_node"), id: { type: "string" }, role: { type: "string", enum: ["process", "decision", "sticky", "text"] }, text: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["op", "id", "role", "text", "x", "y"] },
      { type: "object", properties: { op: operationType("add_shape"), id: { type: "string" }, shape: { type: "string", enum: ["rectangle", "ellipse", "line"] }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["op", "id", "shape", "x", "y", "width", "height"] },
      { type: "object", properties: { op: operationType("connect"), id: { type: "string" }, sourceId: { type: "string" }, targetId: { type: "string" }, label: { type: "string" } }, required: ["op", "id", "sourceId", "targetId"] },
      { type: "object", properties: { op: operationType("set_text"), id: { type: "string" }, text: { type: "string" } }, required: ["op", "id", "text"] },
      { type: "object", properties: { op: operationType("transform"), id: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, rotation: { type: "number" } }, required: ["op", "id", "x", "y", "width", "height"] },
      { type: "object", properties: { op: operationType("group"), ids: { type: "array", items: { type: "string" } }, groupId: { type: "string" } }, required: ["op", "ids", "groupId"] },
      { type: "object", properties: { op: operationType("ungroup"), groupId: { type: "string" } }, required: ["op", "groupId"] },
      { type: "object", properties: { op: operationType("link_artifact"), id: { type: "string" }, source: { anyOf: [{ type: "object", properties: { kind: { type: "string", enum: ["document", "sheet", "planner", "research"] }, id: { type: "string" } }, required: ["kind", "id"] }, { type: "null" }] } }, required: ["op", "id", "source"] },
      { type: "object", properties: { op: operationType("remove"), ids: { type: "array", items: { type: "string" } } }, required: ["op", "ids"] },
    ],
  },
};

export const canvasTools: FunctionTool[] = [
  tool("create_canvas", "Create and open a visual canvas, optionally populated atomically with semantic operations.", { title: { type: "string" }, operations }, ["title"]),
  tool("read_canvas", "Read the active or specified semantic canvas scene and revision.", { canvas_id: artifactId }),
  tool("edit_canvas", "Apply an atomic revision-safe set of semantic operations to a canvas.", { canvas_id: artifactId, expected_revision: expectedRevision, operations }, ["canvas_id", "expected_revision", "operations"]),
  tool("arrange_canvas", "Arrange selected diagram nodes while preserving drawings, images, and unrelated items.", { canvas_id: artifactId, expected_revision: expectedRevision, node_ids: { type: "array", items: { type: "string" } }, direction: { type: "string", enum: ["LR", "TB"] } }, ["canvas_id", "expected_revision", "node_ids"]),
];

const success = (call: CanvasToolCall, detail: string, result: Record<string, unknown>): CanvasToolExecution => ({ events: [{ type: "ACTION_COMPLETED", actionId: call.call_id, detail, at: new Date().toISOString() }], result });
const failure = (call: CanvasToolCall, error: string, extra: Record<string, unknown> = {}): CanvasToolExecution => ({ events: [{ type: "ACTION_FAILED", actionId: call.call_id, detail: error, at: new Date().toISOString() }], result: { error, ...extra }, isError: true });
const text = (args: Record<string, unknown>, key: string) => typeof args[key] === "string" ? String(args[key]).trim() : "";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const stringArray = (value: unknown): string[] | null => Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;

function parseOperations(value: unknown): CanvasOperation[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) return null;
  const parsed: CanvasOperation[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const op = item.op ?? (
      typeof item.role === "string" ? "add_node"
        : typeof item.shape === "string" ? "add_shape"
          : typeof item.sourceId === "string" && typeof item.targetId === "string" ? "connect"
            : undefined
    );
    if (op === "add_node" && typeof item.id === "string" && ["process", "decision", "sticky", "text"].includes(String(item.role)) && typeof item.text === "string" && finite(item.x) && finite(item.y)) {
      parsed.push({ op, id: item.id, role: item.role as "process" | "decision" | "sticky" | "text", text: item.text, x: item.x, y: item.y });
    } else if (op === "add_shape" && typeof item.id === "string" && ["rectangle", "ellipse", "line"].includes(String(item.shape)) && finite(item.x) && finite(item.y) && finite(item.width) && finite(item.height)) {
      parsed.push({ op, id: item.id, shape: item.shape as "rectangle" | "ellipse" | "line", x: item.x, y: item.y, width: item.width, height: item.height });
    } else if (op === "connect" && typeof item.id === "string" && typeof item.sourceId === "string" && typeof item.targetId === "string") {
      parsed.push({ op, id: item.id, sourceId: item.sourceId, targetId: item.targetId, label: typeof item.label === "string" ? item.label : "" });
    } else if (op === "set_text" && typeof item.id === "string" && typeof item.text === "string") {
      parsed.push({ op, id: item.id, text: item.text });
    } else if (op === "transform" && typeof item.id === "string" && finite(item.x) && finite(item.y) && finite(item.width) && finite(item.height) && (item.rotation === undefined || finite(item.rotation))) {
      parsed.push({ op, id: item.id, x: item.x, y: item.y, width: item.width, height: item.height, ...(finite(item.rotation) ? { rotation: item.rotation } : {}) });
    } else if (op === "group" && stringArray(item.ids) && typeof item.groupId === "string") {
      parsed.push({ op, ids: item.ids as string[], groupId: item.groupId });
    } else if (op === "ungroup" && typeof item.groupId === "string") {
      parsed.push({ op, groupId: item.groupId });
    } else if (op === "link_artifact" && typeof item.id === "string" && (item.source === null || (item.source && typeof item.source === "object"))) {
      const source = item.source as Record<string, unknown> | null;
      if (source && (!["document", "sheet", "planner", "research"].includes(String(source.kind)) || typeof source.id !== "string")) return null;
      parsed.push({ op, id: item.id, source: source ? { kind: source.kind as "document" | "sheet" | "planner" | "research", id: source.id as string } : null });
    } else if (op === "remove" && stringArray(item.ids)) {
      parsed.push({ op, ids: item.ids as string[] });
    } else return null;
  }
  return parsed;
}

function findCanvas(workspace: WorkspaceSnapshot, canvasId: string): WorkspaceCanvas | undefined {
  return workspace.canvases.find((item) => item.id === (canvasId || workspace.activeCanvasId));
}

export async function executeCanvasTool(call: CanvasToolCall, runtime: CanvasRuntime, signal?: AbortSignal): Promise<CanvasToolExecution | null> {
  if (!canvasTools.some((candidate) => candidate.name === call.name)) return null;
  if (signal?.aborted) return failure(call, "interrupted");
  const workspace = runtime.getWorkspace();
  const args = call.arguments;

  if (call.name === "create_canvas") {
    const parsed = parseOperations(args.operations);
    if (!parsed) return failure(call, "invalid_canvas_operations");
    const preview: WorkspaceCanvas = { id: "canvas-preview", title: text(args, "title"), revision: 0, updatedAt: new Date().toISOString(), elements: [] };
    const populated = applyCanvasOperations(preview, 0, parsed);
    if (!populated.ok) return failure(call, populated.error, { detail: populated.detail });
    const created = createCanvas(workspace, text(args, "title"), populated.canvas.elements, "agent");
    if (!created.ok) return failure(call, created.error, { artifact_id: created.artifactId });
    if (signal?.aborted) return failure(call, "interrupted");
    runtime.setWorkspace(created.workspace);
    runtime.setActiveView?.("canvas");
    const canvas = created.workspace.canvases.at(-1)!;
    return success(call, `${canvas.title} created`, { canvas_id: canvas.id, revision: canvas.revision, change_id: created.change.id });
  }

  if (call.name === "read_canvas") {
    const canvas = findCanvas(workspace, text(args, "canvas_id"));
    return canvas ? success(call, `Read ${canvas.title}`, { id: canvas.id, title: canvas.title, revision: canvas.revision, elements: canvas.elements }) : failure(call, "canvas_not_found");
  }

  const canvas = findCanvas(workspace, text(args, "canvas_id"));
  if (!canvas) return failure(call, "canvas_not_found");
  if (!finite(args.expected_revision)) return failure(call, "expected_revision_required");
  if (canvas.revision !== args.expected_revision) return failure(call, "revision_conflict", { current_revision: canvas.revision });
  let elements = canvas.elements;

  if (call.name === "edit_canvas") {
    const parsed = parseOperations(args.operations);
    if (!parsed) return failure(call, "invalid_canvas_operations");
    const edited = applyCanvasOperations(canvas, args.expected_revision, parsed);
    if (!edited.ok) return failure(call, edited.error, { detail: edited.detail, current_revision: edited.currentRevision });
    elements = edited.canvas.elements;
  } else {
    const nodeIds = stringArray(args.node_ids);
    if (!nodeIds?.length) return failure(call, "node_ids_required");
    const arranged = arrangeCanvas(canvas, nodeIds, args.direction === "TB" ? "TB" : "LR", signal);
    if (!arranged.ok) return failure(call, signal?.aborted ? "interrupted" : arranged.error, { detail: arranged.detail });
    elements = arranged.canvas.elements;
  }

  if (signal?.aborted) return failure(call, "interrupted");
  const current = findCanvas(runtime.getWorkspace(), canvas.id);
  if (!current || current.revision !== canvas.revision) return failure(call, "revision_conflict", { current_revision: current?.revision });
  const committed = applyWorkspaceChanges(runtime.getWorkspace(), call.name === "edit_canvas" ? `Updated ${canvas.title}` : `Arranged ${canvas.title}`, [{ kind: "canvas", artifactId: canvas.id, expectedRevision: canvas.revision, elements }]);
  if (!committed.ok) return failure(call, committed.error, { artifact_id: committed.artifactId, current_revision: committed.currentRevision });
  if (signal?.aborted) return failure(call, "interrupted");
  runtime.setWorkspace(committed.workspace);
  runtime.setActiveView?.("canvas");
  return success(call, call.name === "edit_canvas" ? "Canvas updated" : "Canvas arranged", { canvas_id: canvas.id, revision: committed.change.afterRevisions[canvas.id], change_id: committed.change.id });
}

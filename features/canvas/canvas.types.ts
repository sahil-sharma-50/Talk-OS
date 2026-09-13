export type CanvasElementType =
  | "process"
  | "decision"
  | "sticky"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "freehand"
  | "image";

export interface CanvasPoint { x: number; y: number }

export interface CanvasArtifactLink {
  kind: "document" | "sheet" | "planner" | "research";
  id: string;
}

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  points?: Array<[number, number]>;
  sourceId?: string;
  targetId?: string;
  assetId?: string;
  groupId?: string;
  fill?: string;
  stroke?: string;
  artifactLink?: CanvasArtifactLink;
}

export interface WorkspaceCanvas {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  elements: CanvasElement[];
}

export interface CanvasAsset {
  id: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  dataUrl: string;
}

export type CanvasOperation =
  | { op: "add_node"; id: string; role: "process" | "decision" | "sticky" | "text"; text: string; x: number; y: number }
  | { op: "add_shape"; id: string; shape: "rectangle" | "ellipse" | "line"; x: number; y: number; width: number; height: number }
  | { op: "connect"; id: string; sourceId: string; targetId: string; label: string }
  | { op: "set_text"; id: string; text: string }
  | { op: "transform"; id: string; x: number; y: number; width: number; height: number; rotation?: number }
  | { op: "group"; ids: string[]; groupId: string }
  | { op: "ungroup"; groupId: string }
  | { op: "link_artifact"; id: string; source: CanvasArtifactLink | null }
  | { op: "remove"; ids: string[] };

export type CanvasOperationResult =
  | { ok: true; canvas: WorkspaceCanvas; removedConnectorIds: string[] }
  | { ok: false; error: "revision_conflict" | "invalid_canvas_scene" | "canvas_limit_exceeded"; detail: string; currentRevision?: number };


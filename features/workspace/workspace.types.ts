import type { CanvasAsset, CanvasElement, WorkspaceCanvas } from "@/features/canvas/canvas.types";
import type { DashboardSource, DashboardWidget, WorkspaceDashboard } from "@/features/dashboard/dashboard.types";

export type DocumentKind = "notes" | "brief" | "import";
export type EditAuthor = "user" | "agent";
export type ArtifactType = "document" | "sheet" | "planner" | "canvas" | "dashboard";

interface DocumentEmbedSource { id: string; title: string; sourceId: string; sourceRevision: number; createdAt: string }
export interface CanvasDocumentEmbed extends DocumentEmbedSource { kind: "canvas"; svg: string }
export interface SheetSnapshotCell { address: string; text: string; numeric: boolean; style?: SheetCellStyle }
export interface SheetDocumentEmbed extends DocumentEmbedSource { kind: "sheet"; range: string; sourceRange?: string; headerRow: boolean; rows: SheetSnapshotCell[][] }
export type DocumentEmbed = CanvasDocumentEmbed | SheetDocumentEmbed;
export type DocumentEmbeds = Record<string, DocumentEmbed>;
export interface DocumentRevision { revision: number; content: string; embeds?: DocumentEmbeds; editedBy: EditAuthor; editedAt: string }
export interface WorkspaceDocument { id: string; title: string; kind: DocumentKind; content: string; embeds?: DocumentEmbeds; revision: number; updatedAt: string; history: DocumentRevision[] }

export type SheetCellFormat = "text" | "number" | "currency" | "percent";
export interface SheetCellStyle { bold?: boolean; italic?: boolean; underline?: boolean; align?: "left" | "center" | "right"; color?: string; background?: string }
export interface SheetCell { value: string | number; format?: SheetCellFormat; style?: SheetCellStyle }
export interface SheetChart { title: string; labelRange: string; valueRange: string }
export interface WorkspaceSheet { id: string; title: string; revision: number; updatedAt: string; cells: Record<string, SheetCell>; chart?: SheetChart }

export interface PlannerTask { id: string; title: string; notes?: string; completed: boolean; dueDate?: string; startsAt?: string; endsAt?: string; blockedReason?: string; riskLevel?: "low" | "medium" | "high" }
export interface WorkspacePlanner { id: string; title: string; revision: number; updatedAt: string; timezone: string; tasks: PlannerTask[] }

export interface RetrievedSource { id: string; title: string; url: string; snippet: string; content: string; retrievedAt: string }
export interface ResearchCollection { id: string; query: string; summary: string; sourceIds: string[]; status: "searching" | "complete" | "failed"; createdAt: string }

export interface TaskStep { id: string; label: string; status: "pending" | "active" | "completed" }
export interface WorkspaceTask { objective: string; constraints: string[]; steps: TaskStep[]; revision: number }

export type ArtifactSnapshot =
  | { artifactType: "document"; artifact: WorkspaceDocument }
  | { artifactType: "sheet"; artifact: WorkspaceSheet }
  | { artifactType: "planner"; artifact: WorkspacePlanner }
  | { artifactType: "canvas"; artifact: WorkspaceCanvas }
  | { artifactType: "dashboard"; artifact: WorkspaceDashboard };
export type TrashedArtifact = ArtifactSnapshot & { id: string; deletedAt: string };
export interface WorkspaceChange {
  id: string;
  label: string;
  author: EditAuthor;
  createdAt: string;
  before: ArtifactSnapshot[];
  after?: ArtifactSnapshot[];
  afterRevisions: Record<string, number>;
  undoRevisions?: Record<string, number | null>;
  undone: boolean;
}
export interface WorkspaceConversationTurn { id: string; speaker: "user" | "agent"; text: string; at: string }

export interface WorkspaceSnapshot {
  version: 4;
  documentDrafts?: Record<string, { content: string; baseRevision: number; baseContent: string; embeds?: DocumentEmbeds }>;
  documentView?: { documentId: string; mode: "source" | "preview"; section?: string; embedId?: string; requestId?: string };
  documents: WorkspaceDocument[];
  activeDocumentId: string;
  sheets: WorkspaceSheet[];
  activeSheetId: string | null;
  planners: WorkspacePlanner[];
  activePlannerId: string | null;
  canvases: WorkspaceCanvas[];
  activeCanvasId: string | null;
  canvasAssets: Record<string, CanvasAsset>;
  dashboards: WorkspaceDashboard[];
  activeDashboardId: string | null;
  sources: RetrievedSource[];
  researchCollections: ResearchCollection[];
  selectedSourceId: string | null;
  selectedResearchCollectionId: string | null;
  task: WorkspaceTask;
  trash: TrashedArtifact[];
  changeHistory: WorkspaceChange[];
  conversation: WorkspaceConversationTurn[];
}

export interface TaskUpdate { objective: string; constraints?: string[]; steps?: string[] }
export type DocumentEditResult =
  | { ok: true; workspace: WorkspaceSnapshot; document: WorkspaceDocument }
  | { ok: false; error: "document_not_found" | "document_revision_conflict"; currentRevision?: number };

export type WorkspaceMutation =
  | { kind: "document"; artifactId: string; expectedRevision: number; content: string; title?: string; embeds?: DocumentEmbeds }
  | { kind: "sheet"; artifactId: string; expectedRevision: number; cells: Record<string, string | number>; formats?: Record<string, SheetCellFormat>; styles?: Record<string, SheetCellStyle>; replaceCells?: Record<string, SheetCell>; chart?: SheetChart }
  | { kind: "planner"; artifactId: string; expectedRevision: number; tasks: PlannerTask[] }
  | { kind: "canvas"; artifactId: string; expectedRevision: number; elements: CanvasElement[] }
  | { kind: "dashboard"; artifactId: string; expectedRevision: number; definition: WorkspaceDashboard };

export type { DashboardSource, DashboardWidget, WorkspaceDashboard };
export type WorkspaceChangeResult =
  | { ok: true; workspace: WorkspaceSnapshot; change: WorkspaceChange }
  | { ok: false; error: "artifact_not_found" | "revision_conflict" | "invalid_workspace_changes"; artifactId: string; currentRevision?: number };

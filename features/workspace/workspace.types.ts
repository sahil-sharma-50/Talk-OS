export type DocumentKind = "notes" | "brief" | "import";
export type EditAuthor = "user" | "agent";
export type ArtifactType = "document" | "sheet" | "planner";

export interface DocumentRevision { revision: number; content: string; editedBy: EditAuthor; editedAt: string }
export interface WorkspaceDocument { id: string; title: string; kind: DocumentKind; content: string; revision: number; updatedAt: string; history: DocumentRevision[] }

export type SheetCellFormat = "text" | "number" | "currency" | "percent";
export interface SheetCell { value: string | number; format?: SheetCellFormat }
export interface SheetChart { title: string; labelRange: string; valueRange: string }
export interface WorkspaceSheet { id: string; title: string; revision: number; updatedAt: string; cells: Record<string, SheetCell>; chart?: SheetChart }

export interface PlannerTask { id: string; title: string; notes?: string; completed: boolean; dueDate?: string; startsAt?: string; endsAt?: string }
export interface WorkspacePlanner { id: string; title: string; revision: number; updatedAt: string; timezone: string; tasks: PlannerTask[] }

export interface RetrievedSource { id: string; title: string; url: string; snippet: string; content: string; retrievedAt: string }
export interface ResearchCollection { id: string; query: string; summary: string; sourceIds: string[]; status: "searching" | "complete" | "failed"; createdAt: string }

export interface TaskStep { id: string; label: string; status: "pending" | "active" | "completed" }
export interface WorkspaceTask { objective: string; constraints: string[]; steps: TaskStep[]; revision: number }

export type ArtifactSnapshot =
  | { artifactType: "document"; artifact: WorkspaceDocument }
  | { artifactType: "sheet"; artifact: WorkspaceSheet }
  | { artifactType: "planner"; artifact: WorkspacePlanner };
export type TrashedArtifact = ArtifactSnapshot & { id: string; deletedAt: string };
export interface WorkspaceChange { id: string; label: string; author: EditAuthor; createdAt: string; before: ArtifactSnapshot[]; afterRevisions: Record<string, number>; undone: boolean }
export interface WorkspaceConversationTurn { id: string; speaker: "user" | "agent"; text: string; at: string }

export interface WorkspaceSnapshot {
  version: 2;
  documents: WorkspaceDocument[];
  activeDocumentId: string;
  sheets: WorkspaceSheet[];
  activeSheetId: string | null;
  planners: WorkspacePlanner[];
  activePlannerId: string | null;
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
  | { kind: "document"; artifactId: string; expectedRevision: number; content: string; title?: string }
  | { kind: "sheet"; artifactId: string; expectedRevision: number; cells: Record<string, string | number>; formats?: Record<string, SheetCellFormat>; chart?: SheetChart }
  | { kind: "planner"; artifactId: string; expectedRevision: number; tasks: PlannerTask[] };
export type WorkspaceChangeResult =
  | { ok: true; workspace: WorkspaceSnapshot; change: WorkspaceChange }
  | { ok: false; error: "artifact_not_found" | "revision_conflict"; artifactId: string; currentRevision?: number };

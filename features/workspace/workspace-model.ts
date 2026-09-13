import type {
  ArtifactSnapshot, ArtifactType, DocumentEditResult, DocumentKind, EditAuthor, PlannerTask,
  RetrievedSource, TaskUpdate, TrashedArtifact, WorkspaceChange, WorkspaceChangeResult,
  WorkspaceDocument, WorkspaceMutation, WorkspacePlanner, WorkspaceSheet, WorkspaceSnapshot,
} from "./workspace.types";
import type { WorkspaceCanvas } from "@/features/canvas/canvas.types";
import type { DashboardSource, DashboardWidget, WorkspaceDashboard } from "@/features/dashboard/dashboard.types";

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const clone = <T,>(value: T): T => structuredClone(value);
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function createWorkspace(): WorkspaceSnapshot {
  const updatedAt = now();
  const document: WorkspaceDocument = {
    id: makeId("doc"), title: "Project notes", kind: "notes",
    content: "Drop in the details of something you need to get done. TalkOS can turn them into documents, budgets, schedules, and sourced research.",
    revision: 1, updatedAt, history: [],
  };
  return {
    version: 4, documents: [document], activeDocumentId: document.id,
    sheets: [], activeSheetId: null, planners: [], activePlannerId: null,
    canvases: [], activeCanvasId: null, canvasAssets: {},
    dashboards: [], activeDashboardId: null,
    sources: [], researchCollections: [], selectedSourceId: null, selectedResearchCollectionId: null,
    task: { objective: "", constraints: [], steps: [], revision: 0 }, trash: [], changeHistory: [], conversation: [],
  };
}

export function createDashboard(workspace: WorkspaceSnapshot, title: string, sources: DashboardSource[] = [], widgets: DashboardWidget[] = [], author: EditAuthor = "user", options: { launchDate?: string; timezone?: string } = {}): WorkspaceSnapshot {
  const dashboard: WorkspaceDashboard = { id: makeId("dashboard"), title: title.trim() || "Untitled dashboard", revision: 1, updatedAt: now(), sources: clone(sources), timezone: options.timezone || timezone(), widgets: clone(widgets), ...(options.launchDate ? { launchDate: options.launchDate } : {}) };
  const change: WorkspaceChange = { id: makeId("change"), label: `Created ${dashboard.title}`, author, createdAt: dashboard.updatedAt, before: [], after: [{ artifactType: "dashboard", artifact: clone(dashboard) }], afterRevisions: { [dashboard.id]: 1 }, undone: false };
  return { ...workspace, dashboards: [...workspace.dashboards, dashboard], activeDashboardId: dashboard.id, changeHistory: [...workspace.changeHistory, change] };
}

export function createWorkspaceDocument(workspace: WorkspaceSnapshot, title: string, content = "", kind: DocumentKind = "notes"): WorkspaceSnapshot {
  const document: WorkspaceDocument = { id: makeId("doc"), title: title.trim() || "Untitled document", kind, content, revision: 1, updatedAt: now(), history: [] };
  return { ...workspace, documents: [...workspace.documents, document], activeDocumentId: document.id };
}

export function createSheet(workspace: WorkspaceSnapshot, title: string, cells: WorkspaceSheet["cells"] = {}): WorkspaceSnapshot {
  const sheet: WorkspaceSheet = { id: makeId("sheet"), title: title.trim() || "Untitled sheet", revision: 1, updatedAt: now(), cells };
  return { ...workspace, sheets: [...workspace.sheets, sheet], activeSheetId: sheet.id };
}

export function createPlanner(workspace: WorkspaceSnapshot, title: string, tasks: PlannerTask[] = []): WorkspaceSnapshot {
  const planner: WorkspacePlanner = { id: makeId("planner"), title: title.trim() || "Untitled planner", revision: 1, updatedAt: now(), timezone: timezone(), tasks };
  return { ...workspace, planners: [...workspace.planners, planner], activePlannerId: planner.id };
}

export function editWorkspaceDocument(workspace: WorkspaceSnapshot, documentId: string, content: string, expectedRevision: number, editedBy: EditAuthor, title?: string, embeds?: WorkspaceDocument["embeds"]): DocumentEditResult {
  const existing = workspace.documents.find((document) => document.id === documentId);
  if (!existing) return { ok: false, error: "document_not_found" };
  if (existing.revision !== expectedRevision) return { ok: false, error: "document_revision_conflict", currentRevision: existing.revision };
  const updated: WorkspaceDocument = {
    ...existing, title: title?.trim() || existing.title, content, revision: existing.revision + 1, updatedAt: now(),
    ...(embeds ? { embeds: clone(embeds) } : {}),
    history: [...existing.history, { revision: existing.revision, content: existing.content, ...(existing.embeds ? { embeds: clone(existing.embeds) } : {}), editedBy, editedAt: existing.updatedAt }],
  };
  return { ok: true, document: updated, workspace: { ...workspace, documents: workspace.documents.map((document) => document.id === documentId ? updated : document) } };
}

export function undoWorkspaceDocument(workspace: WorkspaceSnapshot, documentId: string): WorkspaceSnapshot {
  const existing = workspace.documents.find((document) => document.id === documentId);
  const previous = existing?.history.at(-1);
  if (!existing || !previous) return workspace;
  const restored: WorkspaceDocument = { ...existing, content: previous.content, embeds: previous.embeds, revision: existing.revision + 1, updatedAt: now(), history: existing.history.slice(0, -1) };
  return { ...workspace, documents: workspace.documents.map((document) => document.id === documentId ? restored : document) };
}

export function updateWorkspaceTask(workspace: WorkspaceSnapshot, update: TaskUpdate): WorkspaceSnapshot {
  return { ...workspace, task: {
    objective: update.objective.trim(),
    constraints: update.constraints?.map((constraint) => constraint.trim()).filter(Boolean) ?? workspace.task.constraints,
    steps: update.steps?.map((label, index) => ({ id: `step-${workspace.task.revision + 1}-${index + 1}`, label: label.trim(), status: (index === 0 ? "active" : "pending") as "active" | "pending" })).filter((step) => step.label) ?? workspace.task.steps,
    revision: workspace.task.revision + 1,
  } };
}

export function addRetrievedSources(workspace: WorkspaceSnapshot, sources: RetrievedSource[], query = "Earlier research"): WorkspaceSnapshot {
  const byUrl = new Map(workspace.sources.map((source) => [source.url, source]));
  sources.forEach((source) => {
    const existing = byUrl.get(source.url);
    byUrl.set(source.url, existing ? { ...source, id: existing.id, content: source.content || existing.content } : source);
  });
  const merged = [...byUrl.values()];
  const sourceIds = sources.map((source) => byUrl.get(source.url)!.id);
  const existing = workspace.researchCollections.find((collection) => collection.query === query);
  const collection = existing ? { ...existing, status: "complete" as const, sourceIds: [...new Set([...existing.sourceIds, ...sourceIds])] }
    : { id: makeId("research"), query, summary: "", sourceIds, status: "complete" as const, createdAt: now() };
  return {
    ...workspace, sources: merged,
    researchCollections: existing ? workspace.researchCollections.map((item) => item.id === existing.id ? collection : item) : [...workspace.researchCollections, collection],
    selectedSourceId: sourceIds.at(-1) ?? workspace.selectedSourceId, selectedResearchCollectionId: collection.id,
  };
}

function pruneUnusedSources(workspace: WorkspaceSnapshot, researchCollections: WorkspaceSnapshot["researchCollections"]): RetrievedSource[] {
  const referencedSourceIds = new Set(researchCollections.flatMap((item) => item.sourceIds));
  return workspace.sources.filter((source) => referencedSourceIds.has(source.id));
}

export function deleteResearchSource(workspace: WorkspaceSnapshot, collectionId: string, sourceId: string): WorkspaceSnapshot {
  const collection = workspace.researchCollections.find((item) => item.id === collectionId);
  if (!collection?.sourceIds.includes(sourceId)) return workspace;
  const researchCollections = workspace.researchCollections.map((item) => item.id === collectionId
    ? { ...item, sourceIds: item.sourceIds.filter((id) => id !== sourceId) }
    : item);
  const selectedSourceId = workspace.selectedResearchCollectionId === collectionId && workspace.selectedSourceId === sourceId
    ? researchCollections.find((item) => item.id === collectionId)?.sourceIds[0] ?? null
    : workspace.selectedSourceId;
  return { ...workspace, researchCollections, sources: pruneUnusedSources(workspace, researchCollections), selectedSourceId };
}

export function deleteResearchCollection(workspace: WorkspaceSnapshot, collectionId: string): WorkspaceSnapshot {
  const deletedIndex = workspace.researchCollections.findIndex((item) => item.id === collectionId);
  if (deletedIndex < 0) return workspace;
  const researchCollections = workspace.researchCollections.filter((item) => item.id !== collectionId);
  const selectedResearchCollectionId = workspace.selectedResearchCollectionId === collectionId
    ? researchCollections[Math.min(deletedIndex, researchCollections.length - 1)]?.id ?? null
    : workspace.selectedResearchCollectionId;
  const selectedCollection = researchCollections.find((item) => item.id === selectedResearchCollectionId);
  const selectedSourceId = selectedCollection?.sourceIds.includes(workspace.selectedSourceId ?? "")
    ? workspace.selectedSourceId
    : selectedCollection?.sourceIds[0] ?? null;
  return {
    ...workspace,
    researchCollections,
    sources: pruneUnusedSources(workspace, researchCollections),
    selectedResearchCollectionId,
    selectedSourceId,
  };
}

function findArtifact(workspace: WorkspaceSnapshot, type: ArtifactType, id: string): WorkspaceDocument | WorkspaceSheet | WorkspacePlanner | WorkspaceCanvas | WorkspaceDashboard | undefined {
  if (type === "document") return workspace.documents.find((item) => item.id === id);
  if (type === "sheet") return workspace.sheets.find((item) => item.id === id);
  if (type === "planner") return workspace.planners.find((item) => item.id === id);
  if (type === "canvas") return workspace.canvases.find((item) => item.id === id);
  return workspace.dashboards.find((item) => item.id === id);
}

function snapshot(type: ArtifactType, artifact: WorkspaceDocument | WorkspaceSheet | WorkspacePlanner | WorkspaceCanvas | WorkspaceDashboard): ArtifactSnapshot {
  return { artifactType: type, artifact: clone(artifact) } as ArtifactSnapshot;
}

function replaceArtifact(workspace: WorkspaceSnapshot, state: ArtifactSnapshot, revision: number): WorkspaceSnapshot {
  const artifact = { ...clone(state.artifact), revision, updatedAt: now() };
  if (state.artifactType === "document") return { ...workspace, documents: workspace.documents.some((item) => item.id === artifact.id) ? workspace.documents.map((item) => item.id === artifact.id ? artifact as WorkspaceDocument : item) : [...workspace.documents, artifact as WorkspaceDocument], activeDocumentId: artifact.id };
  if (state.artifactType === "sheet") return { ...workspace, sheets: workspace.sheets.some((item) => item.id === artifact.id) ? workspace.sheets.map((item) => item.id === artifact.id ? artifact as WorkspaceSheet : item) : [...workspace.sheets, artifact as WorkspaceSheet], activeSheetId: artifact.id };
  if (state.artifactType === "planner") return { ...workspace, planners: workspace.planners.some((item) => item.id === artifact.id) ? workspace.planners.map((item) => item.id === artifact.id ? artifact as WorkspacePlanner : item) : [...workspace.planners, artifact as WorkspacePlanner], activePlannerId: artifact.id };
  if (state.artifactType === "canvas") return { ...workspace, canvases: workspace.canvases.some((item) => item.id === artifact.id) ? workspace.canvases.map((item) => item.id === artifact.id ? artifact as WorkspaceCanvas : item) : [...workspace.canvases, artifact as WorkspaceCanvas], activeCanvasId: artifact.id };
  return { ...workspace, dashboards: workspace.dashboards.some((item) => item.id === artifact.id) ? workspace.dashboards.map((item) => item.id === artifact.id ? artifact as WorkspaceDashboard : item) : [...workspace.dashboards, artifact as WorkspaceDashboard], activeDashboardId: artifact.id };
}

function removeArtifact(workspace: WorkspaceSnapshot, type: ArtifactType, id: string): WorkspaceSnapshot {
  if (type === "document") { const documents = workspace.documents.filter((item) => item.id !== id); return { ...workspace, documents, activeDocumentId: documents[0]?.id ?? "" }; }
  if (type === "sheet") { const sheets = workspace.sheets.filter((item) => item.id !== id); return { ...workspace, sheets, activeSheetId: sheets[0]?.id ?? null }; }
  if (type === "planner") { const planners = workspace.planners.filter((item) => item.id !== id); return { ...workspace, planners, activePlannerId: planners[0]?.id ?? null }; }
  if (type === "canvas") { const canvases = workspace.canvases.filter((item) => item.id !== id); return { ...workspace, canvases, activeCanvasId: canvases[0]?.id ?? null }; }
  const dashboards = workspace.dashboards.filter((item) => item.id !== id); return { ...workspace, dashboards, activeDashboardId: dashboards[0]?.id ?? null };
}

export function applyWorkspaceChanges(workspace: WorkspaceSnapshot, label: string, mutations: WorkspaceMutation[], author: EditAuthor = "agent"): WorkspaceChangeResult {
  const changedIds = new Set<string>();
  for (const mutation of mutations) {
    if (changedIds.has(mutation.artifactId)) return { ok: false, error: "invalid_workspace_changes", artifactId: mutation.artifactId };
    changedIds.add(mutation.artifactId);
    const artifact = findArtifact(workspace, mutation.kind, mutation.artifactId);
    if (!artifact) return { ok: false, error: "artifact_not_found", artifactId: mutation.artifactId };
    if (artifact.revision !== mutation.expectedRevision) return { ok: false, error: "revision_conflict", artifactId: mutation.artifactId, currentRevision: artifact.revision };
  }
  const createdAt = now();
  const before = mutations.map((mutation) => snapshot(mutation.kind, findArtifact(workspace, mutation.kind, mutation.artifactId)!));
  let next = workspace;
  for (const mutation of mutations) {
    if (mutation.kind === "document") {
      const result = editWorkspaceDocument(next, mutation.artifactId, mutation.content, mutation.expectedRevision, author, mutation.title, mutation.embeds);
      if (result.ok) next = result.workspace;
    } else if (mutation.kind === "sheet") {
      const normalizedCells = Object.fromEntries(Object.entries(mutation.cells).map(([key, value]) => [key.toUpperCase(), value]));
      next = { ...next, sheets: next.sheets.map((sheet) => sheet.id === mutation.artifactId ? {
        ...sheet, revision: sheet.revision + 1, updatedAt: createdAt,
        cells: mutation.replaceCells ? clone(mutation.replaceCells) : Object.fromEntries([...new Set([...Object.keys(sheet.cells), ...Object.keys(mutation.cells), ...Object.keys(mutation.formats ?? {}), ...Object.keys(mutation.styles ?? {})].map((address) => address.toUpperCase()))].map((address) => {
          const existing = sheet.cells[address];
          return [address, { ...existing, value: normalizedCells[address] ?? existing?.value ?? "", format: mutation.formats?.[address] ?? existing?.format, style: { ...existing?.style, ...mutation.styles?.[address] } }];
        })),
        chart: mutation.chart ?? sheet.chart,
      } : sheet) };
    } else if (mutation.kind === "planner") {
      next = { ...next, planners: next.planners.map((planner) => planner.id === mutation.artifactId ? { ...planner, revision: planner.revision + 1, updatedAt: createdAt, tasks: clone(mutation.tasks) } : planner) };
    } else if (mutation.kind === "canvas") {
      next = { ...next, canvases: next.canvases.map((canvas) => canvas.id === mutation.artifactId ? { ...canvas, revision: canvas.revision + 1, updatedAt: createdAt, elements: clone(mutation.elements) } : canvas) };
    } else {
      next = { ...next, dashboards: next.dashboards.map((dashboard) => dashboard.id === mutation.artifactId ? { ...clone(mutation.definition), id: dashboard.id, revision: dashboard.revision + 1, updatedAt: createdAt } : dashboard) };
    }
  }
  const afterRevisions = Object.fromEntries(mutations.map((mutation) => [mutation.artifactId, findArtifact(next, mutation.kind, mutation.artifactId)!.revision]));
  const after = mutations.map((mutation) => snapshot(mutation.kind, findArtifact(next, mutation.kind, mutation.artifactId)!));
  const change: WorkspaceChange = { id: makeId("change"), label: label.trim() || "Workspace updated", author, createdAt, before, after, afterRevisions, undone: false };
  return { ok: true, workspace: { ...next, changeHistory: [...next.changeHistory, change] }, change };
}

export function canUndoWorkspaceChange(workspace: WorkspaceSnapshot, change: WorkspaceChange): boolean {
  const after = change.after ?? change.before;
  return !change.undone && after.length > 0 && after.every((state) => {
    const current = findArtifact(workspace, state.artifactType, state.artifact.id);
    return current !== undefined && current.revision === change.afterRevisions[state.artifact.id];
  });
}

export function undoLastWorkspaceChange(workspace: WorkspaceSnapshot, changeId?: string): WorkspaceChangeResult {
  const change = changeId ? workspace.changeHistory.find((item) => item.id === changeId) : workspace.changeHistory.findLast((item) => !item.undone);
  if (!change) return { ok: false, error: "artifact_not_found", artifactId: changeId ?? "latest" };
  const after = change.after ?? change.before;
  for (const state of after) {
    const current = findArtifact(workspace, state.artifactType, state.artifact.id);
    if (!current) return { ok: false, error: "artifact_not_found", artifactId: state.artifact.id };
    if (current.revision !== change.afterRevisions[state.artifact.id]) return { ok: false, error: "revision_conflict", artifactId: state.artifact.id, currentRevision: current.revision };
  }
  let next = workspace;
  const beforeIds = new Set(change.before.map((state) => state.artifact.id));
  const undoRevisions: Record<string, number | null> = {};
  for (const state of after) {
    if (!beforeIds.has(state.artifact.id)) {
      next = removeArtifact(next, state.artifactType, state.artifact.id);
      undoRevisions[state.artifact.id] = null;
    }
  }
  for (const before of change.before) {
    const revision = change.afterRevisions[before.artifact.id] + 1;
    next = replaceArtifact(next, before, revision);
    undoRevisions[before.artifact.id] = revision;
  }
  const undone = { ...change, undoRevisions, undone: true };
  next = { ...next, changeHistory: next.changeHistory.map((item) => item.id === change.id ? undone : item) };
  return { ok: true, workspace: next, change: undone };
}

export function redoWorkspaceChange(workspace: WorkspaceSnapshot, changeId: string): WorkspaceChangeResult {
  const change = workspace.changeHistory.find((item) => item.id === changeId);
  if (!change?.undone || !change.after || !change.undoRevisions) return { ok: false, error: "artifact_not_found", artifactId: changeId };
  for (const state of change.after) {
    const current = findArtifact(workspace, state.artifactType, state.artifact.id);
    const expected = change.undoRevisions[state.artifact.id];
    if (expected === null && current) return { ok: false, error: "revision_conflict", artifactId: state.artifact.id, currentRevision: current.revision };
    if (typeof expected === "number" && current?.revision !== expected) return { ok: false, error: current ? "revision_conflict" : "artifact_not_found", artifactId: state.artifact.id, currentRevision: current?.revision };
  }
  let next = workspace;
  const afterRevisions: Record<string, number> = {};
  for (const state of change.after) {
    const expected = change.undoRevisions[state.artifact.id];
    const revision = typeof expected === "number" ? expected + 1 : state.artifact.revision + 2;
    next = replaceArtifact(next, state, revision);
    afterRevisions[state.artifact.id] = revision;
  }
  const redone = { ...change, afterRevisions, undoRevisions: undefined, undone: false };
  next = { ...next, changeHistory: next.changeHistory.map((item) => item.id === change.id ? redone : item) };
  return { ok: true, workspace: next, change: redone };
}

export function renameArtifact(workspace: WorkspaceSnapshot, type: ArtifactType, id: string, title: string): WorkspaceSnapshot {
  const name = title.trim(); if (!name) return workspace;
  if (type === "document") return { ...workspace, documents: workspace.documents.map((item) => item.id === id ? { ...item, title: name, revision: item.revision + 1, updatedAt: now() } : item) };
  if (type === "sheet") return { ...workspace, sheets: workspace.sheets.map((item) => item.id === id ? { ...item, title: name, revision: item.revision + 1, updatedAt: now() } : item) };
  if (type === "planner") return { ...workspace, planners: workspace.planners.map((item) => item.id === id ? { ...item, title: name, revision: item.revision + 1, updatedAt: now() } : item) };
  if (type === "canvas") return { ...workspace, canvases: workspace.canvases.map((item) => item.id === id ? { ...item, title: name, revision: item.revision + 1, updatedAt: now() } : item) };
  return { ...workspace, dashboards: workspace.dashboards.map((item) => item.id === id ? { ...item, title: name, revision: item.revision + 1, updatedAt: now() } : item) };
}

export function duplicateArtifact(workspace: WorkspaceSnapshot, type: ArtifactType, id: string): WorkspaceSnapshot {
  const artifact = findArtifact(workspace, type, id); if (!artifact) return workspace;
  const copy = { ...clone(artifact), id: makeId(type), title: `${artifact.title} copy`, revision: 1, updatedAt: now() };
  if (type === "document") return { ...workspace, documents: [...workspace.documents, copy as WorkspaceDocument], activeDocumentId: copy.id };
  if (type === "sheet") return { ...workspace, sheets: [...workspace.sheets, copy as WorkspaceSheet], activeSheetId: copy.id };
  if (type === "planner") return { ...workspace, planners: [...workspace.planners, copy as WorkspacePlanner], activePlannerId: copy.id };
  if (type === "canvas") return { ...workspace, canvases: [...workspace.canvases, copy as WorkspaceCanvas], activeCanvasId: copy.id };
  const dashboard = copy as WorkspaceDashboard;
  const widgets = dashboard.widgets.map((widget) => ({ ...widget, id: makeId("widget") })) as DashboardWidget[];
  return { ...workspace, dashboards: [...workspace.dashboards, { ...dashboard, widgets }], activeDashboardId: copy.id };
}

export function moveArtifactToTrash(workspace: WorkspaceSnapshot, type: ArtifactType, id: string): WorkspaceSnapshot {
  const artifact = findArtifact(workspace, type, id); if (!artifact) return workspace;
  const trashed: TrashedArtifact = { ...snapshot(type, artifact), id: makeId("trash"), deletedAt: now() } as TrashedArtifact;
  if (type === "document") { const documents = workspace.documents.filter((item) => item.id !== id); return { ...workspace, documents, activeDocumentId: documents[0]?.id ?? "", trash: [...workspace.trash, trashed] }; }
  if (type === "sheet") { const sheets = workspace.sheets.filter((item) => item.id !== id); return { ...workspace, sheets, activeSheetId: sheets[0]?.id ?? null, trash: [...workspace.trash, trashed] }; }
  if (type === "planner") { const planners = workspace.planners.filter((item) => item.id !== id); return { ...workspace, planners, activePlannerId: planners[0]?.id ?? null, trash: [...workspace.trash, trashed] }; }
  if (type === "canvas") { const canvases = workspace.canvases.filter((item) => item.id !== id); return { ...workspace, canvases, activeCanvasId: canvases[0]?.id ?? null, trash: [...workspace.trash, trashed] }; }
  const dashboards = workspace.dashboards.filter((item) => item.id !== id); return { ...workspace, dashboards, activeDashboardId: dashboards[0]?.id ?? null, trash: [...workspace.trash, trashed] };
}

export function restoreTrashedArtifact(workspace: WorkspaceSnapshot, trashId: string): WorkspaceSnapshot {
  const item = workspace.trash.find((entry) => entry.id === trashId); if (!item) return workspace;
  const trash = workspace.trash.filter((entry) => entry.id !== trashId);
  if (item.artifactType === "document") return { ...workspace, documents: [...workspace.documents, item.artifact], activeDocumentId: item.artifact.id, trash };
  if (item.artifactType === "sheet") return { ...workspace, sheets: [...workspace.sheets, item.artifact], activeSheetId: item.artifact.id, trash };
  if (item.artifactType === "planner") return { ...workspace, planners: [...workspace.planners, item.artifact], activePlannerId: item.artifact.id, trash };
  if (item.artifactType === "canvas") return { ...workspace, canvases: [...workspace.canvases, item.artifact], activeCanvasId: item.artifact.id, trash };
  return { ...workspace, dashboards: [...workspace.dashboards, item.artifact], activeDashboardId: item.artifact.id, trash };
}

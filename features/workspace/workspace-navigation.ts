import type { WorkspaceView } from "@/features/session/session.types";
import type { ArtifactType, WorkspaceSnapshot } from "./workspace.types";

export const workspaceViews: WorkspaceView[] = ["documents", "sheets", "planner", "research", "canvas", "dashboard", "settings"];
export const viewForArtifact: Record<ArtifactType, WorkspaceView> = { document: "documents", sheet: "sheets", planner: "planner", canvas: "canvas", dashboard: "dashboard" };

export function workspaceItems(workspace: WorkspaceSnapshot, view: WorkspaceView): { id: string; title: string }[] {
  switch (view) {
    case "documents": return workspace.documents;
    case "sheets": return workspace.sheets;
    case "planner": return workspace.planners;
    case "canvas": return workspace.canvases;
    case "dashboard": return workspace.dashboards;
    case "research": return workspace.researchCollections.map((item) => ({ id: item.id, title: item.query }));
    default: return [];
  }
}

export function activeWorkspaceArtifact(workspace: WorkspaceSnapshot, view: WorkspaceView): string | null {
  return ({ documents: workspace.activeDocumentId, sheets: workspace.activeSheetId, planner: workspace.activePlannerId, canvas: workspace.activeCanvasId, dashboard: workspace.activeDashboardId, research: workspace.selectedResearchCollectionId, settings: null })[view] || null;
}

export function selectWorkspaceArtifact(workspace: WorkspaceSnapshot, view: WorkspaceView, id: string): WorkspaceSnapshot {
  if (!workspaceItems(workspace, view).some((item) => item.id === id)) return workspace;
  if (activeWorkspaceArtifact(workspace, view) === id) return workspace;
  switch (view) {
    case "documents": return { ...workspace, activeDocumentId: id };
    case "sheets": return { ...workspace, activeSheetId: id };
    case "planner": return { ...workspace, activePlannerId: id };
    case "canvas": return { ...workspace, activeCanvasId: id };
    case "dashboard": return { ...workspace, activeDashboardId: id };
    case "research": return { ...workspace, selectedResearchCollectionId: id, selectedSourceId: workspace.researchCollections.find((item) => item.id === id)?.sourceIds[0] ?? null };
    default: return workspace;
  }
}

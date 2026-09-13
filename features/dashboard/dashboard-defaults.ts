import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import type { DashboardSource, DashboardWidget } from "./dashboard.types";
import { suggestedSheetWidgets } from "./dashboard-suggestions";
import { sourceVersion } from "./dashboard-selectors";

export function defaultDashboardWidgets(workspace: WorkspaceSnapshot, sources: DashboardSource[]): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  for (const source of sources) {
    if (source.kind === "sheet") {
      const sheet = workspace.sheets.find(item => item.id === source.id);
      if (sheet) widgets.push(...suggestedSheetWidgets(sheet));
    } else if (source.kind === "planner") {
      const planner = workspace.planners.find(item => item.id === source.id);
      if (!planner) continue;
      widgets.push(
        { id: crypto.randomUUID(), type: "progress", title: `${planner.title} progress`, size: "compact", order: 0, color: "#0f766e", binding: { kind: "task_progress", plannerIds: [planner.id] } },
        { id: crypto.randomUUID(), type: "task_list", title: `${planner.title} remaining tasks`, size: "wide", order: 0, color: "#2563eb", binding: { kind: "task_list", plannerIds: [planner.id], filter: "remaining" } },
      );
    } else {
      const artifact = source.kind === "document" ? workspace.documents.find(item => item.id === source.id) : workspace.researchCollections.find(item => item.id === source.id);
      const version = sourceVersion(workspace, source);
      if (!artifact || !version) continue;
      const text = "content" in artifact ? artifact.content : artifact.summary;
      const title = "title" in artifact ? artifact.title : artifact.query;
      widgets.push({ id: crypto.randomUUID(), type: "summary", title, size: "wide", order: 0, color: "#9333ea", binding: { kind: "source_summary", source, text: text ?? "", sourceVersion: version, ...(source.kind === "research" && "sourceIds" in artifact ? { citations: artifact.sourceIds.map(id => workspace.sources.find(item => item.id === id)?.url).filter((url): url is string => Boolean(url)) } : {}) } });
    }
  }
  return widgets.map((widget, order) => ({ ...widget, order }));
}

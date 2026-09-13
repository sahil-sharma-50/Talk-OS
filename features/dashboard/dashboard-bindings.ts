import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import type { DashboardBinding, DashboardSource, WorkspaceDashboard } from "./dashboard.types";

export type DashboardValidation = { ok: true } | { ok: false; error: "too_many_sources" | "too_many_widgets" | "duplicate_widget_id" | "duplicate_source" | "invalid_source" | "unselected_source" | "invalid_widget"; detail: string };

const sourceKey = (source: DashboardSource) => `${source.kind}:${source.id}`;
const sourceExists = (workspace: WorkspaceSnapshot, source: DashboardSource) => source.kind === "document" ? workspace.documents.some((item) => item.id === source.id)
  : source.kind === "sheet" ? workspace.sheets.some((item) => item.id === source.id)
  : source.kind === "planner" ? workspace.planners.some((item) => item.id === source.id)
  : workspace.researchCollections.some((item) => item.id === source.id);

function bindingSources(binding: DashboardBinding): DashboardSource[] {
  if (binding.kind === "task_progress" || binding.kind === "task_count" || binding.kind === "task_list") return binding.plannerIds.map((id) => ({ kind: "planner", id }));
  if (binding.kind === "sheet_sum" || binding.kind === "budget" || binding.kind === "category_sum") return [{ kind: "sheet", id: binding.sheetId }];
  if (binding.kind === "source_summary") return [binding.source];
  return [];
}

export function validateDashboard(workspace: WorkspaceSnapshot, dashboard: WorkspaceDashboard): DashboardValidation {
  if (dashboard.sources.length > 50) return { ok: false, error: "too_many_sources", detail: "A dashboard supports at most 50 sources." };
  if (dashboard.widgets.length > 50) return { ok: false, error: "too_many_widgets", detail: "A dashboard supports at most 50 widgets." };
  const sourceKeys = dashboard.sources.map(sourceKey);
  if (new Set(sourceKeys).size !== sourceKeys.length) return { ok: false, error: "duplicate_source", detail: "Each source may be selected once." };
  const invalidSource = dashboard.sources.find((source) => !sourceExists(workspace, source));
  if (invalidSource) return { ok: false, error: "invalid_source", detail: `${sourceKey(invalidSource)} does not exist.` };
  const ids = dashboard.widgets.map((widget) => widget.id);
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) return { ok: false, error: "duplicate_widget_id", detail: "Widget ids must be nonempty and unique." };
  if (dashboard.widgets.some((widget) => !widget.title.trim() || !["compact", "wide"].includes(widget.size) || !Number.isInteger(widget.order))) return { ok: false, error: "invalid_widget", detail: "Every widget needs a title, size, and integer order." };
  const selected = new Set(sourceKeys);
  const unselected = dashboard.widgets.flatMap((widget) => bindingSources(widget.binding)).find((source) => !selected.has(sourceKey(source)));
  if (unselected) return { ok: false, error: "unselected_source", detail: `${sourceKey(unselected)} is not selected for this dashboard.` };
  return { ok: true };
}

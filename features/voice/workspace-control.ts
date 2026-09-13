import type { WorkspaceView } from "@/features/session/session.types";
import { activeWorkspaceArtifact, selectWorkspaceArtifact, workspaceItems, workspaceViews } from "@/features/workspace/workspace-navigation";
import type { ResearchToolCall, ResearchToolExecution, WorkspaceRuntime } from "./research-tools";

export const workspaceControlTools = [{
  type: "function" as const, name: "open_workspace", execution_mode: "interactive" as const, timeout_seconds: 20,
  description: "Actually open any workspace tab without creating or editing files. Optionally select an exact file id or title. Always call this when asked to open/switch/show a tab or file; do not claim navigation without a successful result.",
  parameters: { type: "object", properties: {
    view: { type: "string", enum: workspaceViews },
    artifact_id: { type: "string", description: "Optional file or research collection id from get_workspace." },
    artifact_title: { type: "string", description: "Optional exact file title; duplicate matches return a clarification." },
    document_mode: { type: "string", enum: ["source", "preview"], description: "Documents only: show editable Markdown or formatted preview." },
    section_heading: { type: "string", description: "Documents preview only: scroll to this exact heading." },
  }, required: ["view"] },
}];

export function executeWorkspaceControl(call: ResearchToolCall, runtime: WorkspaceRuntime): ResearchToolExecution | null {
  if (call.name !== "open_workspace") return null;
  const reply = (value: Record<string, unknown>, error?: string): ResearchToolExecution => ({ result: { ...value, ...(error ? { error } : {}) }, ...(error ? { isError: true } : {}), events: [{ type: error ? "ACTION_FAILED" : "ACTION_COMPLETED", actionId: call.call_id, detail: error ?? String(value.message ?? "Workspace opened"), at: new Date().toISOString() }] });
  const view = call.arguments.view as WorkspaceView;
  if (!workspaceViews.includes(view)) return reply({ available_views: workspaceViews }, "invalid_workspace_view");
  if (!runtime.setActiveView) return reply({}, "workspace_navigation_unavailable");
  const workspace = runtime.getWorkspace();
  const items = workspaceItems(workspace, view);
  const idAliases = { documents: "document_id", sheets: "sheet_id", planner: "planner_id", canvas: "canvas_id", dashboard: "dashboard_id", research: "collection_id", settings: "" };
  const suppliedIds = [call.arguments.artifact_id, call.arguments[idAliases[view]]].filter((value): value is string => typeof value === "string" && Boolean(value));
  if (new Set(suppliedIds).size > 1) return reply({}, "conflicting_artifact_ids");
  const id = suppliedIds[0] ?? "";
  const title = typeof call.arguments.artifact_title === "string" ? call.arguments.artifact_title.trim().toLocaleLowerCase() : "";
  const matches = id ? items.filter((item) => item.id === id) : title ? items.filter((item) => item.title.toLocaleLowerCase() === title) : [];
  if ((id || title) && !matches.length) return reply({ available_files: items }, "artifact_not_found_in_workspace");
  if (matches.length > 1) return reply({ status: "needs_clarification", question: "More than one file has that title. Which one should I open?", matches, message: "Waiting for a file choice" });
  const selected = matches[0];
  if (call.arguments.document_mode !== undefined && (view !== "documents" || !["source", "preview"].includes(String(call.arguments.document_mode)))) return reply({}, "invalid_document_view");
  if (selected) {
    const next = selectWorkspaceArtifact(workspace, view, selected.id);
    if (next !== workspace) runtime.setWorkspace(next);
  }
  if (view === "documents" && (call.arguments.document_mode !== undefined || typeof call.arguments.section_heading === "string")) {
    const current = runtime.getWorkspace();
    const documentId = activeWorkspaceArtifact(current, view);
    if (!documentId) return reply({}, "document_not_found");
    runtime.setWorkspace({ ...current, documentView: { documentId, mode: call.arguments.document_mode === "source" ? "source" : "preview", section: typeof call.arguments.section_heading === "string" ? call.arguments.section_heading : undefined, requestId: crypto.randomUUID() } });
  }
  runtime.setActiveView(view);
  if (runtime.getContext && runtime.getContext().activeView !== view) return reply({}, "workspace_navigation_not_applied");
  return reply({ active_view: view, active_artifact_id: activeWorkspaceArtifact(runtime.getWorkspace(), view), message: `Opened ${selected?.title || view}` });
}

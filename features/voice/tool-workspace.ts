import type { WorkspaceView } from "@/features/session/session.types";

type AgentWorkspace = Exclude<WorkspaceView, "settings">;

const toolViews: Record<string, AgentWorkspace> = {
  create_document: "documents",
  edit_document: "documents",
  format_document: "documents",
  save_document: "documents",
  insert_document_content: "documents",
  embed_canvas_in_document: "documents",
  embed_sheet_in_document: "documents",
  read_document: "documents",
  export_document: "documents",
  create_sheet: "sheets",
  update_sheet: "sheets",
  format_sheet: "sheets",
  insert_sheet_rows: "sheets",
  read_sheet: "sheets",
  create_planner: "planner",
  update_planner: "planner",
  read_planner: "planner",
  create_canvas: "canvas",
  read_canvas: "canvas",
  edit_canvas: "canvas",
  arrange_canvas: "canvas",
  create_dashboard: "dashboard",
  create_sheet_dashboard: "dashboard",
  read_dashboard: "dashboard",
  edit_dashboard: "dashboard",
  search_web: "research",
  read_sources: "research",
  summarize_research: "research",
};

export function workspaceForTool(toolName: string): AgentWorkspace | null {
  return toolViews[toolName] ?? null;
}

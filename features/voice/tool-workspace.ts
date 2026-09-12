import type { WorkspaceView } from "@/features/session/session.types";

type AgentWorkspace = Exclude<WorkspaceView, "settings">;

const toolViews: Record<string, AgentWorkspace> = {
  create_document: "documents",
  edit_document: "documents",
  read_document: "documents",
  export_document: "documents",
  create_sheet: "sheets",
  update_sheet: "sheets",
  read_sheet: "sheets",
  create_planner: "planner",
  update_planner: "planner",
  read_planner: "planner",
  search_web: "research",
  read_sources: "research",
  summarize_research: "research",
};

export function workspaceForTool(toolName: string): AgentWorkspace | null {
  return toolViews[toolName] ?? null;
}

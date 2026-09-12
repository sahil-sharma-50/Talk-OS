import { describe, expect, it, vi } from "vitest";
import { createWorkspace } from "@/features/workspace/workspace-model";
import type { WorkspaceRuntime } from "./research-tools";
import { executeResearchTool, workspaceTools } from "./research-tools";

function createRuntime(apiKey = "") {
  let workspace = createWorkspace();
  const setActiveView = vi.fn();
  const runtime: WorkspaceRuntime = {
    getWorkspace: () => workspace,
    setWorkspace: (next) => { workspace = next; },
    getTavilyApiKey: () => apiKey,
    setActiveView,
  };
  return { runtime, workspace: () => workspace, setActiveView };
}

describe("TalkOS AssemblyAI client tools", () => {
  it("declares generic workspace, research, and editing tools", () => {
    expect(workspaceTools.map((tool) => tool.name)).toEqual([
      "get_workspace", "read_document", "create_document", "edit_document",
      "create_sheet", "read_sheet", "update_sheet", "create_planner", "read_planner", "update_planner",
      "apply_workspace_changes", "undo_change", "update_task", "search_web", "read_sources",
      "summarize_research", "export_document",
    ]);
  });

  it("creates a sheet and planner and opens the tool that changed", async () => {
    const { runtime, workspace, setActiveView } = createRuntime();
    await executeResearchTool({ type: "tool.call", call_id: "sheet", name: "create_sheet", arguments: { title: "Event budget", cells: { A1: "Guests", B1: 20 } } }, runtime);
    await executeResearchTool({ type: "tool.call", call_id: "planner", name: "create_planner", arguments: { title: "Event plan", tasks: [{ title: "Book venue", due_date: "2026-09-18" }] } }, runtime);
    expect(workspace().sheets[0].cells.B1.value).toBe(20);
    expect(workspace().planners[0].tasks[0]).toMatchObject({ title: "Book venue", dueDate: "2026-09-18" });
    expect(setActiveView).toHaveBeenNthCalledWith(1, "sheets");
    expect(setActiveView).toHaveBeenNthCalledWith(2, "planner");
  });

  it("applies coordinated edits and returns one undo receipt", async () => {
    const { runtime, workspace } = createRuntime();
    await executeResearchTool({ type: "tool.call", call_id: "sheet", name: "create_sheet", arguments: { title: "Budget" } }, runtime);
    const execution = await executeResearchTool({ type: "tool.call", call_id: "batch", name: "apply_workspace_changes", arguments: {
      label: "Adjust for 30 guests",
      changes: [
        { kind: "document", artifact_id: workspace().documents[0].id, expected_revision: 1, content: "30 guests" },
        { kind: "sheet", artifact_id: workspace().sheets[0].id, expected_revision: 1, cells: { A1: "Guests", B1: 30 } },
      ],
    } }, runtime);
    expect(execution.result).toMatchObject({ changed_artifact_ids: expect.arrayContaining([workspace().documents[0].id, workspace().sheets[0].id]) });
    expect(workspace().changeHistory).toHaveLength(1);
  });

  it("reads the active user document", async () => {
    const { runtime, workspace } = createRuntime();
    const execution = await executeResearchTool({ type: "tool.call", call_id: "call-1", name: "read_document", arguments: {} }, runtime);
    expect(execution.result).toMatchObject({ id: workspace().activeDocumentId, title: "Project notes", revision: 1 });
  });

  it("edits documents with optimistic revision safety", async () => {
    const { runtime, workspace } = createRuntime();
    const id = workspace().activeDocumentId;
    const execution = await executeResearchTool({ type: "tool.call", call_id: "call-2", name: "edit_document", arguments: { document_id: id, expected_revision: 1, content: "A researched brief." } }, runtime);
    expect(execution.isError).toBeUndefined();
    expect(workspace().documents[0]).toMatchObject({ content: "A researched brief.", revision: 2 });
  });

  it("stores real web search results in the workspace", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Official source", url: "https://example.com", content: "Evidence" }] }), { status: 200 })));
    const { runtime, workspace } = createRuntime("tvly-test");
    const execution = await executeResearchTool({ type: "tool.call", call_id: "call-3", name: "search_web", arguments: { query: "a focused query" } }, runtime);
    expect(execution.result.sources).toHaveLength(1);
    expect(workspace().sources[0]).toMatchObject({ title: "Official source", url: "https://example.com", snippet: "Evidence" });
    expect(workspace().researchCollections[0]).toMatchObject({ query: "a focused query", sourceIds: [workspace().sources[0].id] });
    vi.unstubAllGlobals();
  });

  it("does not commit research results after interruption", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { controller.abort(); return new Response(JSON.stringify({ results: [{ title: "Late", url: "https://example.com/late", content: "Old request" }] }), { status: 200 }); }));
    const { runtime, workspace } = createRuntime("tvly-test");
    const execution = await executeResearchTool({ type: "tool.call", call_id: "late", name: "search_web", arguments: { query: "old request" } }, runtime, controller.signal);
    expect(execution).toMatchObject({ isError: true, result: { error: "interrupted" } });
    expect(workspace().sources).toHaveLength(0);
  });
});

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
  it("rejects malformed writes without erasing existing work", async () => {
    const { runtime, workspace } = createRuntime();
    const before = workspace();
    const edit = await executeResearchTool({ type: "tool.call", call_id: "bad", name: "edit_document", arguments: { document_id: before.activeDocumentId, expected_revision: 1 } }, runtime);
    expect(edit.isError).toBe(true);
    expect(workspace()).toEqual(before);
    const sheet = await executeResearchTool({ type: "tool.call", call_id: "bad-sheet", name: "create_sheet", arguments: { title: "Invalid", cells: { AA1001: 2 } } }, runtime);
    expect(sheet.isError).toBe(true);
    const planner = await executeResearchTool({ type: "tool.call", call_id: "bad-planner", name: "create_planner", arguments: { title: "Invalid", tasks: [{ title: "Task", starts_at: "bad date" }] } }, runtime);
    expect(planner.isError).toBe(true);
  });

  it("preserves concurrent artifact creations", async () => {
    const { runtime, workspace } = createRuntime();
    await Promise.all(["One", "Two"].map((title) => executeResearchTool({ type: "tool.call", call_id: title, name: "create_document", arguments: { title, content: title } }, runtime)));
    expect(workspace().documents.map((item) => item.title)).toEqual(["Project notes", "One", "Two"]);
  });
  it("declares generic workspace, research, and editing tools", () => {
    expect(workspaceTools.map((tool) => tool.name)).toEqual([
      "open_workspace", "manage_artifact", "save_document", "redo_change", "control_activity",
      "get_workspace", "read_document", "create_document", "edit_document",
      "create_sheet", "read_sheet", "update_sheet", "create_planner", "read_planner", "update_planner",
      "format_document", "format_sheet", "insert_sheet_rows", "rename_artifact",
      "insert_document_content", "embed_canvas_in_document", "embed_sheet_in_document",
      "create_canvas", "read_canvas", "edit_canvas", "arrange_canvas",
      "create_sheet_dashboard", "create_dashboard", "read_dashboard", "edit_dashboard",
      "apply_workspace_changes", "undo_change", "update_task", "search_web", "read_sources",
      "summarize_research", "export_document",
    ]);
  });

  it("creates, reads, and edits a semantic canvas", async () => {
    const { runtime, workspace, setActiveView } = createRuntime();
    const created = await executeResearchTool({ type: "tool.call", call_id: "canvas-create", name: "create_canvas", arguments: {
      title: "Login flow",
      operations: [
        { op: "add_node", id: "login", role: "process", text: "Log in", x: 80, y: 120 },
        { op: "add_node", id: "result", role: "decision", text: "Accepted?", x: 360, y: 120 },
        { op: "connect", id: "login-result", sourceId: "login", targetId: "result", label: "Submit" },
      ],
    } }, runtime);

    const canvasId = String(created.result.canvas_id);
    const read = await executeResearchTool({ type: "tool.call", call_id: "canvas-read", name: "read_canvas", arguments: { canvas_id: canvasId } }, runtime);
    const edited = await executeResearchTool({ type: "tool.call", call_id: "canvas-edit", name: "edit_canvas", arguments: {
      canvas_id: canvasId,
      expected_revision: 1,
      operations: [{ op: "set_text", id: "result", text: "Login accepted?" }],
    } }, runtime);

    expect(read.result).toMatchObject({ id: canvasId, title: "Login flow", revision: 1 });
    expect(read.result.elements).toHaveLength(3);
    expect(edited.result).toMatchObject({ canvas_id: canvasId, revision: 2 });
    expect(workspace().canvases[0].elements.find((element) => element.id === "result")?.text).toBe("Login accepted?");
    expect(setActiveView).toHaveBeenCalledWith("canvas");
  });

  it("declares the discriminator and fields for every canvas operation", () => {
    const createCanvas = workspaceTools.find((tool) => tool.name === "create_canvas");
    const parameters = createCanvas?.parameters as {
      properties?: { operations?: { items?: { oneOf?: Array<{ required?: string[] }> } } };
    };
    const variants = parameters.properties?.operations?.items?.oneOf;

    expect(variants).toBeDefined();
    expect(variants).toEqual(expect.arrayContaining([
      expect.objectContaining({ required: expect.arrayContaining(["op", "id", "role", "text", "x", "y"]) }),
      expect.objectContaining({ required: expect.arrayContaining(["op", "id", "sourceId", "targetId"]) }),
    ]));
  });

  it("normalizes unambiguous canvas operations when the provider omits op", async () => {
    const { runtime, workspace } = createRuntime();
    const created = await executeResearchTool({ type: "tool.call", call_id: "canvas-provider-shape", name: "create_canvas", arguments: {
      title: "User Signup Flow",
      operations: [
        { id: "step1", role: "process", text: "User Signs Up", x: 0, y: 0 },
        { id: "step2", role: "process", text: "Verify Email", x: 300, y: 0 },
        { id: "step3", role: "process", text: "Reach Dashboard", x: 600, y: 0 },
        { id: "arrow1", sourceId: "step1", targetId: "step2" },
        { id: "arrow2", sourceId: "step2", targetId: "step3" },
      ],
    } }, runtime);

    expect(created.isError).not.toBe(true);
    expect(workspace().canvases[0].elements.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: "step1", type: "process" },
      { id: "step2", type: "process" },
      { id: "step3", type: "process" },
      { id: "arrow1", type: "arrow" },
      { id: "arrow2", type: "arrow" },
    ]);
  });

  it("does not commit a canvas edit after interruption", async () => {
    const { runtime, workspace } = createRuntime();
    await executeResearchTool({ type: "tool.call", call_id: "canvas-create", name: "create_canvas", arguments: { title: "Draft" } }, runtime);
    const controller = new AbortController();
    controller.abort();
    const execution = await executeResearchTool({ type: "tool.call", call_id: "canvas-edit", name: "edit_canvas", arguments: {
      canvas_id: workspace().activeCanvasId,
      expected_revision: 1,
      operations: [{ op: "add_node", id: "late", role: "sticky", text: "Stale", x: 0, y: 0 }],
    } }, runtime, controller.signal);
    expect(execution).toMatchObject({ isError: true, result: { error: "interrupted" } });
    expect(workspace().canvases[0].elements).toHaveLength(0);
  });

  it("creates and reads a dashboard bound to explicit sources", async () => {
    const { runtime, workspace, setActiveView } = createRuntime();
    await executeResearchTool({ type: "tool.call", call_id: "planner", name: "create_planner", arguments: { title: "Launch", tasks: [{ id: "one", title: "Done", completed: true }, { id: "two", title: "Next" }] } }, runtime);
    const plannerId = workspace().planners[0].id;
    const created = await executeResearchTool({ type: "tool.call", call_id: "dashboard", name: "create_dashboard", arguments: {
      title: "Launch dashboard", sources: [{ kind: "planner", id: plannerId }], widgets: [{ id: "progress", type: "progress", title: "Progress", size: "compact", order: 0, binding: { kind: "task_progress", plannerIds: [plannerId] } }],
    } }, runtime);
    const dashboardId = String(created.result.dashboard_id);
    const read = await executeResearchTool({ type: "tool.call", call_id: "read-dashboard", name: "read_dashboard", arguments: { dashboard_id: dashboardId } }, runtime);
    expect(read.result).toMatchObject({ id: dashboardId, title: "Launch dashboard", revision: 1, resolved_widgets: [{ id: "progress", state: { status: "ready", value: { percent: 50 } } }] });
    expect(setActiveView).toHaveBeenCalledWith("dashboard");
  });

  it("revision-checks dashboard edits and makes them undoable", async () => {
    const { runtime, workspace } = createRuntime();
    const created = await executeResearchTool({ type: "tool.call", call_id: "dashboard", name: "create_dashboard", arguments: { title: "Launch", sources: [], widgets: [] } }, runtime);
    const id = String(created.result.dashboard_id);
    const edited = await executeResearchTool({ type: "tool.call", call_id: "edit-dashboard", name: "edit_dashboard", arguments: { dashboard_id: id, expected_revision: 1, title: "Launch health", launch_date: "2026-09-30" } }, runtime);
    const stale = await executeResearchTool({ type: "tool.call", call_id: "stale-dashboard", name: "edit_dashboard", arguments: { dashboard_id: id, expected_revision: 1, title: "Stale" } }, runtime);
    expect(edited.result).toMatchObject({ dashboard_id: id, revision: 2, change_id: expect.any(String) });
    expect(workspace().dashboards[0].title).toBe("Launch health");
    expect(stale).toMatchObject({ isError: true, result: { error: "revision_conflict", current_revision: 2 } });
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

  it("preserves planner blocker and risk metadata unless explicitly changed", async () => {
    const { runtime, workspace } = createRuntime();
    await executeResearchTool({ type: "tool.call", call_id: "planner", name: "create_planner", arguments: { title: "Launch", tasks: [{ id: "ship", title: "Ship", blocked_reason: "Approval", risk_level: "high" }] } }, runtime);
    const planner = workspace().planners[0];
    await executeResearchTool({ type: "tool.call", call_id: "update", name: "update_planner", arguments: { planner_id: planner.id, expected_revision: 1, tasks: [{ id: "ship", title: "Ship it", completed: false }] } }, runtime);
    expect(workspace().planners[0].tasks[0]).toMatchObject({ title: "Ship it", blockedReason: "Approval", riskLevel: "high" });
    await executeResearchTool({ type: "tool.call", call_id: "clear", name: "update_planner", arguments: { planner_id: planner.id, expected_revision: 2, tasks: [{ id: "ship", title: "Ship it", blocked_reason: "", risk_level: null }] } }, runtime);
    expect(workspace().planners[0].tasks[0].blockedReason).toBeUndefined();
    expect(workspace().planners[0].tasks[0].riskLevel).toBeUndefined();
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

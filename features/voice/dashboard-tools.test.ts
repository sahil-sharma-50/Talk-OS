import { describe, expect, it, vi } from "vitest";
import { createPlanner, createSheet, createWorkspace } from "@/features/workspace/workspace-model";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";

function setup() {
  let workspace = createPlanner(createSheet(createWorkspace(), "Revenue", { A1: { value: "Region" }, B1: { value: "Revenue" }, A2: { value: "North" }, B2: { value: 30 }, A3: { value: "South" }, B3: { value: 50 } }), "Launch", [{ id: "one", title: "Prepare", completed: true }, { id: "two", title: "Ship", completed: false }]);
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: vi.fn() };
  const sources = [{ kind: "sheet", id: workspace.activeSheetId }, { kind: "planner", id: workspace.activePlannerId }];
  return { runtime, sources, workspace: () => workspace, call: (args: Record<string, unknown>) => executeResearchTool({ type: "tool.call", call_id: crypto.randomUUID(), name: "create_dashboard", arguments: args }, runtime) };
}

describe("voice dashboard creation", () => {
  it("accepts the planner task-list call from the failed session when the filter is omitted", async () => {
    const app = setup();
    const result = await app.call({ title: "Task Overview Dashboard", sources: [app.sources[1]], widgets: [{
      id: "planner_tasks", type: "task_list", title: "My Tasks", size: "wide", order: 0, color: "0000FF",
      layout: { height: 400, width: 100, x: 0, y: 0 }, binding: { kind: "task_list", plannerId: app.sources[1].id },
    }] });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().dashboards[0].widgets[0].binding).toEqual({ kind: "task_list", plannerIds: [app.sources[1].id], filter: "remaining" });
    expect(result.result.resolved_widgets).toEqual([expect.objectContaining({ state: expect.objectContaining({ status: "ready", value: [{ plannerTitle: "Launch", task: { id: "two", title: "Ship", completed: false } }] }) })]);
    expect(app.runtime.setActiveView).toHaveBeenLastCalledWith("dashboard");
  });

  it("resolves the failed sheet chart's column-based binding from real sheet metadata", async () => {
    const app = setup();
    const result = await app.call({ title: "Revenue dashboard", sources: [app.sources[0]], widgets: [{
      id: "by_region", type: "bar_chart", title: "Revenue by Region", size: "wide", order: 0,
      binding: { kind: "category_sum", sheetId: app.sources[0].id, category_column: "A", measure_columns: ["B"] },
    }] });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().dashboards[0].widgets[0].binding).toEqual({ kind: "category_sum", sheetId: app.sources[0].id, categoryRange: "A2:A3", amountRange: "B2:B3", currency: "" });
    expect(result.result.resolved_widgets).toEqual([expect.objectContaining({ state: expect.objectContaining({ status: "ready", value: [{ label: "North", value: 30 }, { label: "South", value: 50 }] }) })]);
  });

  it("keeps invalid explicit filters and ambiguous measures as errors with precise correction details", async () => {
    const app = setup(); const before = app.workspace();
    const result = await app.call({ title: "Invalid", sources: app.sources, widgets: [
      { id: "tasks", type: "task_list", title: "Tasks", size: "wide", order: 0, binding: { kind: "task_list", plannerIds: [app.sources[1].id], filter: "invented" } },
      { id: "chart", type: "bar_chart", title: "Revenue", size: "wide", order: 1, binding: { kind: "category_sum", sheetId: app.sources[0].id, category_column: "A", measure_columns: ["A", "B"] } },
    ] });
    expect(result.isError).toBe(true);
    expect(result.result.widget_errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "widgets[0].binding.filter", reason: expect.stringContaining("remaining") }),
      expect.objectContaining({ path: "widgets[1].binding.measure_columns", reason: expect.stringContaining("one numeric column") }),
    ]));
    expect(app.workspace()).toBe(before);
    expect(app.runtime.setActiveView).not.toHaveBeenCalled();
  });

  it("builds a live overview from all three planners without requiring a sheet", async () => {
    const app = setup();
    app.runtime.setWorkspace(createPlanner(createPlanner(app.workspace(), "Marketing", [{id:"marketing",title:"Publish",completed:false}]), "Shopping", [{id:"shopping",title:"Buy milk",completed:true}]));
    const sources = app.workspace().planners.map(planner => ({ kind: "planner", id: planner.id }));
    const result = await app.call({ title: "Three planners", sources });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().dashboards[0].sources).toEqual(sources);
    expect(result.result.resolved_widgets).toHaveLength(6);
    expect((result.result.resolved_widgets as Array<{state:{value?:{percent?:number}}}>).filter(widget=>typeof widget.state.value?.percent==='number').map(widget=>widget.state.value!.percent)).toEqual([50, 0, 100]);
    expect(app.runtime.setActiveView).toHaveBeenLastCalledWith("dashboard");
  });

  it("keeps explicit range errors visible instead of silently replacing them with inferred columns", async () => {
    const app = setup(); const before = app.workspace();
    const result = await app.call({ title: "Invalid range", sources: [app.sources[0]], widgets: [{
      id: "chart", type: "bar_chart", title: "Revenue", size: "wide", order: 0,
      binding: { kind: "category_sum", sheetId: app.sources[0].id, category_column: "A", measure_columns: ["B"], categoryRange: "ZZ2:ZZ3", amountRange: "B2:B3" },
    }] });
    expect(result.result.error).toBe("invalid_dashboard_bindings");
    expect(app.workspace()).toBe(before);
  });

  it("uses the same defaults for revision-safe edits and still rejects stale edits", async () => {
    const app = setup();
    await app.call({ title: "Overview", sources: [app.sources[1]] });
    const dashboard = app.workspace().dashboards[0];
    const args = { dashboard_id: dashboard.id, expected_revision: dashboard.revision, widgets: [{ id: "tasks", title: "Tasks", type: "task_list", size: "wide", order: 0, binding: {kind:"task_list",plannerId:app.sources[1].id} }] };
    const call = () => executeResearchTool({type:"tool.call",call_id:crypto.randomUUID(),name:"edit_dashboard",arguments:args},app.runtime);
    expect((await call()).isError).not.toBe(true);
    expect(app.workspace().dashboards[0].widgets[0].binding).toMatchObject({filter:"remaining"});
    const changed = app.workspace();
    expect((await call()).result.error).toBe("revision_conflict");
    expect(app.workspace()).toBe(changed);
  });

  it("handles the color, height and planner-binding variants emitted in the live failing call", async () => {
    const app = setup();
    const result = await app.call({ title: "Workspace Overview", sources: app.sources, widgets: [
      { id: "revenue", type: "metric", title: "Revenue", size: "compact", order: 0, color: "00FF00", layout: { x: 0, y: 0, width: 45, height: 150 }, binding: { kind: "sheet_sum", sheetId: app.sources[0].id, range: "B2:B3" } },
      { id: "progress", type: "progress", title: "Task progress", size: "compact", order: 1, color: "0000FF", layout: { x: 50, y: 0, width: 45, height: 150 }, binding: { kind: "planner_progress", plannerId: app.sources[1].id } },
    ] });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().dashboards[0].widgets[1]).toMatchObject({ color: "#0000FF", layout: { height: 180 }, binding: { kind: "task_progress", plannerIds: [app.sources[1].id] } });
    expect(result.result.resolved_widgets).toEqual(expect.arrayContaining([expect.objectContaining({ state: expect.objectContaining({ status: "ready", value: expect.objectContaining({ amount: 80 }) }) }), expect.objectContaining({ state: expect.objectContaining({ status: "ready", value: expect.objectContaining({ percent: 50 }) }) })]));
    expect(app.runtime.setActiveView).toHaveBeenLastCalledWith("dashboard");
  });

  it("builds source-backed widgets when the agent omits custom widget JSON", async () => {
    const app = setup();
    const result = await app.call({ title: "Overview", sources: app.sources });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().dashboards[0].widgets.map(widget => widget.binding.kind)).toEqual(expect.arrayContaining(["sheet_sum", "category_sum", "task_progress", "task_list"]));
    expect(app.workspace().dashboards[0].sources).toEqual(app.sources);
    expect(JSON.stringify(result.result.resolved_widgets)).not.toContain('"status":"invalid"');
  });

  it("reports the exact invalid widget without saving a broken dashboard", async () => {
    const app = setup(); const before = app.workspace();
    const result = await app.call({ title: "Broken", sources: app.sources, widgets: [{ id: "bad", type: "metric", title: "Revenue", size: "compact", order: 0, binding: { kind: "sheet_sum", sheetId: app.sources[0].id, range: "ZZ2:ZZ8" } }] });
    expect(result.isError).toBe(true);
    expect(result.result.widget_errors).toEqual(expect.arrayContaining([expect.objectContaining({ widget_id: "bad", title: "Revenue", reason: expect.any(String) })]));
    expect(app.workspace()).toBe(before);
  });

  it("does not infer permission for a source outside the selected set", async () => {
    const app = setup();
    const result = await app.call({ title: "Wrong source", sources: [app.sources[0]], widgets: [{ id: "progress", type: "progress", title: "Progress", size: "compact", order: 0, binding: { kind: "planner_progress", plannerId: app.sources[1].id } }] });
    expect(result.result.error).toBe("unselected_source");
    expect(app.workspace().dashboards).toHaveLength(0);
  });
});

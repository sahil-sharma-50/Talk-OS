import { describe, expect, it, vi } from "vitest";
import { createSheet, createWorkspace } from "@/features/workspace/workspace-model";
import type { WorkspaceView } from "@/features/session/session.types";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";

function setup() {
  let workspace = createSheet(createSheet(createWorkspace(), "Sales"), "Costs");
  let view: WorkspaceView = "documents";
  const runtime: WorkspaceRuntime = {
    getWorkspace: () => workspace,
    setWorkspace: (next) => { workspace = next; },
    getContext: () => ({ activeView: view, selection: null }),
    setActiveView: vi.fn((next) => { view = next; }),
    getTavilyApiKey: () => "",
  };
  const call = (args: Record<string, unknown>, signal?: AbortSignal) => executeResearchTool({ type: "tool.call", call_id: "navigate", name: "open_workspace", arguments: args }, runtime, signal);
  return { runtime, call, workspace: () => workspace, view: () => view };
}

describe("voice workspace navigation", () => {
  it.each(["documents", "sheets", "planner", "research", "canvas", "dashboard", "settings"])("opens %s without creating any files", async (view) => {
    const app = setup(); const before = app.workspace();
    const result = await app.call({ view });
    expect(result.isError).not.toBe(true);
    expect(app.view()).toBe(view);
    expect(result.result).toMatchObject({ active_view: view });
    expect(app.workspace()).toEqual(before);
  });

  it("selects the named file and makes it immediately available as context", async () => {
    const app = setup();
    const result = await app.call({ view: "sheets", artifact_title: "sales" });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().activeSheetId).toBe(app.workspace().sheets[0].id);
    const read = await executeResearchTool({ type: "tool.call", call_id: "context", name: "get_workspace", arguments: {} }, app.runtime);
    expect(read.result.context).toMatchObject({ activeView: "sheets" });
    expect(read.result.active_sheet_id).toBe(app.workspace().sheets[0].id);
  });

  it("honors the artifact-specific id used by live agent calls instead of opening the previous file", async () => {
    const app = setup(); const id = app.workspace().sheets[0].id;
    const result = await app.call({ view: "sheets", sheet_id: id });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().activeSheetId).toBe(id);
    const wrong = await app.call({ view: "sheets", sheet_id: "missing" });
    expect(wrong.isError).toBe(true);
  });

  it("asks which file when names are duplicated, without changing the view", async () => {
    const app = setup();
    app.runtime.setWorkspace(createSheet(app.workspace(), "Sales"));
    const result = await app.call({ view: "sheets", artifact_title: "Sales" });
    expect(result.result.status).toBe("needs_clarification");
    expect(app.view()).toBe("documents");
  });

  it("rejects invalid targets, interrupted calls and unavailable navigation without claiming success", async () => {
    const app = setup(); const before = app.workspace();
    for (const args of [{ view: "unknown" }, { view: "sheets", artifact_id: "missing" }, { view: "settings", artifact_id: before.documents[0].id }]) {
      expect((await app.call(args)).isError).toBe(true);
    }
    expect((await app.call({ view: "sheets" }, AbortSignal.abort())).isError).toBe(true);
    delete app.runtime.setActiveView;
    expect((await app.call({ view: "sheets" })).isError).toBe(true);
    expect(app.workspace()).toEqual(before);
    expect(app.view()).toBe("documents");
  });
});

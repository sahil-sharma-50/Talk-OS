import { describe, expect, it } from "vitest";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";
import { explicitWorkspaceTarget, directWorkspaceNavigation } from "./workspace-intent";

it.each(["documents", "sheets", "planner", "canvas", "dashboard", "research", "settings"] as const)("recognizes a complete direct %s tab command", view => {
  expect(directWorkspaceNavigation(`Please open my ${view} tab.`)).toBe(view);
  expect(directWorkspaceNavigation(`Switch to ${view}`)).toBe(view);
});

it.each(["Do not open Sheets", "Should I open Sheets?", "If I open Sheets", "Open Sheets and delete everything", "Open my launch planner", "Create a document saying open Sheets", "Open Documents or Sheets", "Can you explain how to open Sheets?"])("keeps ambiguous, qualified and compound requests with the agent: %s", request => {
  expect(directWorkspaceNavigation(request)).toBeNull();
});

describe("explicit workspace destination", () => {
  it("does not mistake a subject or cross-workspace workflow for a destination", () => {
    expect(explicitWorkspaceTarget("Draw a diagram of a planner.")).toBeNull();
    expect(explicitWorkspaceTarget("Open Canvas and paste the diagram into my document.")).toBeNull();
    expect(explicitWorkspaceTarget("Go to my Planner and create a shopping list.")).toBe("planner");
  });
  it("rejects a shopping sheet for a Planner request, then allows the correct planner action", async () => {
    let workspace = createWorkspace();
    const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", getCurrentRequest: () => "Open my planner and create a shopping list." };
    const wrong = await executeResearchTool({ type: "tool.call", call_id: "wrong", name: "create_sheet", arguments: { title: "Shopping list", cells: { A1: "Milk" } } }, runtime);
    expect(wrong.result.error).toBe("workspace_target_mismatch"); expect(wrong.result.requested_workspace).toBe("planner");
    expect(workspace.sheets).toHaveLength(0);
    const right = await executeResearchTool({ type: "tool.call", call_id: "right", name: "create_planner", arguments: { title: "Shopping list", tasks: [{ title: "Milk" }] } }, runtime);
    expect(right.isError).not.toBe(true); expect(workspace.planners[0].tasks[0].title).toBe("Milk");
  });
  it("allows an explicit multi-workspace request", async () => {
    let workspace = createWorkspace();
    const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", getCurrentRequest: () => "Open my planner then create a budget sheet." };
    expect((await executeResearchTool({ type: "tool.call", call_id: "sheet", name: "create_sheet", arguments: { title: "Budget" } }, runtime)).isError).not.toBe(true);
  });
});

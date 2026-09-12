import { describe, expect, it } from "vitest";
import { workspaceForTool } from "./tool-workspace";

describe("workspaceForTool", () => {
  it.each([
    ["create_document", "documents"],
    ["edit_document", "documents"],
    ["read_document", "documents"],
    ["create_sheet", "sheets"],
    ["update_sheet", "sheets"],
    ["read_sheet", "sheets"],
    ["create_planner", "planner"],
    ["update_planner", "planner"],
    ["read_planner", "planner"],
    ["search_web", "research"],
    ["read_sources", "research"],
    ["summarize_research", "research"],
    ["get_workspace", null],
    ["unknown_tool", null],
  ] as const)("maps %s to %s", (tool, expected) => {
    expect(workspaceForTool(tool)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { validateDashboard } from "./dashboard-bindings";
import type { WorkspaceDashboard } from "./dashboard.types";

const dashboard = (overrides: Partial<WorkspaceDashboard> = {}): WorkspaceDashboard => ({
  id: "dashboard-1", title: "Launch", revision: 1, updatedAt: "2026-09-13T00:00:00.000Z",
  sources: [{ kind: "planner", id: "plan-1" }], widgets: [{ id: "progress", type: "progress", title: "Progress", size: "compact", order: 0, binding: { kind: "task_progress", plannerIds: ["plan-1"] } }],
  timezone: "Europe/Berlin", ...overrides,
});

describe("dashboard bindings", () => {
  it("accepts widgets that bind only to selected, correctly typed sources", () => {
    const workspace = { ...createWorkspace(), planners: [{ id: "plan-1", title: "Plan", revision: 1, updatedAt: "", timezone: "Europe/Berlin", tasks: [] }] };
    expect(validateDashboard(workspace, dashboard())).toEqual({ ok: true });
  });

  it("rejects duplicate widget ids and cross-type source ids", () => {
    const workspace = { ...createWorkspace(), sheets: [{ id: "shared", title: "Budget", revision: 1, updatedAt: "", cells: {} }] };
    expect(validateDashboard(workspace, dashboard({ sources: [{ kind: "planner", id: "shared" }] }))).toMatchObject({ ok: false, error: "invalid_source" });
    const widget = dashboard().widgets[0];
    expect(validateDashboard(workspace, dashboard({ sources: [], widgets: [widget, { ...widget }] }))).toMatchObject({ ok: false, error: "duplicate_widget_id" });
  });
});

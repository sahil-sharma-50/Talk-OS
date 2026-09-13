import { describe, expect, it } from "vitest";
import { createPlanner, createSheet, createWorkspace } from "@/features/workspace/workspace-model";
import { resolveDashboardWidget } from "./dashboard-selectors";
import type { WorkspaceDashboard } from "./dashboard.types";

function fixture() {
  const workspace = createPlanner(createSheet(createWorkspace(), "Budget", {
    A2: { value: "Design" }, B2: { value: 100 }, A3: { value: "Design" }, B3: { value: 50 }, A4: { value: "Hosting" }, B4: { value: 20 }, D2: { value: 500 },
  }), "Launch plan", [
    { id: "a", title: "A", completed: true }, { id: "b", title: "B", completed: true }, { id: "c", title: "C", completed: true },
    { id: "d", title: "D", completed: false, blockedReason: "Waiting", riskLevel: "high", dueDate: "2026-09-12" },
  ]);
  const sheetId = workspace.sheets[0].id; const plannerId = workspace.planners[0].id;
  const dashboard: WorkspaceDashboard = { id: "dashboard", title: "Launch", revision: 1, updatedAt: "", sources: [{ kind: "sheet", id: sheetId }, { kind: "planner", id: plannerId }], launchDate: "2026-09-19", timezone: "Europe/Berlin", widgets: [] };
  return { workspace, dashboard, sheetId, plannerId };
}

describe("dashboard selectors", () => {
  it("derives progress and explicit planner metrics", () => {
    const { workspace, dashboard, plannerId } = fixture();
    dashboard.widgets = [
      { id: "progress", type: "progress", title: "Progress", size: "compact", order: 0, binding: { kind: "task_progress", plannerIds: [plannerId] } },
      { id: "blocked", type: "metric", title: "Blocked", size: "compact", order: 1, binding: { kind: "task_count", plannerIds: [plannerId], metric: "blocked" } },
    ];
    expect(resolveDashboardWidget(workspace, dashboard, "progress", new Date("2026-09-13T10:00:00Z"))).toMatchObject({ status: "ready", value: { completed: 3, total: 4, percent: 75 } });
    expect(resolveDashboardWidget(workspace, dashboard, "blocked", new Date("2026-09-13T10:00:00Z"))).toMatchObject({ status: "ready", value: 1 });
  });

  it("groups category spending and compares a real budget", () => {
    const { workspace, dashboard, sheetId } = fixture();
    dashboard.widgets = [
      { id: "chart", type: "bar_chart", title: "Spending", size: "wide", order: 0, binding: { kind: "category_sum", sheetId, categoryRange: "A2:A4", amountRange: "B2:B4", currency: "EUR" } },
      { id: "budget", type: "metric", title: "Budget", size: "compact", order: 1, binding: { kind: "budget", sheetId, spendRange: "B2:B4", budgetCell: "D2", currency: "EUR" } },
    ];
    expect(resolveDashboardWidget(workspace, dashboard, "chart", new Date())).toMatchObject({ status: "ready", value: [{ label: "Design", value: 150 }, { label: "Hosting", value: 20 }] });
    expect(resolveDashboardWidget(workspace, dashboard, "budget", new Date())).toMatchObject({ status: "ready", value: { spent: 170, budget: 500, percent: 34, currency: "EUR" } });
  });

  it("returns empty for zero tasks, invalid for formula errors, and missing for deleted sources", () => {
    const { workspace, dashboard, sheetId, plannerId } = fixture();
    const emptyWorkspace = { ...workspace, planners: [{ ...workspace.planners[0], tasks: [] }] };
    dashboard.widgets = [{ id: "progress", type: "progress", title: "Progress", size: "compact", order: 0, binding: { kind: "task_progress", plannerIds: [plannerId] } }];
    expect(resolveDashboardWidget(emptyWorkspace, dashboard, "progress", new Date())).toMatchObject({ status: "empty" });
    dashboard.widgets = [{ id: "sum", type: "metric", title: "Sum", size: "compact", order: 0, binding: { kind: "sheet_sum", sheetId, range: "Z1:Z2", currency: "EUR" } }];
    expect(resolveDashboardWidget({ ...workspace, sheets: [] }, dashboard, "sum", new Date())).toMatchObject({ status: "missing" });
    const broken = { ...workspace, sheets: [{ ...workspace.sheets[0], cells: { Z1: { value: "=NOPE(A1)" } } }] };
    expect(resolveDashboardWidget(broken, dashboard, "sum", new Date())).toMatchObject({ status: "invalid" });
  });

  it("uses calendar days for launch countdowns", () => {
    const { workspace, dashboard } = fixture();
    dashboard.widgets = [{ id: "deadline", type: "deadline", title: "Launch", size: "compact", order: 0, binding: { kind: "deadline" } }];
    expect(resolveDashboardWidget(workspace, dashboard, "deadline", new Date("2026-09-13T10:00:00Z"))).toMatchObject({ status: "ready", value: { days: 6, label: "6 days" } });
  });
});

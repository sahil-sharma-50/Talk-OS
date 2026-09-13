export type DashboardSource =
  | { kind: "document"; id: string }
  | { kind: "sheet"; id: string }
  | { kind: "planner"; id: string }
  | { kind: "research"; id: string };

export type DashboardWidgetSize = "compact" | "wide";
interface DashboardWidgetBase { id: string; title: string; size: DashboardWidgetSize; order: number }

export type DashboardBinding =
  | { kind: "task_progress"; plannerIds: string[] }
  | { kind: "task_count"; plannerIds: string[]; metric: "remaining" | "blocked" | "high_risk" | "overdue" }
  | { kind: "sheet_sum"; sheetId: string; range: string; currency?: string }
  | { kind: "budget"; sheetId: string; spendRange: string; budgetCell: string; currency: string }
  | { kind: "category_sum"; sheetId: string; categoryRange: string; amountRange: string; currency: string }
  | { kind: "deadline" }
  | { kind: "task_list"; plannerIds: string[]; filter: "remaining" | "blocked" | "high_risk" | "overdue" }
  | { kind: "source_summary"; source: DashboardSource; text: string; sourceVersion: string; citations?: string[] };

export type DashboardWidget =
  | (DashboardWidgetBase & { type: "metric"; binding: Extract<DashboardBinding, { kind: "task_count" | "sheet_sum" | "budget" }> })
  | (DashboardWidgetBase & { type: "progress"; binding: Extract<DashboardBinding, { kind: "task_progress" }> })
  | (DashboardWidgetBase & { type: "deadline"; binding: Extract<DashboardBinding, { kind: "deadline" }> })
  | (DashboardWidgetBase & { type: "task_list"; binding: Extract<DashboardBinding, { kind: "task_list" }> })
  | (DashboardWidgetBase & { type: "bar_chart"; binding: Extract<DashboardBinding, { kind: "category_sum" }> })
  | (DashboardWidgetBase & { type: "summary"; binding: Extract<DashboardBinding, { kind: "source_summary" }> });

export interface WorkspaceDashboard {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  sources: DashboardSource[];
  launchDate?: string;
  timezone: string;
  widgets: DashboardWidget[];
}

export type WidgetState<T = unknown> =
  | { status: "ready"; value: T; sourceLabel: string; method: string }
  | { status: "empty"; reason: string }
  | { status: "missing"; reason: string }
  | { status: "invalid"; reason: string }
  | { status: "stale"; value: T; reason: string; sourceLabel: string; method: string };

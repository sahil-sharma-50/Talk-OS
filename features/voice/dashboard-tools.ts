import { validateDashboard } from "@/features/dashboard/dashboard-bindings";
import { resolveDashboardWidget } from "@/features/dashboard/dashboard-selectors";
import type { DashboardSource, DashboardWidget, WorkspaceDashboard } from "@/features/dashboard/dashboard.types";
import type { SessionEvent, WorkspaceView } from "@/features/session/session.types";
import { applyWorkspaceChanges, createDashboard } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";

interface FunctionTool { type: "function"; name: string; description: string; execution_mode: "interactive"; timeout_seconds: number; parameters: Record<string, unknown> }
interface DashboardToolCall { type: "tool.call"; call_id: string; name: string; arguments: Record<string, unknown> }
interface DashboardRuntime { getWorkspace(): WorkspaceSnapshot; setWorkspace(workspace: WorkspaceSnapshot): void; setActiveView?(view: Exclude<WorkspaceView, "settings">): void }
interface DashboardExecution { events: SessionEvent[]; result: Record<string, unknown>; isError?: boolean }
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): FunctionTool => ({ type: "function", name, description, execution_mode: "interactive", timeout_seconds: 20, parameters: { type: "object", properties, ...(required.length ? { required } : {}) } });
const sources = { type: "array", maxItems: 50, items: { type: "object", properties: { kind: { type: "string", enum: ["document", "sheet", "planner", "research"] }, id: { type: "string" } }, required: ["kind", "id"] } };
const widgets = { type: "array", maxItems: 50, description: "Each widget needs {id,type,title,size:compact|wide,order,binding}. Bindings: task_progress {plannerIds}; task_count {plannerIds,metric:remaining|blocked|high_risk|overdue}; sheet_sum {sheetId,range,currency?}; budget {sheetId,spendRange,budgetCell,currency}; category_sum {sheetId,categoryRange,amountRange,currency}; deadline {}; task_list {plannerIds,filter}; source_summary {source,text,sourceVersion,citations?}.", items: { type: "object" } };
export const dashboardTools: FunctionTool[] = [
  tool("create_dashboard", "Create a live dashboard from explicitly selected TalkOS sources and inspectable widget bindings. Never invent unavailable metrics.", { title: { type: "string" }, sources, widgets, launch_date: { type: "string" }, timezone: { type: "string" } }, ["title", "sources", "widgets"]),
  tool("read_dashboard", "Read a dashboard definition, revision, resolved live values, provenance, and error or stale states.", { dashboard_id: { type: "string" } }),
  tool("edit_dashboard", "Revision-safe dashboard definition edit. Send only fields to change; widget values remain derived from sources.", { dashboard_id: { type: "string" }, expected_revision: { type: "number" }, title: { type: "string" }, sources, widgets, launch_date: { anyOf: [{ type: "string" }, { type: "null" }] }, timezone: { type: "string" } }, ["dashboard_id", "expected_revision"]),
];

const success = (call: DashboardToolCall, detail: string, result: Record<string, unknown>): DashboardExecution => ({ events: [{ type: "ACTION_COMPLETED", actionId: call.call_id, detail, at: new Date().toISOString() }], result });
const failure = (call: DashboardToolCall, error: string, extra: Record<string, unknown> = {}): DashboardExecution => ({ events: [{ type: "ACTION_FAILED", actionId: call.call_id, detail: error, at: new Date().toISOString() }], result: { error, ...extra }, isError: true });
const text = (args: Record<string, unknown>, key: string) => typeof args[key] === "string" ? String(args[key]).trim() : "";
const owns = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const strings = (value: unknown): string[] | null => Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;

function parseSource(value: unknown): DashboardSource | null {
  if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>;
  return ["document", "sheet", "planner", "research"].includes(String(item.kind)) && typeof item.id === "string" ? { kind: item.kind as DashboardSource["kind"], id: item.id } as DashboardSource : null;
}
function parseSources(value: unknown): DashboardSource[] | null { if (!Array.isArray(value) || value.length > 50) return null; const result = value.map(parseSource); return result.every(Boolean) ? result as DashboardSource[] : null; }

function base(item: Record<string, unknown>) {
  return typeof item.id === "string" && typeof item.title === "string" && ["compact", "wide"].includes(String(item.size)) && Number.isInteger(item.order)
    ? { id: item.id, title: item.title, size: item.size as "compact" | "wide", order: item.order as number } : null;
}
function parseWidget(value: unknown): DashboardWidget | null {
  if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; const common = base(item); const raw = item.binding;
  if (!common || !raw || typeof raw !== "object") return null; const binding = raw as Record<string, unknown>;
  if (item.type === "progress" && binding.kind === "task_progress" && strings(binding.plannerIds)) return { ...common, type: "progress", binding: { kind: "task_progress", plannerIds: binding.plannerIds as string[] } };
  if (item.type === "metric" && binding.kind === "task_count" && strings(binding.plannerIds) && ["remaining", "blocked", "high_risk", "overdue"].includes(String(binding.metric))) return { ...common, type: "metric", binding: { kind: "task_count", plannerIds: binding.plannerIds as string[], metric: binding.metric as "remaining" | "blocked" | "high_risk" | "overdue" } };
  if (item.type === "metric" && binding.kind === "sheet_sum" && typeof binding.sheetId === "string" && typeof binding.range === "string") return { ...common, type: "metric", binding: { kind: "sheet_sum", sheetId: binding.sheetId, range: binding.range, ...(typeof binding.currency === "string" ? { currency: binding.currency } : {}) } };
  if (item.type === "metric" && binding.kind === "budget" && typeof binding.sheetId === "string" && typeof binding.spendRange === "string" && typeof binding.budgetCell === "string" && typeof binding.currency === "string") return { ...common, type: "metric", binding: { kind: "budget", sheetId: binding.sheetId, spendRange: binding.spendRange, budgetCell: binding.budgetCell, currency: binding.currency } };
  if (item.type === "bar_chart" && binding.kind === "category_sum" && typeof binding.sheetId === "string" && typeof binding.categoryRange === "string" && typeof binding.amountRange === "string" && typeof binding.currency === "string") return { ...common, type: "bar_chart", binding: { kind: "category_sum", sheetId: binding.sheetId, categoryRange: binding.categoryRange, amountRange: binding.amountRange, currency: binding.currency } };
  if (item.type === "deadline" && binding.kind === "deadline") return { ...common, type: "deadline", binding: { kind: "deadline" } };
  if (item.type === "task_list" && binding.kind === "task_list" && strings(binding.plannerIds) && ["remaining", "blocked", "high_risk", "overdue"].includes(String(binding.filter))) return { ...common, type: "task_list", binding: { kind: "task_list", plannerIds: binding.plannerIds as string[], filter: binding.filter as "remaining" | "blocked" | "high_risk" | "overdue" } };
  if (item.type === "summary" && binding.kind === "source_summary" && typeof binding.text === "string" && typeof binding.sourceVersion === "string") { const source = parseSource(binding.source); if (source) return { ...common, type: "summary", binding: { kind: "source_summary", source, text: binding.text, sourceVersion: binding.sourceVersion, ...(strings(binding.citations) ? { citations: binding.citations as string[] } : {}) } }; }
  return null;
}
function parseWidgets(value: unknown): DashboardWidget[] | null { if (!Array.isArray(value) || value.length > 50) return null; const result = value.map(parseWidget); return result.every(Boolean) ? result as DashboardWidget[] : null; }
function activeDashboard(workspace: WorkspaceSnapshot, id: string) { return workspace.dashboards.find((item) => item.id === (id || workspace.activeDashboardId)); }

export async function executeDashboardTool(call: DashboardToolCall, runtime: DashboardRuntime, signal?: AbortSignal): Promise<DashboardExecution | null> {
  if (!dashboardTools.some((candidate) => candidate.name === call.name)) return null;
  if (signal?.aborted) return failure(call, "interrupted");
  const workspace = runtime.getWorkspace(); const args = call.arguments;
  if (call.name === "create_dashboard") {
    const selectedSources = parseSources(args.sources); const parsedWidgets = parseWidgets(args.widgets);
    if (!selectedSources || !parsedWidgets) return failure(call, "invalid_dashboard_definition");
    const preview: WorkspaceDashboard = { id: "dashboard-preview", title: text(args, "title") || "Untitled dashboard", revision: 1, updatedAt: new Date().toISOString(), sources: selectedSources, widgets: parsedWidgets, timezone: text(args, "timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", ...(text(args, "launch_date") ? { launchDate: text(args, "launch_date") } : {}) };
    const valid = validateDashboard(workspace, preview); if (!valid.ok) return failure(call, valid.error, { detail: valid.detail });
    if (signal?.aborted) return failure(call, "interrupted");
    const next = createDashboard(workspace, preview.title, selectedSources, parsedWidgets, "agent", { launchDate: preview.launchDate, timezone: preview.timezone }); const dashboard = next.dashboards.at(-1)!;
    runtime.setWorkspace(next); runtime.setActiveView?.("dashboard");
    const receipt = next.changeHistory.at(-1)!; return success(call, `${dashboard.title} created`, { dashboard_id: dashboard.id, revision: dashboard.revision, change_id: receipt.id });
  }
  const dashboard = activeDashboard(workspace, text(args, "dashboard_id")); if (!dashboard) return failure(call, "dashboard_not_found");
  if (call.name === "read_dashboard") return success(call, `Read ${dashboard.title}`, { ...dashboard, resolved_widgets: dashboard.widgets.map((widget) => ({ id: widget.id, title: widget.title, state: resolveDashboardWidget(workspace, dashboard, widget.id, new Date()) })) });
  if (typeof args.expected_revision !== "number" || dashboard.revision !== args.expected_revision) return failure(call, "revision_conflict", { current_revision: dashboard.revision });
  const selectedSources = owns(args, "sources") ? parseSources(args.sources) : dashboard.sources; const parsedWidgets = owns(args, "widgets") ? parseWidgets(args.widgets) : dashboard.widgets;
  if (!selectedSources || !parsedWidgets) return failure(call, "invalid_dashboard_definition");
  const draft: WorkspaceDashboard = { ...dashboard, title: owns(args, "title") ? text(args, "title") : dashboard.title, sources: selectedSources, widgets: parsedWidgets, timezone: owns(args, "timezone") ? text(args, "timezone") : dashboard.timezone, launchDate: owns(args, "launch_date") ? (text(args, "launch_date") || undefined) : dashboard.launchDate };
  const valid = validateDashboard(workspace, draft); if (!valid.ok) return failure(call, valid.error, { detail: valid.detail });
  if (signal?.aborted) return failure(call, "interrupted"); const current = activeDashboard(runtime.getWorkspace(), dashboard.id); if (current?.revision !== dashboard.revision) return failure(call, "revision_conflict", { current_revision: current?.revision });
  const result = applyWorkspaceChanges(runtime.getWorkspace(), `Updated ${dashboard.title}`, [{ kind: "dashboard", artifactId: dashboard.id, expectedRevision: dashboard.revision, definition: draft }]);
  if (!result.ok) return failure(call, result.error, { current_revision: result.currentRevision }); if (signal?.aborted) return failure(call, "interrupted");
  runtime.setWorkspace(result.workspace); runtime.setActiveView?.("dashboard"); return success(call, "Dashboard updated", { dashboard_id: dashboard.id, revision: result.change.afterRevisions[dashboard.id], change_id: result.change.id });
}

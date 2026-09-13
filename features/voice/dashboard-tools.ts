import { validateDashboard } from "@/features/dashboard/dashboard-bindings";
import { suggestedSheetWidgets } from "@/features/dashboard/dashboard-suggestions";
import { defaultDashboardWidgets } from "@/features/dashboard/dashboard-defaults";
import { inferSheetColumns } from "@/features/workspace/sheet-operations";
import { resolveDashboardWidget } from "@/features/dashboard/dashboard-selectors";
import type { DashboardLayout, DashboardSource, DashboardWidget, WorkspaceDashboard } from "@/features/dashboard/dashboard.types";
import type { SessionEvent, WorkspaceView } from "@/features/session/session.types";
import { applyWorkspaceChanges, createDashboard } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";

interface FunctionTool { type: "function"; name: string; description: string; execution_mode: "interactive"; timeout_seconds: number; parameters: Record<string, unknown> }
interface DashboardToolCall { type: "tool.call"; call_id: string; name: string; arguments: Record<string, unknown> }
interface DashboardRuntime { getWorkspace(): WorkspaceSnapshot; setWorkspace(workspace: WorkspaceSnapshot): void; setActiveView?(view: Exclude<WorkspaceView, "settings">): void }
interface DashboardExecution { events: SessionEvent[]; result: Record<string, unknown>; isError?: boolean }
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): FunctionTool => ({ type: "function", name, description, execution_mode: "interactive", timeout_seconds: 20, parameters: { type: "object", properties, ...(required.length ? { required } : {}) } });
const sources = { type: "array", maxItems: 50, items: { type: "object", properties: { kind: { type: "string", enum: ["document", "sheet", "planner", "research"] }, id: { type: "string" } }, required: ["kind", "id"] } };
const stringField = { type: "string" };
const idList = { type: "array", items: stringField };
const binding = (kind: string, properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties: { kind: { type: "string", enum: [kind] }, ...properties }, required: ["kind", ...required] });
const currency = { type: "string", description: "ISO currency code such as EUR, USD or GBP. Use an empty string for ordinary numbers. Never a boolean." };
const source = { type: "object", properties: { kind: { type: "string", enum: ["document", "sheet", "planner", "research"] }, id: stringField }, required: ["kind", "id"] };
const widgets = {
  type: "array", maxItems: 50,
  description: "Widgets use a visual type (metric/bar_chart/etc.) and a separate binding.kind recipe. Example: {id:'revenue',type:'metric',title:'Revenue',size:'compact',order:0,binding:{kind:'sheet_sum',sheetId:'exact-id',range:'C2:C61',currency:'EUR'}}. Preserve ids/layout/color when editing.",
  items: { type: "object", required: ["id", "type", "title", "size", "order", "binding"], properties: {
    id: stringField, title: stringField, type: { type: "string", enum: ["metric", "progress", "deadline", "task_list", "bar_chart", "summary"] },
    size: { type: "string", enum: ["compact", "wide"] }, order: { type: "integer", minimum: 0 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    layout: { type: "object", properties: { x: { type: "number", minimum: 0, maximum: 75 }, y: { type: "number", minimum: 0, maximum: 8000 }, width: { type: "number", minimum: 25, maximum: 100 }, height: { type: "number", minimum: 180, maximum: 1600 } }, required: ["x", "y", "width", "height"], description: "x and width are percentages; y and height are pixels. Keep x+width at most 100." },
    binding: { oneOf: [
      binding("sheet_sum", { sheetId: stringField, range: stringField, currency }, ["sheetId", "range"]),
      binding("category_sum", { sheetId: stringField, categoryRange: stringField, amountRange: stringField, currency }, ["sheetId", "categoryRange", "amountRange"]),
      binding("budget", { sheetId: stringField, spendRange: stringField, budgetCell: stringField, currency }, ["sheetId", "spendRange", "budgetCell", "currency"]),
      binding("task_progress", { plannerIds: idList }, ["plannerIds"]),
      binding("task_count", { plannerIds: idList, metric: { type: "string", enum: ["remaining", "blocked", "high_risk", "overdue"] } }, ["plannerIds", "metric"]),
      binding("task_list", { plannerIds: idList, filter: { type: "string", enum: ["remaining", "blocked", "high_risk", "overdue"], default: "remaining", description: "Omit to show remaining tasks." } }, ["plannerIds"]),
      binding("deadline", {}, []),
      binding("source_summary", { source, text: stringField, sourceVersion: stringField, citations: idList }, ["source", "text", "sourceVersion"]),
    ] },
  } },
};
const invalidDefinitionDetail = "Use visual type metric for sheet_sum and budget; bar_chart for category_sum; progress for task_progress. Every binding requires kind. Currency must be a string such as EUR or an empty string. Every widget requires id, title, size compact|wide and integer order. Correct these fields and retry.";
export const dashboardTools: FunctionTool[] = [
  tool("create_sheet_dashboard", "Build a complete polished dashboard from sheet columns with correct live bindings, colors and totals. Use this for sheet dashboards. Read get_workspace column metadata; pass the measure letters the user requested, such as C for Revenue. Trailing labeled formula totals are excluded automatically. No widget JSON is needed.", { title: stringField, sheet_id: stringField, measure_columns: { type: "array", items: { type: "string", pattern: "^[A-Z]$" }, description: "Optional numeric column letters, e.g. [C]. Omit to use all numeric columns." }, category_column: { type: "string", pattern: "^[A-Z]$", description: "Optional grouping column letter, e.g. A for Region." } }, ["title", "sheet_id"]),
  tool("create_dashboard", "Create and open a live dashboard from exact selected workspace sources. Omit widgets for an automatically composed overview using actual sheet columns, planner progress/tasks, and document/research summaries. Supply widgets only for custom metrics. Never invent unavailable metrics.", { title: { type: "string" }, sources, widgets, launch_date: { type: "string" }, timezone: { type: "string" } }, ["title", "sources"]),
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
  let layout: DashboardLayout | undefined;
  if (item.layout !== undefined) {
    if (!item.layout || typeof item.layout !== "object") return null;
    const value = item.layout as Record<string, unknown>;
    if (!["x", "y", "width", "height"].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))) return null;
    layout = { ...value, height: typeof value.height === "number" && value.height > 0 ? Math.max(180, value.height) : value.height } as unknown as DashboardLayout;
    if (layout.x < 0 || layout.y < 0 || layout.y > 8000 || layout.width < 25 || layout.width > 100 || layout.x + layout.width > 100 || layout.height < 180 || layout.height > 1600) return null;
  }
  if (item.color !== undefined && (typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color))) return null;
  return typeof item.id === "string" && typeof item.title === "string" && ["compact", "wide"].includes(String(item.size)) && Number.isInteger(item.order)
    ? { id: item.id, title: item.title, size: item.size as "compact" | "wide", order: item.order as number, ...(layout ? { layout } : {}), ...(typeof item.color === "string" ? { color: item.color } : {}) } : null;
}
function parseWidget(value: unknown, workspace: WorkspaceSnapshot): DashboardWidget | null {
  if (!value || typeof value !== "object") return null; const item = { ...value } as Record<string, unknown>;
  if (typeof item.color === "string" && /^[0-9a-f]{6}$/i.test(item.color)) item.color = `#${item.color}`;
  const common = base(item); const raw = item.binding;
  if (!common || !raw || typeof raw !== "object") return null; const binding = { ...raw } as Record<string, unknown>;
  if (binding.kind === "planner_progress") binding.kind = "task_progress";
  if (["task_progress", "task_count", "task_list"].includes(String(binding.kind)) && binding.plannerIds === undefined && typeof binding.plannerId === "string") binding.plannerIds = [binding.plannerId];
  if (binding.kind === "task_list" && binding.filter === undefined) binding.filter = "remaining";
  if (binding.kind === "category_sum") {
    if (binding.currency === undefined) binding.currency = "";
    // Some voice calls use the sheet builder's column fields in a custom
    // chart. Resolve only an unambiguous column from the actual source data;
    // never replace an explicit range or choose among multiple measures.
    const sheet = workspace.sheets.find(sheet => sheet.id === binding.sheetId);
    const columns = sheet ? inferSheetColumns(sheet) : [];
    if (binding.categoryRange === undefined && typeof binding.category_column === "string") binding.categoryRange = columns.find(column => column.letter === String(binding.category_column).toUpperCase())?.range;
    const measures = strings(binding.measure_columns);
    if (binding.amountRange === undefined && measures?.length === 1) binding.amountRange = columns.find(column => column.letter === measures[0].toUpperCase() && column.type === "number")?.range;
  }
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
function parseWidgets(value: unknown, workspace: WorkspaceSnapshot): DashboardWidget[] | null { if (!Array.isArray(value) || value.length > 50) return null; const result = value.map(widget => parseWidget(widget, workspace)); return result.every(Boolean) ? result as DashboardWidget[] : null; }
function definitionErrors(value: unknown, workspace: WorkspaceSnapshot) {
  if (!Array.isArray(value)) return [{ path: "widgets", reason: "Supply an array, or omit widgets when creating an automatic dashboard." }];
  return value.flatMap((widget, index) => {
    if (parseWidget(widget, workspace)) return [];
    const error = (field: string, reason: string) => [{ path: `widgets[${index}]${field}`, widget_id: widget?.id, title: widget?.title, reason }];
    const binding = widget?.binding;
    if (binding?.kind === "task_list" && binding.filter !== undefined && !["remaining", "blocked", "high_risk", "overdue"].includes(binding.filter)) return error(".binding.filter", "Use remaining, blocked, high_risk or overdue; omit filter to show remaining tasks.");
    if (binding?.kind === "category_sum") {
      if (binding.currency !== undefined && typeof binding.currency !== "string") return error(".binding.currency", "Use a currency code string such as EUR, or omit currency for ordinary numbers.");
      const sheet = workspace.sheets.find(sheet => sheet.id === binding.sheetId);
      const columns = sheet ? inferSheetColumns(sheet) : [];
      const measures = strings(binding.measure_columns);
      if (binding.amountRange === undefined && (!measures || measures.length !== 1 || !columns.some(column => column.letter === measures[0].toUpperCase() && column.type === "number"))) return error(".binding.measure_columns", "Choose exactly one numeric column from read_sheet metadata, or supply its amountRange such as C2:C11.");
      if (binding.categoryRange === undefined && !columns.some(column => column.letter === String(binding.category_column).toUpperCase())) return error(".binding.categoryRange", "Supply a categoryRange such as B2:B11, or a category_column from read_sheet metadata, matching the measure rows.");
    }
    return error("", "Use the declared visual type with its matching binding recipe; check color (#RRGGBB), layout, size and order.");
  });
}
function resolvedWidgets(workspace: WorkspaceSnapshot, dashboard: WorkspaceDashboard) {
  return dashboard.widgets.map(widget => ({ id: widget.id, title: widget.title, state: resolveDashboardWidget(workspace, dashboard, widget.id, new Date()) }));
}
function invalidWidgetStates(workspace: WorkspaceSnapshot, dashboard: WorkspaceDashboard) {
  return resolvedWidgets(workspace, dashboard).flatMap(({ id, title, state }) => state.status === "invalid" || state.status === "missing" ? [{ widget_id: id, title, reason: state.reason }] : []);
}
function activeDashboard(workspace: WorkspaceSnapshot, id: string) { return workspace.dashboards.find((item) => item.id === (id || workspace.activeDashboardId)); }

export async function executeDashboardTool(call: DashboardToolCall, runtime: DashboardRuntime, signal?: AbortSignal): Promise<DashboardExecution | null> {
  if (!dashboardTools.some((candidate) => candidate.name === call.name)) return null;
  if (signal?.aborted) return failure(call, "interrupted");
  const workspace = runtime.getWorkspace(); const args = call.arguments;
  if (call.name === "create_sheet_dashboard") {
    const sheet = workspace.sheets.find((item) => item.id === args.sheet_id);
    if (!sheet) return failure(call, "sheet_not_found");
    const measures = args.measure_columns === undefined ? undefined : strings(args.measure_columns);
    if (measures === null || measures?.length === 0) return failure(call, "invalid_measure_columns");
    try {
      const generated = suggestedSheetWidgets(sheet, { measureColumns: measures?.map((letter) => letter.toUpperCase()), categoryColumn: text(args, "category_column").toUpperCase() || undefined });
      if (!generated.length) return failure(call, "no_numeric_columns", { detail: "This sheet has no numeric measure. Ask what should be summarized." });
      const next = createDashboard(workspace, text(args, "title") || `${sheet.title} dashboard`, [{ kind: "sheet", id: sheet.id }], generated, "agent");
      runtime.setWorkspace(next); const dashboard = next.dashboards.at(-1)!;
      return success(call, `${dashboard.title} created`, { dashboard_id: dashboard.id, revision: dashboard.revision, change_id: next.changeHistory.at(-1)!.id, resolved_widgets: generated.map((widget) => ({ id: widget.id, title: widget.title, state: resolveDashboardWidget(next, dashboard, widget.id, new Date()) })) });
    } catch (error) { return failure(call, "invalid_sheet_columns", { detail: (error as Error).message }); }
  }
  if (call.name === "create_dashboard") {
    const selectedSources = parseSources(args.sources);
    const parsedWidgets = args.widgets === undefined && selectedSources ? defaultDashboardWidgets(workspace, selectedSources) : parseWidgets(args.widgets, workspace);
    if (!selectedSources || !parsedWidgets) return failure(call, "invalid_dashboard_definition", { detail: invalidDefinitionDetail, widget_errors: definitionErrors(args.widgets, workspace) });
    const preview: WorkspaceDashboard = { id: "dashboard-preview", title: text(args, "title") || "Untitled dashboard", revision: 1, updatedAt: new Date().toISOString(), sources: selectedSources, widgets: parsedWidgets, timezone: text(args, "timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", ...(text(args, "launch_date") ? { launchDate: text(args, "launch_date") } : {}) };
    const valid = validateDashboard(workspace, preview); if (!valid.ok) return failure(call, valid.error, { detail: valid.detail });
    if (args.widgets === undefined && !parsedWidgets.length) return success(call, "Waiting for dashboard data", { status: "needs_clarification", question: "Which sheet with numeric data, planner, document, or research collection should this dashboard use?" });
    const errors = invalidWidgetStates(workspace, preview);
    if (errors.length) return failure(call, "invalid_dashboard_bindings", { widget_errors: errors, detail: "Read the selected sources and correct these bindings before retrying." });
    if (signal?.aborted) return failure(call, "interrupted");
    const next = createDashboard(workspace, preview.title, selectedSources, parsedWidgets, "agent", { launchDate: preview.launchDate, timezone: preview.timezone }); const dashboard = next.dashboards.at(-1)!;
    runtime.setWorkspace(next);
    const receipt = next.changeHistory.at(-1)!; return success(call, `${dashboard.title} created`, { dashboard_id: dashboard.id, revision: dashboard.revision, change_id: receipt.id, resolved_widgets: resolvedWidgets(next, dashboard) });
  }
  const dashboard = activeDashboard(workspace, text(args, "dashboard_id")); if (!dashboard) return failure(call, "dashboard_not_found");
  if (call.name === "read_dashboard") return success(call, `Read ${dashboard.title}`, { ...dashboard, resolved_widgets: dashboard.widgets.map((widget) => ({ id: widget.id, title: widget.title, state: resolveDashboardWidget(workspace, dashboard, widget.id, new Date()) })) });
  if (typeof args.expected_revision !== "number" || dashboard.revision !== args.expected_revision) return failure(call, "revision_conflict", { current_revision: dashboard.revision });
  const selectedSources = owns(args, "sources") ? parseSources(args.sources) : dashboard.sources; const parsedWidgets = owns(args, "widgets") ? parseWidgets(args.widgets, workspace) : dashboard.widgets;
  if (!selectedSources || !parsedWidgets) return failure(call, "invalid_dashboard_definition", { detail: invalidDefinitionDetail, widget_errors: definitionErrors(args.widgets, workspace) });
  const draft: WorkspaceDashboard = { ...dashboard, title: owns(args, "title") ? text(args, "title") : dashboard.title, sources: selectedSources, widgets: parsedWidgets, timezone: owns(args, "timezone") ? text(args, "timezone") : dashboard.timezone, launchDate: owns(args, "launch_date") ? (text(args, "launch_date") || undefined) : dashboard.launchDate };
  const valid = validateDashboard(workspace, draft); if (!valid.ok) return failure(call, valid.error, { detail: valid.detail });
  const errors = invalidWidgetStates(workspace, draft);
  if (errors.length) return failure(call, "invalid_dashboard_bindings", { widget_errors: errors, detail: "Read the selected sources and correct these bindings before retrying." });
  if (signal?.aborted) return failure(call, "interrupted"); const current = activeDashboard(runtime.getWorkspace(), dashboard.id); if (current?.revision !== dashboard.revision) return failure(call, "revision_conflict", { current_revision: current?.revision });
  const result = applyWorkspaceChanges(runtime.getWorkspace(), `Updated ${dashboard.title}`, [{ kind: "dashboard", artifactId: dashboard.id, expectedRevision: dashboard.revision, definition: draft }]);
  if (!result.ok) return failure(call, result.error, { current_revision: result.currentRevision }); if (signal?.aborted) return failure(call, "interrupted");
  runtime.setWorkspace(result.workspace); return success(call, "Dashboard updated", { dashboard_id: dashboard.id, revision: result.change.afterRevisions[dashboard.id], change_id: result.change.id });
}

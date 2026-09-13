import { evaluateSheet } from "@/features/workspace/sheet-formulas";
import type { PlannerTask, WorkspaceSheet, WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import type { DashboardSource, DashboardWidget, WidgetState, WorkspaceDashboard } from "./dashboard.types";

const CELL = /^([A-Z]+)([1-9]\d*)$/;
const columnNumber = (column: string) => [...column].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
const columnName = (number: number) => { let result = ""; for (let value = number; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(((value - 1) % 26) + 65) + result; return result; };

function rangeAddresses(range: string): string[] | null {
  const [startRaw, endRaw = startRaw] = range.trim().toUpperCase().split(":");
  const start = CELL.exec(startRaw); const end = CELL.exec(endRaw);
  if (!start || !end) return null;
  const addresses: string[] = [];
  for (let row = Number(start[2]); row <= Number(end[2]); row += 1) for (let column = columnNumber(start[1]); column <= columnNumber(end[1]); column += 1) addresses.push(`${columnName(column)}${row}`);
  return addresses.length ? addresses : null;
}

function selected(dashboard: WorkspaceDashboard, source: DashboardSource) { return dashboard.sources.some((item) => item.kind === source.kind && item.id === source.id); }
function localDate(now: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch { return null; }
}
function dayNumber(value: string): number | null { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return null; const date = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])); return new Date(date).toISOString().slice(0, 10) === value ? date / 86_400_000 : null; }

function planners(workspace: WorkspaceSnapshot, dashboard: WorkspaceDashboard, ids: string[]): WidgetState<Array<{ plannerTitle: string; task: PlannerTask }>> {
  if (ids.some((id) => !selected(dashboard, { kind: "planner", id }))) return { status: "invalid", reason: "The widget uses a planner that is not selected." };
  const found = ids.map((id) => workspace.planners.find((planner) => planner.id === id));
  if (found.some((planner) => !planner)) return { status: "missing", reason: "A selected planner is unavailable." };
  const seen = new Set<string>(); const items: Array<{ plannerTitle: string; task: PlannerTask }> = [];
  found.forEach((planner) => planner!.tasks.forEach((task) => { const key = `${planner!.id}:${task.id}`; if (!seen.has(key)) { seen.add(key); items.push({ plannerTitle: planner!.title, task }); } }));
  return { status: "ready", value: items, sourceLabel: found.map((item) => item!.title).join(", "), method: "Selected planner tasks" };
}

function sheetValues(sheet: WorkspaceSheet, range: string): WidgetState<Array<string | number>> {
  const addresses = rangeAddresses(range);
  if (!addresses) return { status: "invalid", reason: `Invalid range: ${range}` };
  const computed = evaluateSheet(sheet.cells);
  const values = addresses.map((address) => computed[address] ?? sheet.cells[address]?.value ?? "");
  const error = values.find((value) => typeof value === "string" && value.startsWith("#"));
  if (error) return { status: "invalid", reason: `The selected range contains ${error}.` };
  return { status: "ready", value: values, sourceLabel: sheet.title, method: range };
}
function numberValues(values: Array<string | number>): number[] | null {
  const nonempty = values.filter((value) => value !== "");
  const numbers = nonempty.map((value) => typeof value === "number" ? value : Number(value));
  return numbers.every(Number.isFinite) ? numbers : null;
}

export function sourceVersion(workspace: WorkspaceSnapshot, source: DashboardSource): string | null {
  if (source.kind === "document") return workspace.documents.find((item) => item.id === source.id)?.revision.toString() ?? null;
  if (source.kind === "sheet") return workspace.sheets.find((item) => item.id === source.id)?.revision.toString() ?? null;
  if (source.kind === "planner") return workspace.planners.find((item) => item.id === source.id)?.revision.toString() ?? null;
  const collection = workspace.researchCollections.find((item) => item.id === source.id);
  if (!collection) return null;
  const payload = JSON.stringify([collection.query, collection.summary, collection.sourceIds, collection.sourceIds.map((id) => workspace.sources.find((sourceItem) => sourceItem.id === id)?.content ?? "")]);
  let hash = 2166136261; for (let index = 0; index < payload.length; index += 1) hash = Math.imul(hash ^ payload.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function resolve(widget: DashboardWidget, workspace: WorkspaceSnapshot, dashboard: WorkspaceDashboard, now: Date): WidgetState {
  const binding = widget.binding;
  if (binding.kind === "task_progress" || binding.kind === "task_count" || binding.kind === "task_list") {
    const state = planners(workspace, dashboard, binding.plannerIds); if (state.status !== "ready") return state;
    const tasks = state.value; const today = localDate(now, dashboard.timezone);
    if (binding.kind === "task_progress") return tasks.length ? { status: "ready", value: { completed: tasks.filter(({ task }) => task.completed).length, total: tasks.length, percent: Math.round(tasks.filter(({ task }) => task.completed).length / tasks.length * 100) }, sourceLabel: state.sourceLabel, method: "Completed tasks ÷ all selected tasks" } : { status: "empty", reason: "No tasks in the selected planners." };
    const criterion = binding.kind === "task_count" ? binding.metric : binding.filter;
    const filtered = tasks.filter(({ task }) => !task.completed && (criterion === "remaining"
      || (criterion === "blocked" && Boolean(task.blockedReason?.trim()))
      || (criterion === "high_risk" && task.riskLevel === "high")
      || (criterion === "overdue" && Boolean(today && task.dueDate && task.dueDate < today))));
    if (binding.kind === "task_count") return { status: "ready", value: filtered.length, sourceLabel: state.sourceLabel, method: `${binding.metric.replace("_", " ")} incomplete tasks` };
    return filtered.length ? { status: "ready", value: filtered, sourceLabel: state.sourceLabel, method: `${binding.filter.replace("_", " ")} incomplete tasks` } : { status: "empty", reason: `No ${binding.filter.replace("_", " ")} tasks.` };
  }
  if (binding.kind === "deadline") {
    if (!dashboard.launchDate) return { status: "empty", reason: "Set a launch date." };
    const today = localDate(now, dashboard.timezone); const start = today ? dayNumber(today) : null; const end = dayNumber(dashboard.launchDate);
    if (start === null || end === null) return { status: "invalid", reason: "The launch date or timezone is invalid." };
    const days = end - start; const label = days === 0 ? "Launch today" : days > 0 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
    return { status: "ready", value: { days, label }, sourceLabel: dashboard.title, method: `Calendar days in ${dashboard.timezone}` };
  }
  if (binding.kind === "source_summary") {
    if (!selected(dashboard, binding.source)) return { status: "invalid", reason: "The summary source is not selected." };
    const version = sourceVersion(workspace, binding.source); if (!version) return { status: "missing", reason: "The summary source is unavailable." };
    const value = { text: binding.text, citations: binding.citations ?? [] };
    return version === binding.sourceVersion ? { status: "ready", value, sourceLabel: `${binding.source.kind} source`, method: "Saved sourced summary" } : { status: "stale", value, reason: "The source changed after this summary was written.", sourceLabel: `${binding.source.kind} source`, method: "Saved sourced summary" };
  }
  if (!selected(dashboard, { kind: "sheet", id: binding.sheetId })) return { status: "invalid", reason: "The widget sheet is not selected." };
  const sheet = workspace.sheets.find((item) => item.id === binding.sheetId); if (!sheet) return { status: "missing", reason: "The selected sheet is unavailable." };
  if (binding.kind === "sheet_sum") {
    const values = sheetValues(sheet, binding.range); if (values.status !== "ready") return values; const numbers = numberValues(values.value);
    return numbers ? { status: "ready", value: { amount: numbers.reduce((sum, value) => sum + value, 0), currency: binding.currency }, sourceLabel: sheet.title, method: `Sum of ${binding.range}` } : { status: "invalid", reason: "The range contains nonnumeric values." };
  }
  if (binding.kind === "budget") {
    const spending = sheetValues(sheet, binding.spendRange); const budget = sheetValues(sheet, binding.budgetCell); if (spending.status !== "ready") return spending; if (budget.status !== "ready") return budget;
    const amounts = numberValues(spending.value); const budgetValues = numberValues(budget.value); if (!amounts || budgetValues?.length !== 1 || budgetValues[0] <= 0) return { status: "invalid", reason: "Budget data must be numeric and the budget must be greater than zero." };
    const spent = amounts.reduce((sum, value) => sum + value, 0); return { status: "ready", value: { spent, budget: budgetValues[0], percent: Math.round(spent / budgetValues[0] * 100), currency: binding.currency }, sourceLabel: sheet.title, method: `Sum ${binding.spendRange} ÷ ${binding.budgetCell}` };
  }
  const categories = sheetValues(sheet, binding.categoryRange); const amounts = sheetValues(sheet, binding.amountRange); if (categories.status !== "ready") return categories; if (amounts.status !== "ready") return amounts;
  if (categories.value.length !== amounts.value.length) return { status: "invalid", reason: "Category and amount ranges must have the same number of cells." };
  const numbers = numberValues(amounts.value); if (!numbers || numbers.length !== amounts.value.length) return { status: "invalid", reason: "Every category amount must be numeric." };
  const grouped = new Map<string, number>(); categories.value.forEach((label, index) => { const name = String(label).trim() || "Uncategorized"; grouped.set(name, (grouped.get(name) ?? 0) + numbers[index]); });
  return { status: "ready", value: [...grouped].map(([label, value]) => ({ label, value })), sourceLabel: sheet.title, method: `${binding.categoryRange} grouped with ${binding.amountRange}` };
}

export function resolveDashboardWidget(workspace: WorkspaceSnapshot, dashboard: WorkspaceDashboard, widgetId: string, now: Date): WidgetState {
  const widget = dashboard.widgets.find((item) => item.id === widgetId);
  return widget ? resolve(widget, workspace, dashboard, now) : { status: "missing", reason: "Widget not found." };
}

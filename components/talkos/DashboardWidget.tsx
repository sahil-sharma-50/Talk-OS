import { AlertCircle, ArrowUpRight, Clock3, Database, ListTodo } from "lucide-react";
import type { DashboardSource, DashboardWidget as DashboardWidgetDefinition, WidgetState } from "@/features/dashboard/dashboard.types";
import { DashboardChart } from "./DashboardChart";

function widgetSource(widget: DashboardWidgetDefinition): DashboardSource | null {
  const binding = widget.binding;
  if (binding.kind === "task_progress" || binding.kind === "task_count" || binding.kind === "task_list") return binding.plannerIds[0] ? { kind: "planner", id: binding.plannerIds[0] } : null;
  if (binding.kind === "sheet_sum" || binding.kind === "budget" || binding.kind === "category_sum") return { kind: "sheet", id: binding.sheetId };
  if (binding.kind === "source_summary") return binding.source;
  return null;
}
const number = (value: number, currency?: string) => { try { return new Intl.NumberFormat(undefined, currency ? { style: "currency", currency, maximumFractionDigits: 0 } : { maximumFractionDigits: 1 }).format(value); } catch { return String(value); } };
const hostname = (url: string) => { try { return new URL(url).hostname; } catch { return "Source"; } };

export function DashboardWidget({ widget, state, onOpenSource, onRemove }: { widget: DashboardWidgetDefinition; state: WidgetState; onOpenSource: (source: DashboardSource) => void; onRemove: () => void }) {
  const source = widgetSource(widget);
  let body;
  if (state.status === "empty" || state.status === "missing" || state.status === "invalid") body = <div className="dashboard-widget__state"><AlertCircle size={18} /><span>{state.reason}</span></div>;
  else if (widget.type === "progress") { const value = state.value as { completed: number; total: number; percent: number }; body = <><strong className="dashboard-widget__metric">{value.percent}%</strong><div className="dashboard-progress"><i style={{ width: `${value.percent}%` }} /></div><p>{value.completed} of {value.total} tasks complete</p></>; }
  else if (widget.type === "deadline") { const value = state.value as { days: number; label: string }; body = <><Clock3 size={20} /><strong className="dashboard-widget__metric dashboard-widget__metric--text">{value.label}</strong></>; }
  else if (widget.type === "bar_chart") body = <DashboardChart data={state.value as Array<{ label: string; value: number }>} currency={widget.binding.currency} />;
  else if (widget.type === "task_list") body = <ul className="dashboard-task-list">{(state.value as Array<{ plannerTitle: string; task: { id: string; title: string; blockedReason?: string; dueDate?: string } }>).map(({ plannerTitle, task }) => <li key={`${plannerTitle}:${task.id}`}><ListTodo size={14} /><span><strong>{task.title}</strong><small>{task.blockedReason || task.dueDate || plannerTitle}</small></span></li>)}</ul>;
  else if (widget.type === "summary") { const value = state.value as { text: string; citations: string[] }; body = <><p className="dashboard-summary">{value.text}</p>{value.citations.length ? <div className="dashboard-citations">{value.citations.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{hostname(url)}</a>)}</div> : null}{state.status === "stale" ? <p className="dashboard-stale">{state.reason}</p> : null}</>; }
  else { const value = state.value as number | { amount?: number; spent?: number; budget?: number; percent?: number; currency?: string }; body = typeof value === "number" ? <strong className="dashboard-widget__metric">{value}</strong> : "spent" in value ? <><strong className="dashboard-widget__metric">{number(value.spent!, value.currency)}</strong><p>{value.percent}% of {number(value.budget!, value.currency)}</p></> : <strong className="dashboard-widget__metric">{number(value.amount ?? 0, value.currency)}</strong>; }
  return <article className="dashboard-widget" data-size={widget.size}>
    <header><div><span>{widget.type.replace("_", " ")}</span><h3>{widget.title}</h3></div><button type="button" onClick={onRemove} aria-label={`Remove ${widget.title}`}>×</button></header>
    <div className="dashboard-widget__body">{body}</div>
    {state.status === "ready" || state.status === "stale" ? <footer><span title={state.method}><Database size={12} /> {state.sourceLabel}</span>{source ? <button type="button" onClick={() => onOpenSource(source)}>Open source <ArrowUpRight size={12} /></button> : null}</footer> : null}
  </article>;
}

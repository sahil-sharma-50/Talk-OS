"use client";

import { BarChart3, CalendarClock, FilePlus2, Gauge, ListChecks, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveDashboardWidget, sourceVersion } from "@/features/dashboard/dashboard-selectors";
import type { DashboardSource, DashboardWidget, WorkspaceDashboard } from "@/features/dashboard/dashboard.types";
import { applyWorkspaceChanges, createDashboard, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { DashboardWidget as Widget } from "./DashboardWidget";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

const download = (name: string, value: unknown) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
const key = (source: DashboardSource) => `${source.kind}:${source.id}`;

export function DashboardWorkspace({ workspace, onChange, onOpenSource }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void; onOpenSource: (source: DashboardSource) => void }) {
  const active = workspace.dashboards.find((item) => item.id === workspace.activeDashboardId) ?? workspace.dashboards[0];
  const [sheetId, setSheetId] = useState(""); const [rangeA, setRangeA] = useState("A2:A10"); const [rangeB, setRangeB] = useState("B2:B10");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const refresh = () => setNow(new Date()); const timer = window.setInterval(refresh, 60_000); window.addEventListener("focus", refresh); return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); }; }, []);
  const create = () => onChange(createDashboard(workspace, "Project dashboard"));
  if (!active) return <div className="tool-empty"><BarChart3 size={30} /><h2>Bring the project into focus</h2><p>Choose the files that belong together, then track live progress, deadlines, spending, and risks.</p><button type="button" onClick={create}><FilePlus2 size={14} /> Create a dashboard</button></div>;

  const commit = (definition: WorkspaceDashboard, label: string) => { const result = applyWorkspaceChanges(workspace, label, [{ kind: "dashboard", artifactId: active.id, expectedRevision: active.revision, definition }], "user"); if (result.ok) onChange(result.workspace); };
  const update = (patch: Partial<WorkspaceDashboard>, label: string) => commit({ ...active, ...patch }, label);
  const addWidget = (widget: Omit<DashboardWidget, "id" | "order">) => update({ widgets: [...active.widgets, { ...widget, id: `widget-${crypto.randomUUID()}`, order: active.widgets.length } as DashboardWidget] }, `Added ${widget.title}`);
  const removeWidget = (id: string) => update({ widgets: active.widgets.filter((item) => item.id !== id).map((item, order) => ({ ...item, order })) }, "Removed dashboard widget");
  const allSources: Array<{ source: DashboardSource; label: string }> = [
    ...workspace.documents.map((item) => ({ source: { kind: "document", id: item.id } as DashboardSource, label: item.title })),
    ...workspace.sheets.map((item) => ({ source: { kind: "sheet", id: item.id } as DashboardSource, label: item.title })),
    ...workspace.planners.map((item) => ({ source: { kind: "planner", id: item.id } as DashboardSource, label: item.title })),
    ...workspace.researchCollections.map((item) => ({ source: { kind: "research", id: item.id } as DashboardSource, label: item.query })),
  ];
  const selectedPlannerIds = active.sources.filter((source): source is Extract<DashboardSource, { kind: "planner" }> => source.kind === "planner").map((source) => source.id);
  const selectedSheets = workspace.sheets.filter((sheet) => active.sources.some((source) => source.kind === "sheet" && source.id === sheet.id));

  return <div className="dashboard-workspace">
    <aside className="artifact-list"><div className="artifact-list__heading"><strong>Dashboards</strong><span>{workspace.dashboards.length}</span></div><div className="artifact-list__actions artifact-list__actions--single"><button type="button" onClick={create}><FilePlus2 size={14} /> New</button></div>{workspace.dashboards.map((dashboard) => <div className="artifact-row" data-active={dashboard.id === active.id} key={dashboard.id} onClick={() => onChange({ ...workspace, activeDashboardId: dashboard.id })}><button type="button"><strong>{dashboard.title}</strong><small>{dashboard.widgets.length} widgets</small></button><FileActionMenu name={dashboard.title} onRename={(name) => onChange(renameArtifact(workspace, "dashboard", dashboard.id, name))} onDuplicate={() => onChange(duplicateArtifact(workspace, "dashboard", dashboard.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "dashboard", dashboard.id))} onExport={() => download(`${dashboard.title}.talkos-dashboard.json`, dashboard)} /></div>)}</aside>
    <section className="dashboard-main">
      <header className="dashboard-header"><div><span>Live project view</span><h2>{active.title}</h2></div><div className="dashboard-header__controls"><label>Launch date<input type="date" value={active.launchDate ?? ""} onChange={(event) => update({ launchDate: event.target.value || undefined }, "Updated dashboard launch date")} /></label><label>Timezone<select value={active.timezone} onChange={(event) => update({ timezone: event.target.value }, "Updated dashboard timezone")}>{[...new Set([active.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone, "UTC", "Europe/Berlin"])].map((zone) => <option value={zone} key={zone}>{zone}</option>)}</select></label></div></header>
      <details className="dashboard-config" open={!active.sources.length}><summary><SlidersHorizontal size={15} /> Choose sources <span>{active.sources.length} selected</span></summary><div className="dashboard-source-grid">{allSources.length ? allSources.map(({ source, label }) => <label key={key(source)}><input type="checkbox" checked={active.sources.some((item) => key(item) === key(source))} onChange={(event) => update({ sources: event.target.checked ? [...active.sources, source] : active.sources.filter((item) => key(item) !== key(source)) }, `${event.target.checked ? "Connected" : "Disconnected"} ${label}`)} /><span><small>{source.kind}</small>{label}</span></label>) : <p>No workspace sources yet.</p>}</div></details>
      <section className="dashboard-builder" aria-label="Add dashboard widgets">
        <strong>Add widget</strong>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "progress", title: "Task progress", size: "compact", binding: { kind: "task_progress", plannerIds: selectedPlannerIds } })}><Gauge size={14} /> Progress</button>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "metric", title: "Tasks remaining", size: "compact", binding: { kind: "task_count", plannerIds: selectedPlannerIds, metric: "remaining" } })}><ListChecks size={14} /> Remaining</button>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "metric", title: "Blocked", size: "compact", binding: { kind: "task_count", plannerIds: selectedPlannerIds, metric: "blocked" } })}>Blocked</button>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "metric", title: "High risk", size: "compact", binding: { kind: "task_count", plannerIds: selectedPlannerIds, metric: "high_risk" } })}>High risk</button>
        <button type="button" disabled={!active.launchDate} onClick={() => addWidget({ type: "deadline", title: "Launch", size: "compact", binding: { kind: "deadline" } })}><CalendarClock size={14} /> Deadline</button>
      </section>
      {selectedSheets.length ? <form className="dashboard-sheet-builder" onSubmit={(event) => { event.preventDefault(); const selectedSheetId = sheetId || selectedSheets[0].id; addWidget({ type: "bar_chart", title: "Spending by category", size: "wide", binding: { kind: "category_sum", sheetId: selectedSheetId, categoryRange: rangeA, amountRange: rangeB, currency: "EUR" } }); }}><strong>Sheet widget</strong><select aria-label="Dashboard sheet" value={sheetId} onChange={(event) => setSheetId(event.target.value)}>{selectedSheets.map((sheet) => <option value={sheet.id} key={sheet.id}>{sheet.title}</option>)}</select><input aria-label="First range" title="Category or spending range" value={rangeA} onChange={(event) => setRangeA(event.target.value.toUpperCase())} /><input aria-label="Second range" title="Amount range or budget cell" value={rangeB} onChange={(event) => setRangeB(event.target.value.toUpperCase())} /><button type="submit"><Plus size={14} /> Category chart</button><button type="button" onClick={() => addWidget({ type: "metric", title: "Budget used", size: "compact", binding: { kind: "budget", sheetId: sheetId || selectedSheets[0].id, spendRange: rangeA, budgetCell: rangeB, currency: "EUR" } })}>Budget</button><button type="button" onClick={() => addWidget({ type: "metric", title: "Total", size: "compact", binding: { kind: "sheet_sum", sheetId: sheetId || selectedSheets[0].id, range: rangeA, currency: "EUR" } })}>Sum</button></form> : null}
      <div className="dashboard-grid">{active.widgets.length ? [...active.widgets].sort((a, b) => a.order - b.order).map((widget) => <Widget key={widget.id} widget={widget} state={resolveDashboardWidget(workspace, active, widget.id, now)} onOpenSource={onOpenSource} onRemove={() => removeWidget(widget.id)} />) : <div className="dashboard-blank"><BarChart3 size={25} /><h3>Build your project view</h3><p>Choose sources, then add metrics and charts. Every value stays linked to its source.</p></div>}</div>
      {active.sources.filter((source) => source.kind === "document" || source.kind === "research").map((source) => <button className="dashboard-add-summary" type="button" key={key(source)} onClick={() => { const text = source.kind === "document" ? workspace.documents.find((item) => item.id === source.id)?.content ?? "" : workspace.researchCollections.find((item) => item.id === source.id)?.summary ?? ""; addWidget({ type: "summary", title: source.kind === "document" ? "Project brief" : "Research findings", size: "wide", binding: { kind: "source_summary", source, text, sourceVersion: sourceVersion(workspace, source) ?? "missing", citations: source.kind === "research" ? workspace.researchCollections.find((item) => item.id === source.id)?.sourceIds.map((id) => workspace.sources.find((item) => item.id === id)?.url).filter((url): url is string => Boolean(url)) : [] } }); }}>Add {source.kind} summary</button>)}
    </section><WorkspaceResizeHandle />
  </div>;
}

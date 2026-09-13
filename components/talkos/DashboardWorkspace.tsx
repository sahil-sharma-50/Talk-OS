"use client";

import { Download, Printer, RotateCcw, BarChart3, CalendarClock, FilePlus2, Gauge, ListChecks, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { resolveDashboardWidget, sourceVersion } from "@/features/dashboard/dashboard-selectors";
import type { DashboardSource, DashboardWidget, WorkspaceDashboard } from "@/features/dashboard/dashboard.types";
import { applyWorkspaceChanges, createDashboard, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
import { DashboardWidget as Widget } from "./DashboardWidget";
import { FileActionMenu } from "./FileActionMenu";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { DashboardSheetBuilder } from "./DashboardSheetBuilder";
import { DashboardLayout } from "./DashboardLayout";
import { placeDashboardWidget } from "@/features/dashboard/dashboard-layout";
import { downloadDashboardImage, printDashboard } from "@/features/dashboard/dashboard-export";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

const download = (name: string, value: unknown) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
const key = (source: DashboardSource) => `${source.kind}:${source.id}`;

export function DashboardWorkspace({ workspace, onChange, onOpenSource }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void; onOpenSource: (source: DashboardSource) => void }) {
  const active = workspace.dashboards.find((item) => item.id === workspace.activeDashboardId) ?? workspace.dashboards[0];
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const refresh = () => setNow(new Date()); const timer = window.setInterval(refresh, 60_000); window.addEventListener("focus", refresh); return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); }; }, []);
  const create = () => onChange(createDashboard(workspace, "Project dashboard"));
  if (!active) return <div className="tool-empty"><BarChart3 size={30} /><h2>Bring the project into focus</h2><p>Create a dashboard, select the Documents, Sheets, Planners, and Research for this project, then add linked widgets. Metrics update automatically when source data changes; saved summaries indicate when they need refreshing. TalkOS can build or edit the view by voice.</p><button type="button" onClick={create}><FilePlus2 size={14} /> Create a dashboard</button></div>;

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

  const exportView = async (print: boolean) => {
    if (!exportRef.current) return;
    setExporting(true); setNotice("");
    try { if (print) await printDashboard(exportRef.current, active.title); else await downloadDashboardImage(exportRef.current, active.title); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not export the dashboard."); }
    finally { setExporting(false); }
  };
  const addWidgets = (widgets: DashboardWidget[]) => update({ widgets: [...active.widgets, ...widgets.map((widget, index) => ({ ...widget, order: active.widgets.length + index }))] }, "Added sheet widgets");
  return <div className="dashboard-workspace">
    <ArtifactNavigator label="Dashboards" count={workspace.dashboards.length} countLabel={`${workspace.dashboards.length} dashboards`} actions={<button type="button" onClick={create}><Plus size={14} /> New</button>}>
      {workspace.dashboards.map((dashboard) => <ArtifactNavigatorItem active={dashboard.id === active.id} icon={BarChart3} title={dashboard.title} meta={`${dashboard.widgets.length} ${dashboard.widgets.length === 1 ? "widget" : "widgets"}`} key={dashboard.id} onSelect={() => onChange({ ...workspace, activeDashboardId: dashboard.id })} menu={<FileActionMenu name={dashboard.title} kind="dashboard" onRename={(name) => onChange(renameArtifact(workspace, "dashboard", dashboard.id, name))} onDuplicate={() => onChange(duplicateArtifact(workspace, "dashboard", dashboard.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "dashboard", dashboard.id))} onExport={() => download(`${dashboard.title}.talkos-dashboard.json`, dashboard)} />} />)}
    </ArtifactNavigator>
    <section className="dashboard-main">
      <header className="dashboard-header"><div><EditableArtifactTitle title={active.title} ariaLabel="Dashboard title" onCommit={(title) => onChange(renameArtifact(workspace, "dashboard", active.id, title))} /></div><div className="dashboard-header__controls"><button className="quiet-action" type="button" disabled={exporting || !active.widgets.length} onClick={() => void exportView(false)}><Download size={14} /> PNG</button><button className="quiet-action" type="button" disabled={exporting || !active.widgets.length} onClick={() => void exportView(true)}><Printer size={14} /> Print / PDF</button><label>Launch date<input type="date" value={active.launchDate ?? ""} onChange={(event) => update({ launchDate: event.target.value || undefined }, "Updated dashboard launch date")} /></label><label>Timezone<select value={active.timezone} onChange={(event) => update({ timezone: event.target.value }, "Updated dashboard timezone")}>{[...new Set([active.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone, "UTC", "Europe/Berlin"])].map((zone) => <option value={zone} key={zone}>{zone}</option>)}</select></label></div></header>
      {!active.widgets.length ? <aside className="dashboard-guide" role="note" aria-label="How Dashboard works"><strong>How Dashboard works</strong><p>Select the Documents, Sheets, Planners, and Research, then add widgets. Metrics update automatically; saved summaries show when they need refreshing. You can also build this view by voice.</p></aside> : null}
      <details className="dashboard-config" open={!active.sources.length}><summary><SlidersHorizontal size={15} /> Choose sources <span>{active.sources.length} selected</span></summary><div className="dashboard-source-grid">{allSources.length ? allSources.map(({ source, label }) => <label key={key(source)}><input type="checkbox" checked={active.sources.some((item) => key(item) === key(source))} onChange={(event) => update({ sources: event.target.checked ? [...active.sources, source] : active.sources.filter((item) => key(item) !== key(source)) }, `${event.target.checked ? "Connected" : "Disconnected"} ${label}`)} /><span><small>{source.kind}</small>{label}</span></label>) : <p>No workspace sources yet.</p>}</div></details>
      <details className="dashboard-config dashboard-widget-config" key={active.id} open={!active.widgets.length}><summary><Plus size={15} /> Add widgets <span>{selectedSheets.length ? "Charts and metrics from your data" : "Progress, tasks and summaries"}</span></summary>
      <section className="dashboard-builder" aria-label="Add dashboard widgets">
        <strong>Add widget</strong>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "progress", title: "Task progress", size: "compact", binding: { kind: "task_progress", plannerIds: selectedPlannerIds } })}><Gauge size={14} /> Progress</button>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "metric", title: "Tasks remaining", size: "compact", binding: { kind: "task_count", plannerIds: selectedPlannerIds, metric: "remaining" } })}><ListChecks size={14} /> Remaining</button>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "metric", title: "Blocked", size: "compact", binding: { kind: "task_count", plannerIds: selectedPlannerIds, metric: "blocked" } })}>Blocked</button>
        <button type="button" disabled={!selectedPlannerIds.length} onClick={() => addWidget({ type: "metric", title: "High risk", size: "compact", binding: { kind: "task_count", plannerIds: selectedPlannerIds, metric: "high_risk" } })}>High risk</button>
        <button type="button" disabled={!active.launchDate} onClick={() => addWidget({ type: "deadline", title: "Launch", size: "compact", binding: { kind: "deadline" } })}><CalendarClock size={14} /> Deadline</button>
      </section>
      {selectedSheets.length ? <DashboardSheetBuilder sheets={selectedSheets} onAdd={addWidgets} /> : null}
      </details>
      {notice ? <p className="dashboard-notice" role="status">{notice}</p> : null}
      {active.widgets.length ? <div className="dashboard-layout-toolbar"><span>Drag the grip to move a widget. Drag its corner to resize.</span><button className="quiet-action" type="button" onClick={() => update({ widgets: active.widgets.map((widget) => ({ ...widget, layout: undefined })) }, "Reset dashboard layout")}><RotateCcw size={13} /> Reset layout</button></div> : null}
      <div className="dashboard-export-surface" ref={exportRef}><header><h2>{active.title}</h2><span>{active.sources.length} linked sources · {now.toLocaleDateString()}</span></header>
      {active.widgets.length ? <DashboardLayout widgets={[...active.widgets].sort((a, b) => a.order - b.order)} onLayoutChange={(id, layout) => { update({ widgets: placeDashboardWidget(active.widgets, id, layout) }, "Moved dashboard widget"); }}>{(widget) => <Widget widget={widget} state={resolveDashboardWidget(workspace, active, widget.id, now)} onOpenSource={onOpenSource} onRemove={() => removeWidget(widget.id)} />}</DashboardLayout> : <div className="dashboard-blank"><BarChart3 size={25} /><h3>Build your project view</h3><p>Choose sources, then add metrics and charts. Every value stays linked to its source.</p></div>}</div>
      {active.sources.filter((source) => source.kind === "document" || source.kind === "research").map((source) => <button className="dashboard-add-summary" type="button" key={key(source)} onClick={() => { const text = source.kind === "document" ? workspace.documents.find((item) => item.id === source.id)?.content ?? "" : workspace.researchCollections.find((item) => item.id === source.id)?.summary ?? ""; addWidget({ type: "summary", title: source.kind === "document" ? "Project brief" : "Research findings", size: "wide", binding: { kind: "source_summary", source, text, sourceVersion: sourceVersion(workspace, source) ?? "missing", citations: source.kind === "research" ? workspace.researchCollections.find((item) => item.id === source.id)?.sourceIds.map((id) => workspace.sources.find((item) => item.id === id)?.url).filter((url): url is string => Boolean(url)) : [] } }); }}>Add {source.kind} summary</button>)}
    </section><WorkspaceResizeHandle />
  </div>;
}

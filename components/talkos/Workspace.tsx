"use client";

import { BarChart3, CalendarDays, FileText, Globe2, PanelRightOpen, PenTool, Settings2, Table2 } from "lucide-react";
import { memo, useCallback } from "react";
import type { SessionState, WorkspaceView } from "@/features/session/session.types";
import type { VoiceCredentials } from "@/features/voice/voice-adapter.types";
import type { VoiceTelemetrySnapshot } from "@/features/voice/voice-telemetry";
import { WorkspaceSettings } from "./WorkspaceSettings";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ActivityDrawer } from "./ActivityDrawer";
import { DocumentWorkspace as DocumentWorkspaceView } from "./DocumentWorkspace";
import { PlannerWorkspace as PlannerWorkspaceView } from "./PlannerWorkspace";
import { ResearchWorkspace as ResearchWorkspaceView } from "./ResearchWorkspace";
import { SheetsWorkspace as SheetsWorkspaceView } from "./SheetsWorkspace";
import { CanvasWorkspace as CanvasWorkspaceView } from "./CanvasWorkspace";
import { DashboardWorkspace as DashboardWorkspaceView } from "./DashboardWorkspace";
import type { DashboardSource } from "@/features/dashboard/dashboard.types";

// Voice energy and partial words update frequently. Keep the expensive editor
// subtree out of those renders; artifact changes still flow through normally.
const DocumentWorkspace = memo(DocumentWorkspaceView);
const PlannerWorkspace = memo(PlannerWorkspaceView);
const ResearchWorkspace = memo(ResearchWorkspaceView);
const SheetsWorkspace = memo(SheetsWorkspaceView);
const CanvasWorkspace = memo(CanvasWorkspaceView);
const DashboardWorkspace = memo(DashboardWorkspaceView);

interface WorkspaceProps {
  state: SessionState;
  workspace: WorkspaceSnapshot;
  onWorkspaceChange: (view: WorkspaceView) => void;
  onWorkspaceDataChange: (workspace: WorkspaceSnapshot) => void;
  credentials: VoiceCredentials;
  onCredentialsChange: (credentials: VoiceCredentials) => void;
  telemetry: VoiceTelemetrySnapshot;
  activityOpen: boolean;
  onActivityToggle: () => void;
  onUndo: (id: string) => void;
  onClearActivity?: () => void;
}

export function Workspace({ state, workspace, onWorkspaceChange, onWorkspaceDataChange, credentials, onCredentialsChange, telemetry, activityOpen, onActivityToggle, onUndo, onClearActivity }: WorkspaceProps) {
  const openDashboardSource = useCallback((source: DashboardSource) => {
    const next = source.kind === "document" ? { ...workspace, activeDocumentId: source.id } : source.kind === "sheet" ? { ...workspace, activeSheetId: source.id } : source.kind === "planner" ? { ...workspace, activePlannerId: source.id } : { ...workspace, selectedResearchCollectionId: source.id };
    onWorkspaceDataChange(next); onWorkspaceChange(source.kind === "document" ? "documents" : source.kind === "sheet" ? "sheets" : source.kind === "planner" ? "planner" : "research");
  }, [workspace, onWorkspaceDataChange, onWorkspaceChange]);
  const tabs: Array<{ id: WorkspaceView; label: string; icon: typeof FileText }> = [
    { id: "documents", label: "Documents", icon: FileText },
    { id: "sheets", label: "Sheets", icon: Table2 },
    { id: "planner", label: "Planner", icon: CalendarDays },
    { id: "research", label: "Research", icon: Globe2 },
    { id: "canvas", label: "Canvas", icon: PenTool },
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  let panel = <DocumentWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "sheets") panel = <SheetsWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "planner") panel = <PlannerWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "research") panel = <ResearchWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "canvas") panel = <CanvasWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "dashboard") panel = <DashboardWorkspace workspace={workspace} onChange={onWorkspaceDataChange} onOpenSource={openDashboardSource} />;
  if (state.activeWorkspace === "settings") panel = <WorkspaceSettings credentials={credentials} onCredentialsChange={onCredentialsChange} workspace={workspace} onChange={onWorkspaceDataChange} />;

  return <section className="workspace" aria-label="Agent workspace">
    <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
      {tabs.map(({ id, label, icon: Icon }, index) => <button type="button" role="tab" id={`${id}-tab`} tabIndex={state.activeWorkspace === id ? 0 : -1} aria-selected={state.activeWorkspace === id} aria-controls={state.activeWorkspace === id ? `${id}-panel` : undefined} onClick={() => onWorkspaceChange(id)} onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); onWorkspaceChange(tabs[next].id); document.getElementById(`${tabs[next].id}-tab`)?.focus();
      }} key={id}><Icon size={15} /> {label}</button>)}
      <span className="workspace-tabs__meta">{workspace.documents.length + workspace.sheets.length + workspace.planners.length + workspace.canvases.length + workspace.dashboards.length} files · {workspace.sources.length} sources</span>
    </div>
    <div className="workspace-canvas" role="tabpanel" id={`${state.activeWorkspace}-panel`} aria-labelledby={`${state.activeWorkspace}-tab`} aria-label={tabs.find((tab) => tab.id === state.activeWorkspace)?.label}>
      {!activityOpen ? <button className="activity-toggle" type="button" onClick={onActivityToggle} aria-label="Open activity sidebar" aria-expanded="false" aria-controls="activity-drawer" title="Activity"><PanelRightOpen size={17} /></button> : null}
      <div className="workspace-canvas__scroll" tabIndex={0} role="region" aria-label="Workspace content">{panel}</div>
      <ActivityDrawer open={activityOpen} state={state} workspace={workspace} telemetry={telemetry} onToggle={onActivityToggle} onUndo={onUndo} onClear={onClearActivity} />
    </div>
  </section>;
}

"use client";

import { ChevronRight, PanelRightClose, Undo2 } from "lucide-react";
import { useState } from "react";
import type { SessionState } from "@/features/session/session.types";
import type { VoiceTelemetrySnapshot } from "@/features/voice/voice-telemetry";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { canUndoWorkspaceChange } from "@/features/workspace/workspace-model";
import { ActivityTimeline } from "./ActivityTimeline";

export function ActivityDrawer({ open, state, workspace, telemetry, onToggle, onUndo, onClear }: {
  open: boolean; state: SessionState; workspace: WorkspaceSnapshot; telemetry: VoiceTelemetrySnapshot; onToggle: () => void; onUndo: (id: string) => void; onClear?: () => void;
}) {
  const [developerMode, setDeveloperMode] = useState(false);
  if (!open) return null;
  const agentHistory = workspace.changeHistory.filter((change) => change.author === "agent");
  const receipts = agentHistory.filter((change) => canUndoWorkspaceChange(workspace, change)).toReversed();
  const recordCount = state.activities.length + receipts.length;
  return <aside id="activity-drawer" className="side-drawer" aria-label="Activity drawer">
    <header className="activity-drawer__header"><button className="activity-toggle activity-toggle--inside" type="button" onClick={onToggle} aria-label="Hide activity sidebar" aria-expanded="true" aria-controls="activity-drawer" title="Hide activity"><PanelRightClose size={17} /></button><div><strong>Activity</strong><span>{recordCount} record{recordCount === 1 ? "" : "s"}</span></div></header>
    <section className="developer-mode-control">
      <div><strong>AssemblyAI</strong><span>Voice runtime</span></div>
      <button type="button" role="switch" aria-checked={developerMode} aria-label="Developer Mode" onClick={() => setDeveloperMode((enabled) => !enabled)}><i aria-hidden="true" /></button>
    </section>
    {developerMode ? <section className="developer-mode" aria-label="AssemblyAI Developer Mode">
      <header><div><i aria-hidden="true" /><strong>AssemblyAI live</strong></div><span>{telemetry.connected ? "Connected" : "Waiting"}</span></header>
      <dl className="developer-metrics">
        <div title="Measured after your spoken turn ends"><dt>Endpoint latency</dt><dd data-pending={telemetry.endpointLatencyMs === null}>{telemetry.endpointLatencyMs === null ? telemetry.connected ? "Waiting for speech" : "Start a session" : `${telemetry.endpointLatencyMs} ms`}</dd></div>
        <div title="From your finalized turn to the first audible reply; includes buffered audio and excludes silent start events"><dt>Response latency</dt><dd data-pending={telemetry.responseLatencyMs === null}>{telemetry.responseLatencyMs === null ? telemetry.connected ? "Waiting for speech back" : "Start a session" : `${telemetry.responseLatencyMs} ms`}</dd></div>
      </dl>
      <ol className="developer-events">
        {telemetry.events.length ? telemetry.events.toReversed().map((event) => <li key={event.id}><i data-kind={event.kind} aria-hidden="true" /><div><strong>{event.label}</strong>{event.detail ? <span>{event.detail}</span> : null}</div><time>{new Date(event.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></li>) : <li className="empty-copy">Voice events will appear here.</li>}
      </ol>
    </section> : null}
    {workspace.task.steps.length ? <ol className="drawer-plan">{workspace.task.steps.map((step) => <li key={step.id} data-status={step.status}><ChevronRight size={12} />{step.label}</li>)}</ol> : null}
    <ActivityTimeline activities={state.activities} planRevision={state.planRevision} receiptCount={receipts.length} hasSavedHistory={agentHistory.length > 0} onClear={onClear} />
    {receipts.map((change) => <section className="change-receipt" key={change.id}>
      <div><strong>{change.label}</strong><span>{Object.keys(change.afterRevisions).length} file{Object.keys(change.afterRevisions).length === 1 ? "" : "s"} changed</span></div>
      <button type="button" onClick={() => onUndo(change.id)}><Undo2 size={13} /> Undo this change</button>
    </section>)}
  </aside>;
}

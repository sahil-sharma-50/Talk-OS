"use client";

import { ChevronRight, PanelRightClose, Undo2 } from "lucide-react";
import { useState } from "react";
import type { SessionState } from "@/features/session/session.types";
import type { VoiceTelemetrySnapshot } from "@/features/voice/voice-telemetry";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ActivityTimeline } from "./ActivityTimeline";

export function ActivityDrawer({ open, state, workspace, telemetry, onToggle, onUndo }: {
  open: boolean; state: SessionState; workspace: WorkspaceSnapshot; telemetry: VoiceTelemetrySnapshot; onToggle: () => void; onUndo: (id: string) => void;
}) {
  const [developerMode, setDeveloperMode] = useState(false);
  if (!open) return null;
  return <aside id="activity-drawer" className="side-drawer" aria-label="Activity drawer">
    <header className="activity-drawer__header"><button className="activity-toggle activity-toggle--inside" type="button" onClick={onToggle} aria-label="Hide activity sidebar" aria-expanded="true" aria-controls="activity-drawer" title="Hide activity"><PanelRightClose size={17} /></button><div><strong>Activity</strong><span>{state.activities.length} actions</span></div></header>
    <section className="developer-mode-control">
      <div><strong>AssemblyAI</strong><span>Voice runtime</span></div>
      <button type="button" role="switch" aria-checked={developerMode} aria-label="Developer Mode" onClick={() => setDeveloperMode((enabled) => !enabled)}><i aria-hidden="true" /></button>
    </section>
    {developerMode ? <section className="developer-mode" aria-label="AssemblyAI Developer Mode">
      <header><div><i aria-hidden="true" /><strong>AssemblyAI live</strong></div><span>{telemetry.connected ? "Connected" : "Waiting"}</span></header>
      <dl className="developer-metrics">
        <div><dt>Endpoint latency</dt><dd>{telemetry.endpointLatencyMs === null ? "Unavailable" : `${telemetry.endpointLatencyMs} ms`}</dd></div>
        <div><dt>Response latency</dt><dd>{telemetry.responseLatencyMs === null ? "Unavailable" : `${telemetry.responseLatencyMs} ms`}</dd></div>
      </dl>
      <ol className="developer-events">
        {telemetry.events.length ? telemetry.events.toReversed().map((event) => <li key={event.id}><i data-kind={event.kind} aria-hidden="true" /><div><strong>{event.label}</strong>{event.detail ? <span>{event.detail}</span> : null}</div><time>{new Date(event.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></li>) : <li className="empty-copy">Voice events will appear here.</li>}
      </ol>
    </section> : null}
    {workspace.task.objective ? <section className="drawer-objective"><strong>{workspace.task.objective}</strong>{workspace.task.constraints.length ? <p>{workspace.task.constraints.join(" · ")}</p> : null}</section> : null}
    {workspace.task.steps.length ? <ol className="drawer-plan">{workspace.task.steps.map((step) => <li key={step.id} data-status={step.status}><ChevronRight size={12} />{step.label}</li>)}</ol> : null}
    <ActivityTimeline activities={state.activities} planRevision={state.planRevision} />
    {workspace.changeHistory.filter((change) => change.author === "agent" && !change.undone).toReversed().map((change) => <section className="change-receipt" key={change.id}>
      <div><strong>{change.label}</strong><span>{change.before.length} file{change.before.length === 1 ? "" : "s"} changed</span></div>
      <button type="button" onClick={() => onUndo(change.id)}><Undo2 size={13} /> Undo this change</button>
    </section>)}
  </aside>;
}

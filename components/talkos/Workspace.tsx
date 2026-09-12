"use client";

import { CalendarDays, Eye, EyeOff, FileText, Globe2, KeyRound, PanelRightClose, PanelRightOpen, Settings2, ShieldCheck, Table2, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import type { SessionState, WorkspaceView } from "@/features/session/session.types";
import type { VoiceCredentials } from "@/features/voice/voice-adapter.types";
import type { VoiceTelemetrySnapshot } from "@/features/voice/voice-telemetry";
import { restoreTrashedArtifact } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ActivityDrawer } from "./ActivityDrawer";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { PlannerWorkspace } from "./PlannerWorkspace";
import { ResearchWorkspace } from "./ResearchWorkspace";
import { SheetsWorkspace } from "./SheetsWorkspace";

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
  onActivityClose: () => void;
  onUndo: (id: string) => void;
}

export function Workspace({ state, workspace, onWorkspaceChange, onWorkspaceDataChange, credentials, onCredentialsChange, telemetry, activityOpen, onActivityToggle, onActivityClose, onUndo }: WorkspaceProps) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [agentEditable, setAgentEditable] = useState(false);
  const tabs: Array<{ id: WorkspaceView; label: string; icon: typeof FileText }> = [
    { id: "documents", label: "Documents", icon: FileText },
    { id: "sheets", label: "Sheets", icon: Table2 },
    { id: "planner", label: "Planner", icon: CalendarDays },
    { id: "research", label: "Research", icon: Globe2 },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  let panel = <DocumentWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "sheets") panel = <SheetsWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "planner") panel = <PlannerWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "research") panel = <ResearchWorkspace workspace={workspace} onChange={onWorkspaceDataChange} />;
  if (state.activeWorkspace === "settings") panel = <div className="workspace-sheet settings-view">
    <header><div><h2>Connect your services</h2><p>Credentials remain in this tab and are cleared when it closes.</p></div><KeyRound size={20} aria-hidden="true" /></header>
    <form className="credentials-form" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="assemblyai-api-key">AssemblyAI API key</label>
      <div className="secret-field"><input id="assemblyai-api-key" name="talkos-assembly-key" type={showSecrets ? "text" : "password"} value={credentials.apiKey} onChange={(event) => onCredentialsChange({ ...credentials, apiKey: event.target.value })} autoComplete="new-password" data-1p-ignore="true" data-lpignore="true" placeholder="Paste your AssemblyAI API key" /><button type="button" onClick={() => setShowSecrets((value) => !value)} aria-label={showSecrets ? "Hide API keys" : "Show API keys"}>{showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      <label htmlFor="assemblyai-agent-id">AssemblyAI Agent ID</label>
      <input id="assemblyai-agent-id" name="talkos-voice-agent-identifier" value={credentials.agentId} readOnly={!agentEditable} onFocus={() => setAgentEditable(true)} onChange={(event) => onCredentialsChange({ ...credentials, agentId: event.target.value })} autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-1p-ignore="true" data-lpignore="true" placeholder="Example: 7ad24396-b822-4dca-871a-be9cc4781cf9" />
      <label htmlFor="tavily-api-key">Tavily API key</label>
      <div className="secret-field"><input id="tavily-api-key" name="talkos-tavily-key" type={showSecrets ? "text" : "password"} value={credentials.tavilyApiKey ?? ""} onChange={(event) => onCredentialsChange({ ...credentials, tavilyApiKey: event.target.value })} autoComplete="new-password" data-1p-ignore="true" data-lpignore="true" placeholder="Optional, for live web research" /></div>
      <div className="credential-status" data-ready={Boolean(credentials.apiKey.trim() && credentials.agentId.trim() && !credentials.agentId.includes("@"))}><ShieldCheck size={16} /><span>{credentials.agentId.includes("@") ? "Agent ID cannot be an email address" : credentials.apiKey.trim() && credentials.agentId.trim() ? "Voice configured" : "Add both AssemblyAI fields, or use deployment settings"}{credentials.tavilyApiKey?.trim() ? " · Research configured" : ""}</span></div>
      <button className="clear-credentials" type="button" onClick={() => onCredentialsChange({ apiKey: "", agentId: "", tavilyApiKey: "" })} disabled={!credentials.apiKey && !credentials.agentId && !credentials.tavilyApiKey}><Trash2 size={14} /> Clear</button>
    </form>
    <footer className="settings-privacy"><ShieldCheck size={16} /><p>Your workspace stays in this browser. Credentials are used only to establish the requested AssemblyAI and Tavily connections.</p></footer>
    {workspace.trash.length ? <section className="trash-bin"><h3>Trash</h3>{workspace.trash.map((item) => <div key={item.id}><span>{item.artifact.title}</span><button type="button" onClick={() => onWorkspaceDataChange(restoreTrashedArtifact(workspace, item.id))}><Undo2 size={13} /> Restore</button></div>)}</section> : null}
  </div>;

  return <section className="workspace" aria-label="Agent workspace">
    <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
      {tabs.map(({ id, label, icon: Icon }) => <button type="button" role="tab" id={`${id}-tab`} aria-selected={state.activeWorkspace === id} aria-controls={`${id}-panel`} onClick={() => onWorkspaceChange(id)} key={id}><Icon size={15} /> {label}</button>)}
      <span className="workspace-tabs__meta">{workspace.documents.length + workspace.sheets.length + workspace.planners.length} files · {workspace.sources.length} sources</span>
    </div>
    <div className="workspace-canvas" role="tabpanel" id={`${state.activeWorkspace}-panel`} aria-labelledby={`${state.activeWorkspace}-tab`} aria-label={tabs.find((tab) => tab.id === state.activeWorkspace)?.label}>
      <button className="activity-toggle" type="button" onClick={onActivityToggle} aria-label={activityOpen ? "Hide activity sidebar" : "Open activity sidebar"} aria-expanded={activityOpen} aria-controls="activity-drawer" title="Activity">
        {activityOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
      </button>
      <div className="workspace-canvas__scroll">{panel}</div>
        <ActivityDrawer open={activityOpen} state={state} workspace={workspace} telemetry={telemetry} onClose={onActivityClose} onUndo={onUndo} />
    </div>
  </section>;
}

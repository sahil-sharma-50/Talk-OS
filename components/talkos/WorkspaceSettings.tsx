"use client";

import { Eye, EyeOff, KeyRound, Save, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { VoiceCredentials } from "@/features/voice/voice-adapter.types";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { restoreTrashedArtifact } from "@/features/workspace/workspace-model";

export function WorkspaceSettings({ credentials, onCredentialsChange, workspace, onChange }: {
  credentials: VoiceCredentials; onCredentialsChange: (value: VoiceCredentials) => void;
  workspace: WorkspaceSnapshot; onChange: (value: WorkspaceSnapshot) => void;
}) {
  const [draft, setDraft] = useState(credentials);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  const confirmationId = useId();
  const clearTrashRef = useRef<HTMLButtonElement>(null);
  const cancelTrashRef = useRef<HTMLButtonElement>(null);
  const trashHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (confirmTrash) cancelTrashRef.current?.focus(); }, [confirmTrash]);
  const cancelRemoval = () => { setConfirmTrash(false); clearTrashRef.current?.focus(); };
  const fields = [
    { key: "apiKey", id: "assemblyai-api-key", label: "AssemblyAI API key", placeholder: "Paste your AssemblyAI API key" },
    { key: "agentId", id: "assemblyai-agent-id", label: "AssemblyAI Agent ID", placeholder: "Your published agent identifier" },
    { key: "tavilyApiKey", id: "tavily-api-key", label: "Tavily API key", placeholder: "Optional, for live web research" },
  ] as const;
  const dirty = fields.some(({ key }) => (draft[key] ?? "") !== (credentials[key] ?? ""));
  return <div className="workspace-sheet settings-view">
    <header><div><h2>Connect your services</h2><p>Save once for this browser tab. Use the eye to check each value.</p></div><KeyRound size={20} aria-hidden="true" /></header>
    <form className="credentials-form" autoComplete="off" onSubmit={(event) => {
      event.preventDefault();
      if (draft.agentId.includes("@")) { setNotice("Agent ID cannot be an email address."); return; }
      const next = { apiKey: draft.apiKey.trim(), agentId: draft.agentId.trim(), tavilyApiKey: draft.tavilyApiKey?.trim() ?? "" };
      onCredentialsChange(next); setDraft(next); setNotice("Credentials saved for this tab.");
    }}>
      {fields.map(({ key, id, label, placeholder }) => <div className="credential-field" key={key}>
        <label htmlFor={id}>{label}</label>
        <div className="secret-field"><input id={id} name={`talkos-${key}`} type={visible[key] ? "text" : "password"} value={draft[key] ?? ""} onChange={(event) => { setDraft({ ...draft, [key]: event.target.value }); setNotice(""); }} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-1p-ignore="true" data-lpignore="true" placeholder={placeholder} />
          <button type="button" aria-label={`${visible[key] ? "Hide" : "Show"} ${label}`} aria-pressed={Boolean(visible[key])} onClick={() => setVisible({ ...visible, [key]: !visible[key] })}>{visible[key] ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </div>)}
      <div className="credentials-actions"><span role="status">{notice || (dirty ? "Unsaved changes" : credentials.apiKey ? "Voice credentials saved" : "Use your keys or development .env settings")}</span>
        <button className="quiet-action" type="button" disabled={!fields.some(({ key }) => draft[key] || credentials[key])} onClick={() => { const empty = { apiKey: "", agentId: "", tavilyApiKey: "" }; setDraft(empty); onCredentialsChange(empty); setNotice("Credentials cleared."); }}><Trash2 size={14} /> Clear</button>
        <button className="primary-action" type="submit" disabled={!dirty}><Save size={14} /> Save credentials</button>
      </div>
    </form>
    <footer className="settings-privacy"><ShieldCheck size={16} /><p>Credentials stay in this browser tab until it closes. Your workspace is saved in this browser. Voice and requested workspace content go to AssemblyAI; research queries and URLs go to Tavily.</p></footer>
    <section className="trash-bin"><header><h3 ref={trashHeadingRef} tabIndex={-1}>Trash <span>{workspace.trash.length}</span></h3><button ref={clearTrashRef} className="quiet-action" type="button" disabled={!workspace.trash.length} aria-expanded={confirmTrash && workspace.trash.length > 0} aria-controls={confirmTrash ? confirmationId : undefined} onClick={() => setConfirmTrash(true)}><Trash2 size={14} /> Clear trash</button></header>
      {confirmTrash && workspace.trash.length ? <div id={confirmationId} className="trash-confirm" role="group" aria-labelledby={`${confirmationId}-title`} aria-describedby={`${confirmationId}-description`} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); cancelRemoval(); } }}>
        <div className="trash-confirm__message"><Trash2 size={20} aria-hidden="true" /><div>
          <h4 id={`${confirmationId}-title`}>Empty Trash?</h4>
          <p id={`${confirmationId}-description`}>{workspace.trash.length} deleted {workspace.trash.length === 1 ? "file" : "files"} will be permanently removed. This cannot be undone.</p>
        </div></div>
        <div className="trash-confirm__actions">
          <button ref={cancelTrashRef} className="trash-confirm__cancel" type="button" onClick={cancelRemoval}>Cancel</button>
          <button className="trash-confirm__remove" type="button" onClick={() => { onChange({ ...workspace, trash: [] }); setConfirmTrash(false); trashHeadingRef.current?.focus(); }}>Remove permanently</button>
        </div>
      </div> : null}
      {workspace.trash.length ? workspace.trash.map((item) => <div key={item.id}><span>{item.artifact.title}</span><button type="button" onClick={() => onChange(restoreTrashedArtifact(workspace, item.id))}><Undo2 size={13} /> Restore</button></div>) : <p className="empty-copy">Trash is empty.</p>}
    </section>
  </div>;
}

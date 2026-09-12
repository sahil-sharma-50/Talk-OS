"use client";

import { HelpCircle, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialSessionState } from "@/features/session/session.fixtures";
import { sessionReducer } from "@/features/session/session.reducer";
import type { SessionEvent, WorkspaceView } from "@/features/session/session.types";
import { createAssemblyAIAdapter } from "@/features/voice/assemblyai-adapter";
import type { VoiceAdapter, VoiceCredentials } from "@/features/voice/voice-adapter.types";
import { emptyVoiceTelemetry, type VoiceTelemetrySnapshot } from "@/features/voice/voice-telemetry";
import type { WorkspaceRuntime } from "@/features/voice/research-tools";
import { createWorkspace, undoLastWorkspaceChange } from "@/features/workspace/workspace-model";
import { loadWorkspace, saveWorkspace } from "@/features/workspace/workspace-storage";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { VoicePanel } from "./VoicePanel";
import { Workspace } from "./Workspace";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface TalkOSAppProps {
  voiceAdapterFactory?: (credentials?: VoiceCredentials, runtime?: WorkspaceRuntime) => VoiceAdapter;
}

export function TalkOSApp({
  voiceAdapterFactory = createAssemblyAIAdapter,
}: TalkOSAppProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [credentials, setCredentialsState] = useState<VoiceCredentials>({ apiKey: "", agentId: "", tavilyApiKey: "" });
  const [workspace, setWorkspaceState] = useState<WorkspaceSnapshot>(() => createWorkspace());
  const [activityOpen, setActivityOpen] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [telemetry, setTelemetry] = useState<VoiceTelemetrySnapshot>(emptyVoiceTelemetry);
  const workspaceRef = useRef(workspace);
  const credentialsRef = useRef(credentials);
  const voiceAdapter = useRef<VoiceAdapter | null>(null);
  const connectingRef = useRef<Promise<VoiceAdapter | null> | null>(null);
  const microphoneStartedRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const workspaceLoadedRef = useRef(false);

  const setCredentials = (next: VoiceCredentials) => { credentialsRef.current = next; setCredentialsState(next); };
  const updateWorkspace = useCallback((next: WorkspaceSnapshot) => {
    workspaceRef.current = next;
    setWorkspaceState(next);
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveWorkspace(next))
      .catch(() => {
        dispatch({ type: "SESSION_ERROR", message: "TalkOS could not save this workspace locally. Export important work before closing the page.", at: new Date().toISOString() });
      });
  }, []);

  useEffect(() => {
    void loadWorkspace().then((saved) => {
      if (saved) {
        workspaceRef.current = saved;
        setWorkspaceState(saved);
        dispatch({ type: "TURNS_HYDRATED", turns: saved.conversation, at: new Date().toISOString() });
      }
      workspaceLoadedRef.current = true;
    }).catch(() => {
      workspaceLoadedRef.current = true;
      dispatch({ type: "SESSION_ERROR", message: "TalkOS could not open the saved workspace. A fresh local workspace is ready.", at: new Date().toISOString() });
    });
  }, []);

  useEffect(() => {
    if (!workspaceLoadedRef.current) return;
    if (JSON.stringify(workspaceRef.current.conversation) === JSON.stringify(state.turns)) return;
    updateWorkspace({ ...workspaceRef.current, conversation: state.turns });
  }, [state.turns, updateWorkspace]);

  useEffect(() => () => {
    void voiceAdapter.current?.disconnect();
  }, []);
  const emit = useCallback((event: SessionEvent) => dispatch(event), []);
  const changeWorkspace = useCallback((nextView: WorkspaceView) => {
    dispatch({ type: "WORKSPACE_CHANGED", workspace: nextView, at: new Date().toISOString() });
  }, []);

  const connectSession = async (withMicrophone: boolean): Promise<VoiceAdapter | null> => {
    if (connectingRef.current) {
      const adapter = await connectingRef.current;
      if (adapter && withMicrophone && !microphoneStartedRef.current) {
        await adapter.startListening();
        microphoneStartedRef.current = true;
      }
      return adapter;
    }
    if (voiceAdapter.current) {
      if (withMicrophone && !microphoneStartedRef.current) {
        await voiceAdapter.current.startListening();
        microphoneStartedRef.current = true;
      }
      return voiceAdapter.current;
    }
    const hasApiKey = Boolean(credentials.apiKey.trim());
    const hasAgentId = Boolean(credentials.agentId.trim());
    if (hasApiKey !== hasAgentId) {
      dispatch({ type: "SESSION_ERROR", message: "Enter both the API key and Agent ID, or leave both blank to use server configuration.", at: new Date().toISOString() });
      changeWorkspace("settings");
      return null;
    }
    if (hasAgentId && credentials.agentId.includes("@")) {
      dispatch({ type: "SESSION_ERROR", message: "The AssemblyAI Agent ID cannot be an email address. Paste the published agent identifier.", at: new Date().toISOString() });
      changeWorkspace("settings");
      return null;
    }
    const completeCredentials = credentials.apiKey.trim() && credentials.agentId.trim() ? credentials : undefined;
    const runtime: WorkspaceRuntime = {
      getWorkspace: () => workspaceRef.current,
      setWorkspace: updateWorkspace,
      getTavilyApiKey: () => credentialsRef.current.tavilyApiKey ?? "",
      setActiveView: changeWorkspace,
    };
    const adapter = voiceAdapterFactory(completeCredentials, runtime);
    voiceAdapter.current = adapter;
    adapter.setLevelListener?.(setAudioLevel);
    adapter.setTelemetryListener?.(setTelemetry);
    const connection = (async () => {
      try {
        await adapter.connect(emit);
        if (withMicrophone) {
          await adapter.startListening();
          microphoneStartedRef.current = true;
        }
        return adapter;
      } catch (error) {
        await adapter.disconnect();
        voiceAdapter.current = null;
        microphoneStartedRef.current = false;
        dispatch({
          type: "SESSION_ERROR",
          message: error instanceof Error ? error.message : "Live voice could not start. Check Settings and try again.",
          at: new Date().toISOString(),
        });
        return null;
      } finally {
        connectingRef.current = null;
      }
    })();
    connectingRef.current = connection;
    return connection;
  };
  const startLive = () => connectSession(true);
  const reset = () => {
    void voiceAdapter.current?.disconnect();
    voiceAdapter.current = null;
    microphoneStartedRef.current = false;
    setAudioLevel(0);
    setTelemetry(emptyVoiceTelemetry);
    dispatch({ type: "SESSION_RESET", at: new Date().toISOString() });
  };
  const stop = () => {
    void voiceAdapter.current?.disconnect();
    voiceAdapter.current = null;
    microphoneStartedRef.current = false;
    setAudioLevel(0);
    setTelemetry(emptyVoiceTelemetry);
    dispatch({ type: "SESSION_STOPPED", at: new Date().toISOString() });
  };
  const undoChange = (changeId: string) => {
    const result = undoLastWorkspaceChange(workspaceRef.current, changeId);
    if (result.ok) updateWorkspace(result.workspace);
    else dispatch({ type: "SESSION_ERROR", message: "That change cannot be undone because one of its files changed again.", at: new Date().toISOString() });
  };

  return (
    <main className="talkos-shell">
      <header className="command-rail">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" focusable="false">
              <path d="M7 11v6M11.5 7.5v13M16 10v8M20.5 8.5v11" />
            </svg>
          </span>
          <h1><span>Talk</span><span>OS</span></h1>
          <span className="brand-tagline">Everyday task workspace</span>
        </div>
        <div className="command-rail__right">
          <ThemeSwitcher />
          <button className="header-button" type="button" onClick={() => changeWorkspace("settings")}>
            <HelpCircle size={16} /> Setup
          </button>
          <button className="header-button" type="button" onClick={reset} aria-label="New session">
            <RotateCcw size={15} /> New session
          </button>
          <button className="stop-button" type="button" onClick={stop} aria-label="Stop session" disabled={!state.connected}>
            <Square size={13} fill="currentColor" /> Stop
          </button>
        </div>
      </header>

      <div className="cockpit">
        <VoicePanel
          state={state}
          onStartLive={() => void startLive()}
          audioLevel={audioLevel}
        />
        <Workspace state={state} workspace={workspace} onWorkspaceChange={changeWorkspace} onWorkspaceDataChange={updateWorkspace} credentials={credentials} onCredentialsChange={setCredentials} telemetry={telemetry} activityOpen={activityOpen} onActivityToggle={() => setActivityOpen((open) => !open)} onUndo={undoChange} />
      </div>
    </main>
  );
}

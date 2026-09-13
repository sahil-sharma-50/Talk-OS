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
import { getWorkspaceSelection, setWorkspaceSelection } from "@/features/workspace/workspace-context";
import { activeWorkspaceArtifact, viewForArtifact } from "@/features/workspace/workspace-navigation";
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
  const [credentials, setCredentialsState] = useState<VoiceCredentials>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("talkos.credentials") || "null");
      if (saved && typeof saved.apiKey === "string" && typeof saved.agentId === "string") return { apiKey: saved.apiKey, agentId: saved.agentId, tavilyApiKey: typeof saved.tavilyApiKey === "string" ? saved.tavilyApiKey : "" };
    } catch { /* The server or browser may not provide session storage. */ }
    return { apiKey: "", agentId: "", tavilyApiKey: "" };
  });
  const [workspace, setWorkspaceState] = useState<WorkspaceSnapshot>(() => createWorkspace());
  const [activityOpen, setActivityOpen] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [microphoneIssue, setMicrophoneIssue] = useState<string | null>(null);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [telemetry, setTelemetry] = useState<VoiceTelemetrySnapshot>(emptyVoiceTelemetry);
  const workspaceRef = useRef(workspace);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const credentialsRef = useRef(credentials);
  const voiceAdapter = useRef<VoiceAdapter | null>(null);
  const connectingRef = useRef<Promise<VoiceAdapter | null> | null>(null);
  const microphoneStartedRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const workspaceLoadedRef = useRef(false);

  const setCredentials = (next: VoiceCredentials) => {
    credentialsRef.current = next; setCredentialsState(next);
    try { sessionStorage.setItem("talkos.credentials", JSON.stringify(next)); } catch { /* Memory still keeps the fields available in this session. */ }
  };
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
    let cancelled = false;
    void loadWorkspace().then((saved) => {
      if (cancelled) return;
      if (saved) {
        workspaceRef.current = saved;
        setWorkspaceState(saved);
        dispatch({ type: "TURNS_HYDRATED", turns: saved.conversation, at: new Date().toISOString() });
      }
      workspaceLoadedRef.current = true;
      setWorkspaceReady(true);
    }).catch(() => {
      if (cancelled) return;
      workspaceLoadedRef.current = true;
      setWorkspaceReady(true);
      dispatch({ type: "SESSION_ERROR", message: "TalkOS could not open the saved workspace. A fresh local workspace is ready.", at: new Date().toISOString() });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workspaceLoadedRef.current) return;
    if (JSON.stringify(workspaceRef.current.conversation) === JSON.stringify(state.turns)) return;
    updateWorkspace({ ...workspaceRef.current, conversation: state.turns });
  }, [state.turns, updateWorkspace]);

  useEffect(() => () => {
    void voiceAdapter.current?.disconnect();
  }, []);
  const emit = useCallback((event: SessionEvent) => {
    if ((event.type === "CONNECTION_CHANGED" && !event.connected) || event.type === "SESSION_STOPPED" || event.type === "SESSION_ERROR") {
      const adapter = voiceAdapter.current;
      voiceAdapter.current = null;
      connectingRef.current = null;
      microphoneStartedRef.current = false;
      setMicrophoneActive(false);
      setAudioLevel(0);
      void adapter?.disconnect();
    }
    dispatch(event);
  }, []);
  const changeWorkspace = useCallback((nextView: WorkspaceView) => {
    if (stateRef.current.activeWorkspace !== nextView) setWorkspaceSelection(null);
    stateRef.current = { ...stateRef.current, activeWorkspace: nextView };
    dispatch({ type: "WORKSPACE_CHANGED", workspace: nextView, at: new Date().toISOString() });
  }, []);

  const startMicrophone = async (adapter: VoiceAdapter) => {
    try {
      await adapter.startListening();
      if (voiceAdapter.current !== adapter) { await adapter.stopListening(); return false; }
      microphoneStartedRef.current = true;
      setMicrophoneActive(true);
      setMicrophoneIssue(null);
      return true;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message = name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone access is blocked. Allow it in browser settings, then try again."
        : name === "NotFoundError" || name === "DevicesNotFoundError"
          ? "No microphone was found. Connect one, then try again."
          : name === "NotReadableError" || name === "TrackStartError"
            ? "The microphone is busy in another app. Close it there, then try again."
            : "The microphone could not start. Check your device and browser permissions, then try again.";
      microphoneStartedRef.current = false;
      setMicrophoneActive(false);
      setMicrophoneIssue(message);
      return false;
    }
  };

  const connectSession = async (): Promise<VoiceAdapter | null> => {
    if (connectingRef.current) {
      const adapter = await connectingRef.current;
      if (adapter && !microphoneStartedRef.current) {
        await startMicrophone(adapter);
      }
      return adapter;
    }
    if (voiceAdapter.current) {
      if (!microphoneStartedRef.current) {
        await startMicrophone(voiceAdapter.current);
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
      getContext: () => {
        const activeView = stateRef.current.activeWorkspace;
        const selection = getWorkspaceSelection();
        const currentSelection = selection && viewForArtifact[selection.kind] === activeView && selection.artifactId === activeWorkspaceArtifact(workspaceRef.current, activeView) ? selection : null;
        return { activeView, selection: currentSelection };
      },
      setActiveView: changeWorkspace,
      setActivityOpen,
      clearActivity: () => clearActivity(),
      downloadFile: ({ fileName, content, mimeType }) => {
        const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    };
    const adapter = voiceAdapterFactory(completeCredentials, runtime);
    voiceAdapter.current = adapter;
    adapter.setLevelListener?.(setAudioLevel);
    adapter.setTelemetryListener?.(setTelemetry);
    const connection = (async () => {
      try {
        await adapter.connect((event) => { if (voiceAdapter.current === adapter) emit(event); });
        if (voiceAdapter.current !== adapter) return null;
        await startMicrophone(adapter);
        return adapter;
      } catch (error) {
        await adapter.disconnect();
        if (voiceAdapter.current !== adapter) return null;
        voiceAdapter.current = null;
        microphoneStartedRef.current = false;
        setMicrophoneActive(false);
        dispatch({
          type: "SESSION_ERROR",
          message: error instanceof Error ? error.message : "Live voice could not start. Check Settings and try again.",
          at: new Date().toISOString(),
        });
        return null;
      } finally {
        if (voiceAdapter.current === adapter || !voiceAdapter.current) connectingRef.current = null;
      }
    })();
    connectingRef.current = connection;
    return connection;
  };
  const startLive = () => connectSession();
  const clearActivity = () => {
    const current = workspaceRef.current;
    updateWorkspace({ ...current, changeHistory: current.changeHistory.filter((change) => change.author !== "agent") });
    dispatch({ type: "ACTIVITIES_CLEARED", at: new Date().toISOString() });
  };
  const reset = () => {
    const adapter = voiceAdapter.current;
    voiceAdapter.current = null;
    connectingRef.current = null;
    void adapter?.disconnect();
    microphoneStartedRef.current = false;
    setMicrophoneActive(false);
    setMicrophoneIssue(null);
    setAudioLevel(0);
    setTelemetry(emptyVoiceTelemetry);
    clearActivity();
    dispatch({ type: "SESSION_RESET", at: new Date().toISOString() });
  };
  const stop = () => {
    const adapter = voiceAdapter.current;
    voiceAdapter.current = null;
    connectingRef.current = null;
    void adapter?.disconnect();
    microphoneStartedRef.current = false;
    setMicrophoneActive(false);
    setMicrophoneIssue(null);
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
          <button className="stop-button" type="button" onClick={stop} aria-label="Stop session" disabled={!state.connected && state.voiceState !== "connecting"}>
            <Square size={13} fill="currentColor" /> Stop
          </button>
        </div>
      </header>

      {!workspaceReady ? <p role="status">Opening your workspace…</p> : null}
      <div className="cockpit" inert={!workspaceReady} aria-busy={!workspaceReady}>
        <VoicePanel
          state={state}
          onStartLive={() => void startLive()}
          microphoneIssue={microphoneIssue}
          microphoneActive={microphoneActive}
          onToggleMicrophone={() => {
            if (!microphoneStartedRef.current) { void connectSession(); return; }
            void voiceAdapter.current?.stopListening();
            microphoneStartedRef.current = false;
            setMicrophoneActive(false);
            setAudioLevel(0);
          }}
          onRetryMicrophone={() => void connectSession()}
          audioLevel={audioLevel}
        />
        <Workspace state={state} workspace={workspace} onWorkspaceChange={changeWorkspace} onWorkspaceDataChange={updateWorkspace} credentials={credentials} onCredentialsChange={setCredentials} telemetry={telemetry} activityOpen={activityOpen} onActivityToggle={() => setActivityOpen((open) => !open)} onUndo={undoChange} onClearActivity={clearActivity} />
      </div>
    </main>
  );
}

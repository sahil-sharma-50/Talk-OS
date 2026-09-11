"use client";

import { Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createDemoController, type DemoController } from "@/features/demo/demo-controller";
import { demoCopy } from "@/features/demo/demo-script";
import { initialSessionState } from "@/features/session/session.fixtures";
import { sessionReducer } from "@/features/session/session.reducer";
import type { SessionEvent, WorkspaceView } from "@/features/session/session.types";
import { VoicePanel } from "./VoicePanel";
import { Workspace } from "./Workspace";

export type ControllerFactory = (emit: (event: SessionEvent) => void) => DemoController;

interface TalkOSAppProps {
  controllerFactory?: ControllerFactory;
}

export function TalkOSApp({ controllerFactory = createDemoController }: TalkOSAppProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [seconds, setSeconds] = useState(0);
  const controller = useRef<DemoController | null>(null);

  useEffect(() => () => controller.current?.dispose(), []);
  useEffect(() => {
    if (!state.connected) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [state.connected]);

  const emit = useCallback((event: SessionEvent) => dispatch(event), []);
  const start = () => {
    controller.current?.dispose();
    dispatch({ type: "SESSION_RESET", at: new Date().toISOString() });
    setSeconds(0);
    controller.current = controllerFactory(emit);
    controller.current.start();
  };
  const interrupt = () => controller.current?.interrupt(demoCopy.interruption);
  const reset = () => {
    controller.current?.dispose();
    controller.current = null;
    setSeconds(0);
    dispatch({ type: "SESSION_RESET", at: new Date().toISOString() });
  };
  const stop = () => {
    controller.current?.dispose();
    controller.current = null;
    dispatch({ type: "SESSION_STOPPED", at: new Date().toISOString() });
  };
  const changeWorkspace = (workspace: WorkspaceView) =>
    dispatch({ type: "WORKSPACE_CHANGED", workspace, at: new Date().toISOString() });

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="talkos-shell">
      <header className="command-rail">
        <div className="brand-lockup">
          <h1>TalkOS</h1>
          <span>Vendor research session</span>
        </div>
        <div className="session-indicator" data-connected={state.connected}>
          <span className="session-indicator__dot" />
          <span>{state.connected ? "Session active" : "Demo ready"}</span>
          <strong>AssemblyAI</strong>
        </div>
        <div className="command-rail__right">
          <span className="demo-badge">Demo data</span>
          <time>{time}</time>
          <Volume2 size={16} aria-label="Audio enabled" />
          <button className="stop-button" type="button" onClick={stop} aria-label="Stop session" disabled={!state.connected}>
            <Square size={13} fill="currentColor" /> Stop
          </button>
        </div>
      </header>

      <div className="cockpit">
        <VoicePanel state={state} onRun={start} onInterrupt={interrupt} onReset={reset} />
        <Workspace state={state} onWorkspaceChange={changeWorkspace} />
      </div>
    </main>
  );
}

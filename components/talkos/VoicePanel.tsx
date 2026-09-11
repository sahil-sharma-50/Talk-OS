import { Mic, Pause, Play, RotateCcw } from "lucide-react";
import type { SessionState } from "@/features/session/session.types";
import { ActivityTimeline } from "./ActivityTimeline";
import { Transcript } from "./Transcript";
import { VoiceOrb } from "./VoiceOrb";

interface VoicePanelProps {
  state: SessionState;
  onRun: () => void;
  onInterrupt: () => void;
  onReset: () => void;
  onStartLive: () => void;
}

export function VoicePanel({ state, onRun, onInterrupt, onReset, onStartLive }: VoicePanelProps) {
  const active = state.connected || state.activities.some((item) => item.status === "active");

  return (
    <aside className="voice-panel">
      <VoiceOrb state={state.voiceState} />
      <Transcript turns={state.turns} partialTranscript={state.partialTranscript} />

      <section className="mission" aria-label="Current research brief">
        <h2>Current objective</h2>
        <p>{state.objective ?? "Compare two vendors with evidence you can inspect."}</p>
        <div className="constraint-list">
          <span>Constraints</span>
          {state.constraints.length ? (
            state.constraints.map((constraint) => <strong key={constraint}>{constraint}</strong>)
          ) : (
            <small>Speak naturally. Redirect at any time.</small>
          )}
        </div>
      </section>

      <ActivityTimeline activities={state.activities} planRevision={state.planRevision} />

      {state.error ? <p className="voice-error" role="alert">{state.error}</p> : null}

      <div className="voice-controls">
        <button className="button button--primary" type="button" onClick={onRun} disabled={active}>
          <Play size={16} fill="currentColor" />
          Run the demo
        </button>
        <button className="button button--live" type="button" onClick={onStartLive} disabled={active}>
          <Mic size={16} />
          Start live voice
        </button>
        <button className="button button--interrupt" type="button" onClick={onInterrupt} disabled={!active}>
          <Pause size={16} fill="currentColor" />
          Interrupt agent
        </button>
        <button className="icon-button" type="button" onClick={onReset} aria-label="Reset demo">
          <RotateCcw size={17} />
        </button>
      </div>
    </aside>
  );
}

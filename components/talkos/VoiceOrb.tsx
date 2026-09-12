import type { VoiceState } from "@/features/session/session.types";

const stateCopy: Record<VoiceState, string> = {
  idle: "Start voice",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  acting: "Working",
  speaking: "Speaking",
  interrupted: "Redirecting",
  error: "Needs attention",
};

const stateHint: Record<VoiceState, string> = {
  idle: "Tap to begin",
  connecting: "Opening a secure session",
  listening: "Speak naturally",
  thinking: "Understanding your request",
  acting: "Updating your workspace",
  speaking: "You can interrupt at any time",
  interrupted: "Your correction comes first",
  error: "Tap to try again",
};

export function VoiceOrb({ state, onStart, level = 0 }: { state: VoiceState; onStart: () => void; level?: number }) {
  const isActive = !["idle", "error"].includes(state);

  return (
    <section className="voice-state" data-state={state} aria-live="polite" style={{ "--voice-level": level.toFixed(3) } as React.CSSProperties}>
      <button className="voice-agent" type="button" onClick={onStart} disabled={isActive} aria-label={isActive ? `Voice agent ${stateCopy[state]}` : "Start voice agent"}>
        <span className="voice-sphere" aria-hidden="true">
          <span className="voice-sphere__ring" />
          <span className="voice-sphere__core" />
          <span className="voice-sphere__signal">
            <i /><i /><i />
          </span>
        </span>
        <span className="voice-agent__copy">
          <strong>{stateCopy[state]}</strong>
          <small>{stateHint[state]}</small>
        </span>
      </button>
    </section>
  );
}

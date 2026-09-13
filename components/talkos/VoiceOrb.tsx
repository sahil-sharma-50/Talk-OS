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

export function VoiceOrb({ state, onStart, level = 0, microphoneBlocked = false }: { state: VoiceState; onStart: () => void; level?: number; microphoneBlocked?: boolean }) {
  const isActive = !["idle", "error"].includes(state);
  const title = microphoneBlocked && state === "listening" ? "Agent ready" : stateCopy[state];
  const hint = microphoneBlocked && state === "listening" ? "Type below to continue" : stateHint[state];

  return (
    <section className="voice-state" data-state={state} aria-live="polite" style={{ "--voice-level": level.toFixed(3) } as React.CSSProperties}>
      <button className="voice-agent" type="button" onClick={onStart} disabled={isActive} aria-label={isActive ? `Voice agent ${title}` : "Start voice agent"}>
        <span className="voice-orb" aria-hidden="true">
          <span className="voice-orb__aura" />
          <span className="voice-orb__shape"><i /><i /></span>
          <span className="voice-orb__signal"><i /><i /><i /></span>
        </span>
        <span className="voice-agent__copy">
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
      </button>
    </section>
  );
}

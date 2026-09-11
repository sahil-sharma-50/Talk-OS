import { Mic, Radio } from "lucide-react";
import type { VoiceState } from "@/features/session/session.types";

const stateCopy: Record<VoiceState, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  acting: "Researching",
  speaking: "Speaking",
  interrupted: "Interrupted",
  error: "Needs attention",
};

export function VoiceOrb({ state }: { state: VoiceState }) {
  const isActive = !["idle", "error"].includes(state);

  return (
    <section className="voice-state" data-state={state} aria-live="polite">
      <div className="voice-state__icon" aria-hidden="true">
        {isActive ? <Mic size={29} strokeWidth={1.8} /> : <Radio size={27} strokeWidth={1.7} />}
      </div>
      <div className="voice-state__body">
        <p className="voice-state__label">{stateCopy[state]}</p>
        <div className="waveform" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ "--bar": index } as React.CSSProperties} />
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import type { SessionState } from "@/features/session/session.types";
import { LiveTranscript } from "./LiveTranscript";
import { Transcript } from "./Transcript";
import { VoiceOrb } from "./VoiceOrb";

interface VoicePanelProps {
  state: SessionState;
  onStartLive: () => void;
  audioLevel?: number;
}

export function VoicePanel({ state, onStartLive, audioLevel = 0 }: VoicePanelProps) {
  return <aside className="voice-panel" aria-label="TalkOS agent">
    <VoiceOrb state={state.voiceState} onStart={onStartLive} level={audioLevel} />
    {state.error ? <p className="voice-error" role="alert">{state.error}</p> : null}
    <LiveTranscript partialTranscript={state.partialTranscript} latestTurn={state.turns.at(-1) ?? null} voiceState={state.voiceState} />
    <Transcript turns={state.turns} partialTranscript={state.partialTranscript} />
  </aside>;
}

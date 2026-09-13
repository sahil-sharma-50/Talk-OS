"use client";

import { Mic, MicOff } from "lucide-react";
import type { SessionState } from "@/features/session/session.types";
import { LatestExchange } from "./LatestExchange";
import { Transcript } from "./Transcript";
import { VoiceOrb } from "./VoiceOrb";

interface VoicePanelProps {
  state: SessionState;
  onStartLive: () => void;
  microphoneIssue?: string | null;
  microphoneActive?: boolean;
  onToggleMicrophone?: () => void;
  onRetryMicrophone?: () => void;
  audioLevel?: number;
}

export function VoicePanel({ state, onStartLive, microphoneIssue, microphoneActive = true, onToggleMicrophone, onRetryMicrophone, audioLevel = 0 }: VoicePanelProps) {
  const micOn = microphoneActive && !microphoneIssue;
  const MicrophoneIcon = micOn ? Mic : MicOff;
  return <aside className="voice-panel" data-agent-state={state.voiceState} aria-label="TalkOS agent">
    <VoiceOrb state={state.voiceState} onStart={onStartLive} level={audioLevel} microphoneBlocked={Boolean(microphoneIssue) || !microphoneActive} />
    {state.connected && onToggleMicrophone ? <button className="microphone-toggle" data-state={microphoneIssue ? "blocked" : micOn ? "on" : "off"} type="button" aria-label={micOn ? "Mute microphone" : "Enable microphone"} title={micOn ? "Microphone is on · Click to mute" : microphoneIssue ? "Allow microphone access to continue" : "Microphone is muted · Click to unmute"} onClick={onToggleMicrophone}>
      <span className="microphone-toggle__icon" aria-hidden="true"><MicrophoneIcon size={17} strokeWidth={1.8} /></span>
      <span className="microphone-toggle__state">{microphoneIssue ? "Blocked" : micOn ? "Mic on" : "Muted"}</span>
      <span className="microphone-toggle__action" aria-hidden="true">{micOn ? "Mute" : microphoneIssue ? "Enable" : "Unmute"}</span>
    </button> : null}
    {state.error ? <p className="voice-error" role="alert">{state.error}</p> : null}
    {microphoneIssue ? <div className="microphone-notice" role="status">
      <MicOff size={17} aria-hidden="true" />
      <p>{microphoneIssue}</p>
      <button type="button" onClick={onRetryMicrophone}>Try microphone again</button>
    </div> : null}
    <LatestExchange partialTranscript={state.partialTranscript} turns={state.turns} voiceState={state.voiceState} speechCaption={state.speechCaption} />
    <Transcript turns={state.turns} partialTranscript={state.partialTranscript} />
  </aside>;
}

"use client";

import { MicOff, SendHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { SessionState } from "@/features/session/session.types";
import { LatestExchange } from "./LatestExchange";
import { Transcript } from "./Transcript";
import { VoiceOrb } from "./VoiceOrb";

interface VoicePanelProps {
  state: SessionState;
  onStartLive: () => void;
  microphoneIssue?: string | null;
  onRetryMicrophone?: () => void;
  onSubmitText?: (text: string) => void;
  audioLevel?: number;
}

export function VoicePanel({ state, onStartLive, microphoneIssue, onRetryMicrophone, onSubmitText, audioLevel = 0 }: VoicePanelProps) {
  const [message, setMessage] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = message.trim();
    if (!next) return;
    onSubmitText?.(next);
    setMessage("");
  };

  return <aside className="voice-panel" aria-label="TalkOS agent">
    <VoiceOrb state={state.voiceState} onStart={onStartLive} level={audioLevel} microphoneBlocked={Boolean(microphoneIssue)} />
    {state.error ? <p className="voice-error" role="alert">{state.error}</p> : null}
    {microphoneIssue ? <div className="microphone-notice" role="status">
      <MicOff size={17} aria-hidden="true" />
      <p>{microphoneIssue}</p>
      <button type="button" onClick={onRetryMicrophone}>Try microphone again</button>
    </div> : null}
    <LatestExchange partialTranscript={state.partialTranscript} turns={state.turns} />
    {state.connected && onSubmitText ? <form className="agent-composer" onSubmit={submit}>
      <input
        aria-label="Message TalkOS"
        placeholder="Message TalkOS…"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <button type="submit" aria-label="Send message" disabled={!message.trim()}>
        <SendHorizontal size={16} aria-hidden="true" />
      </button>
    </form> : null}
    <Transcript turns={state.turns} partialTranscript={state.partialTranscript} />
  </aside>;
}

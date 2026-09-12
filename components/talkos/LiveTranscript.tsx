import type { ConversationTurn, SessionState, VoiceState } from "@/features/session/session.types";

const emptyCopy: Record<VoiceState, string> = {
  idle: "Tap the voice circle and start talking.",
  connecting: "Opening a secure AssemblyAI session.",
  listening: "Listening for your request.",
  thinking: "Understanding your request.",
  acting: "Working in your workspace.",
  speaking: "Preparing a response.",
  interrupted: "Listening for your correction.",
  error: "Reconnect to continue the conversation.",
};

interface LiveTranscriptProps {
  partialTranscript: SessionState["partialTranscript"];
  latestTurn: ConversationTurn | null;
  voiceState: VoiceState;
}

export function LiveTranscript({ partialTranscript, latestTurn, voiceState }: LiveTranscriptProps) {
  const exchange = partialTranscript ?? latestTurn;

  return (
    <section className="live-transcript" aria-label="Live voice transcript" aria-live="polite">
      <header>
        <span className="live-transcript__speaker">
          {exchange ? (exchange.speaker === "user" ? "You" : "TalkOS") : "Ready when you are"}
        </span>
        {partialTranscript ? <span className="live-transcript__live"><i aria-hidden="true" /> Live</span> : null}
      </header>
      <p>{exchange?.text ?? emptyCopy[voiceState]}</p>
    </section>
  );
}

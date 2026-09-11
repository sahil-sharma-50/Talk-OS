import type { SessionState } from "@/features/session/session.types";

export function Transcript({ turns, partialTranscript }: Pick<SessionState, "turns" | "partialTranscript">) {
  const visibleTurns = turns.slice(-4);

  return (
    <section className="transcript" aria-label="Conversation transcript">
      <div className="section-heading">
        <h2>Conversation</h2>
        <span>{turns.length} turns</span>
      </div>
      <div className="transcript__scroll" aria-live="polite">
        {visibleTurns.length === 0 && !partialTranscript ? (
          <p className="empty-copy">Your live transcript will appear here.</p>
        ) : null}
        {visibleTurns.map((turn) => (
          <article className="turn" data-speaker={turn.speaker} key={turn.id}>
            <p className="turn__speaker">{turn.speaker === "user" ? "You" : "TalkOS"}</p>
            <p>{turn.text}</p>
          </article>
        ))}
        {partialTranscript ? (
          <article className="turn turn--partial" data-speaker={partialTranscript.speaker}>
            <p className="turn__speaker">Hearing now</p>
            <p>{partialTranscript.text}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

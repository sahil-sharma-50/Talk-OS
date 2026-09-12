import type { SessionState } from "@/features/session/session.types";

type LatestExchangeProps = Pick<SessionState, "partialTranscript" | "turns">;

export function LatestExchange({ partialTranscript, turns }: LatestExchangeProps) {
  const latestUserIndex = turns.map((turn) => turn.speaker).lastIndexOf("user");
  const latestUser = latestUserIndex >= 0 ? turns[latestUserIndex] : null;
  const latestAgent = turns
    .slice(latestUserIndex + 1)
    .filter((turn) => turn.speaker === "agent")
    .at(-1) ?? null;

  const userMessage = partialTranscript?.speaker === "user" ? partialTranscript : latestUser;
  const agentMessage = partialTranscript?.speaker === "agent"
    ? partialTranscript
    : partialTranscript?.speaker === "user"
      ? null
      : latestAgent;

  return (
    <section className="latest-exchange" data-empty={!userMessage && !agentMessage || undefined} aria-label="Latest conversation" aria-live="polite">
      {userMessage ? (
        <article className="exchange-message" data-speaker="user" data-partial={partialTranscript?.speaker === "user" || undefined} aria-label="You">
          <p>{userMessage.text}</p>
        </article>
      ) : null}
      {agentMessage ? (
        <article className="exchange-message" data-speaker="agent" data-partial={partialTranscript?.speaker === "agent" || undefined} aria-label="TalkOS">
          <p>{agentMessage.text}</p>
        </article>
      ) : null}
    </section>
  );
}

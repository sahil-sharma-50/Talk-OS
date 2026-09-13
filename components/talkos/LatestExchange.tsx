"use client";
import { ArrowDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SessionState, SpeechCaption } from "@/features/session/session.types";

type LatestExchangeProps = Pick<SessionState, "partialTranscript" | "turns"> & { voiceState?: SessionState["voiceState"]; speechCaption?: SpeechCaption | null };

function followCaption(element: HTMLElement) {
  if (element.scrollHeight - element.clientHeight - element.scrollTop <= 4) return;
  // Repeated smooth scrolls restart their animation at every spoken word and
  // leave the highlight behind. The word animates; its viewport follows now.
  if (element.scrollTo) element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
  else element.scrollTop = element.scrollHeight;
}

function SpeechStatus({ voiceState, compact = false }: { voiceState?: SessionState["voiceState"]; compact?: boolean }) {
  return <div className="agent-writing" role="status"><span aria-hidden="true"><i /><i /><i /></span>{voiceState === "acting" ? "Updating your workspace" : voiceState === "thinking" ? "Thinking through your request" : compact ? "Speaking" : "Speaking · Live captions"}</div>;
}

function ReplyCaption({ text, caption, partial, live, voiceState }: { text: string; caption?: SpeechCaption | null; partial: boolean; live: boolean; voiceState?: SessionState["voiceState"] }) {
  const replyRef = useRef<HTMLElement>(null);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => { if (following && replyRef.current) followCaption(replyRef.current); }, [text, following]);
  useEffect(() => {
    const element = replyRef.current;
    if (!element || !following || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => followCaption(element));
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [following]);
  const pause = () => {
    const element = replyRef.current;
    if (!element || element.scrollHeight <= element.clientHeight) return;
    // Cancel an in-flight smooth scroll so a manual scroll always wins.
    element.scrollTo?.({ top: element.scrollTop, behavior: "instant" });
    setFollowing(false);
  };
  const active = caption && caption.activeEnd > caption.activeStart;
  return <>
    <article ref={replyRef} className="exchange-message" tabIndex={0} data-speaker="agent" data-partial={partial || undefined} data-timed={Boolean(caption)} aria-label="TalkOS"
      onWheel={event => { if (event.deltaY < 0) pause(); }} onTouchStart={pause} onPointerDown={pause}
      onKeyDown={event => { if (["ArrowUp", "PageUp", "Home"].includes(event.key)) pause(); if (event.key === "End") setFollowing(true); }}
      onScroll={event => { const el = event.currentTarget; if (!following && el.scrollHeight - el.clientHeight - el.scrollTop <= 4) setFollowing(true); }}>
      <p>{active ? <>{text.slice(0, caption.activeStart)}<mark key={`${caption.activeStart}-${caption.activeEnd}`} className="caption-word">{text.slice(caption.activeStart, caption.activeEnd)}</mark>{text.slice(caption.activeEnd)}</> : text}</p>
    </article>
    {live ? <div className="caption-footer"><SpeechStatus voiceState={voiceState} compact={!following} />{!following ? <button type="button" className="caption-follow" onClick={() => setFollowing(true)}><ArrowDown size={13} aria-hidden="true" />Follow voice</button> : null}</div> : null}
  </>;
}

export function LatestExchange({ partialTranscript, turns, voiceState, speechCaption }: LatestExchangeProps) {
  const latestUserIndex = turns.map((turn) => turn.speaker).lastIndexOf("user");
  const latestUser = latestUserIndex >= 0 ? turns[latestUserIndex] : null;
  let requestStart = latestUserIndex;
  // Older sessions saved each phrase separately; request-* turns already hold
  // the complete utterance, even when an interrupted reply never finalized.
  while (!latestUser?.id.startsWith("request-") && requestStart > 0 && turns[requestStart - 1].speaker === "user") requestStart -= 1;
  const savedRequest = latestUser ? turns.slice(requestStart, latestUserIndex + 1).map(turn => turn.text).join(" ") : null;
  const latestAgent = turns
    .slice(latestUserIndex + 1)
    .filter((turn) => turn.speaker === "agent")
    .at(-1) ?? null;

  const userText = partialTranscript?.speaker === "user" ? partialTranscript.text : savedRequest;
  const agentMessage = partialTranscript?.speaker === "agent"
    ? partialTranscript
    : partialTranscript?.speaker === "user"
      ? null
      : latestAgent;
  const caption = partialTranscript?.speaker === "user" || voiceState === "interrupted" ? null : speechCaption;
  const replyId = caption?.turnId ?? (agentMessage && ("id" in agentMessage ? agentMessage.id : agentMessage.turnId));
  const replyText = caption?.text ?? agentMessage?.text;
  const live = Boolean(caption) || partialTranscript?.speaker === "agent" || voiceState === "speaking";
  const showStatus = live || voiceState === "thinking" || voiceState === "acting";

  return (
    <section className="latest-exchange" data-empty={!userText && replyText === undefined && !showStatus || undefined} data-live={live} aria-label="Latest conversation" aria-live={live ? "off" : "polite"}>
      {userText ? (
        <article key={latestUser?.id ?? "speaking"} className="exchange-message" tabIndex={0} data-speaker="user" data-partial={partialTranscript?.speaker === "user" || undefined} aria-label="You">
          <p>{userText}</p>
        </article>
      ) : null}
      {replyText !== undefined ? <ReplyCaption key={replyId} text={replyText} caption={caption} partial={partialTranscript?.speaker === "agent"} live={showStatus} voiceState={voiceState} /> : showStatus ? <SpeechStatus voiceState={voiceState} /> : null}
    </section>
  );
}

"use client";

import { ChevronUp, ChevronDown, History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SessionState } from "@/features/session/session.types";

export function Transcript({ turns, partialTranscript }: Pick<SessionState, "turns" | "partialTranscript">) {
  const [historyState, setHistoryState] = useState<"closed" | "open" | "closing">("closed");
  const historyOpen = historyState === "open";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => { setHistoryState("closing"); triggerRef.current?.focus(); };
  useEffect(() => {
    if (!historyOpen) return;
    closeRef.current?.focus();
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") { setHistoryState("closing"); triggerRef.current?.focus(); } };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [historyOpen]);
  const turn = (item: SessionState["turns"][number]) => <article className="turn" data-speaker={item.speaker} key={item.id}><p className="turn__speaker">{item.speaker === "user" ? "You" : "TalkOS"}</p><p>{item.text}</p></article>;

  return <section className="history-hub" aria-label="Conversation controls">
    <button ref={triggerRef} className="history-toggle" type="button" onClick={() => setHistoryState("open")} aria-expanded={historyOpen} aria-controls={historyState !== "closed" ? "conversation-history" : undefined}>
      <span><History size={16} /> History</span>
      <span className="history-toggle__meta">{turns.length ? `${turns.length} entries` : "All conversations"} <ChevronUp size={15} /></span>
    </button>
    {historyState !== "closed" ? <aside id="conversation-history" className="history-drawer" aria-label="Conversation history" data-state={historyState} aria-hidden={historyState === "closing"} inert={historyState === "closing"} onAnimationEnd={(event) => { if (event.currentTarget === event.target && historyState === "closing") setHistoryState("closed"); }}><header><strong>Conversation history</strong><button ref={closeRef} type="button" onClick={close} aria-label="Close history"><ChevronDown size={17} /></button></header><div aria-live="polite">{turns.length ? turns.map(turn) : <p className="empty-copy">Your conversation will appear here once you start talking.</p>}{partialTranscript ? <article className="turn turn--partial" data-speaker={partialTranscript.speaker}><p className="turn__speaker">Hearing now</p><p>{partialTranscript.text}</p></article> : null}</div></aside> : null}
  </section>;
}

"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
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
  const sectionRef = useRef<HTMLElement>(null);
  const orbRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const motionAllowedRef = useRef(true);
  const resetPointer = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sectionRef.current?.style.setProperty("--orb-x", "0");
    sectionRef.current?.style.setProperty("--orb-y", "0");
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let inView = true;
    const updateMotion = () => {
      const paused = document.hidden || !inView || Boolean(reducedMotion?.matches);
      section.dataset.motionPaused = String(paused);
      motionAllowedRef.current = !paused;
      if (paused) resetPointer();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateMotion();
    });
    observer?.observe(orbRef.current ?? section);
    reducedMotion?.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    updateMotion();
    return () => {
      observer?.disconnect();
      reducedMotion?.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateMotion);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [resetPointer]);

  const followPointer = (event: PointerEvent<HTMLElement>) => {
    if (!motionAllowedRef.current || event.pointerType === "touch") return;
    const bounds = orbRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    const y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) { resetPointer(); return; }
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      sectionRef.current?.style.setProperty("--orb-x", (x * 6).toFixed(2));
      sectionRef.current?.style.setProperty("--orb-y", (y * 6).toFixed(2));
      frameRef.current = null;
    });
  };
  const isActive = !["idle", "error"].includes(state);
  const title = microphoneBlocked && state === "listening" ? "Agent ready" : stateCopy[state];
  const hint = microphoneBlocked && state === "listening" ? "Enable your microphone to continue" : stateHint[state];

  return (
    <section ref={sectionRef} className="voice-state" data-state={state} aria-live="polite" onPointerMove={followPointer} onPointerLeave={resetPointer} onPointerCancel={resetPointer} style={{ "--voice-level": level.toFixed(3) } as CSSProperties}>
      <button className="voice-agent" type="button" onClick={onStart} disabled={isActive} aria-label={isActive ? `Voice agent ${title}` : "Start voice agent"}>
        <span ref={orbRef} className="voice-orb" aria-hidden="true">
          <span className="voice-orb__motion">
            <span className="voice-orb__aura" />
            <span className="voice-orb__shape"><i /><i /></span>
            <span className="voice-orb__signal"><i /><i /><i /></span>
          </span>
        </span>
        <span className="voice-agent__copy">
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
      </button>
    </section>
  );
}

import type { SessionEvent } from "@/features/session/session.types";
import { createDecisionBrief, vendorEvidence } from "./vendor-evidence";
import { demoCopy, originalPlan, revisedPlan } from "./demo-script";

export interface DemoController {
  start(): void;
  interrupt(constraint?: string): void;
  finish(): void;
  dispose(): void;
}

type Emit = (event: SessionEvent) => void;
type Scheduler = {
  set(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clear(handle: ReturnType<typeof setTimeout>): void;
};

const browserScheduler: Scheduler = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (handle) => clearTimeout(handle),
};

export function createDemoController(
  emit: Emit,
  scheduler: Scheduler = browserScheduler,
): DemoController {
  let handles: Array<ReturnType<typeof setTimeout>> = [];
  let disposed = false;
  let started = false;

  const now = () => new Date().toISOString();
  const send = (event: SessionEvent) => {
    if (!disposed) emit(event);
  };
  const later = (delay: number, factory: () => SessionEvent) => {
    const handle = scheduler.set(() => send(factory()), delay);
    handles.push(handle);
  };
  const cancelPending = () => {
    handles.forEach((handle) => scheduler.clear(handle));
    handles = [];
  };

  const emitFinishedResearch = () => {
    vendorEvidence.forEach((evidence) =>
      send({ type: "EVIDENCE_ADDED", evidence, at: now() }),
    );
    send({
      type: "ACTION_COMPLETED",
      actionId: "research-official",
      detail: "4 official findings captured",
      at: now(),
    });
    send({
      type: "ACTION_STARTED",
      action: {
        id: "write-brief",
        label: "Writing decision brief",
        detail: "Comparing cost and compliance",
        status: "active",
        at: now(),
      },
      at: now(),
    });
    send({ type: "BRIEF_WRITTEN", brief: createDecisionBrief(now()), at: now() });
    send({ type: "ACTION_COMPLETED", actionId: "write-brief", at: now() });
    send({
      type: "TALK_TURN_FINALIZED",
      speaker: "agent",
      text: demoCopy.recommendation,
      at: now(),
    });
    send({ type: "VOICE_STATE_CHANGED", voiceState: "idle", at: now() });
  };

  return {
    start() {
      if (started || disposed) return;
      started = true;
      send({ type: "CONNECTION_CHANGED", connected: true, mode: "demo", at: now() });
      send({ type: "VOICE_STATE_CHANGED", voiceState: "listening", at: now() });
      later(350, () => ({
        type: "TRANSCRIPT_PARTIAL",
        speaker: "user",
        text: "Compare Supabase and Firebase…",
        at: now(),
      }));
      later(900, () => ({
        type: "TALK_TURN_FINALIZED",
        speaker: "user",
        text: demoCopy.objective,
        at: now(),
      }));
      later(920, () => ({ type: "OBJECTIVE_SET", objective: demoCopy.objective, at: now() }));
      later(1050, () => ({ type: "VOICE_STATE_CHANGED", voiceState: "thinking", at: now() }));
      later(1350, () => ({ type: "PLAN_SET", plan: originalPlan, at: now() }));
      later(1550, () => ({
        type: "TALK_TURN_FINALIZED",
        speaker: "agent",
        text: demoCopy.acknowledgement,
        at: now(),
      }));
      later(1750, () => ({
        type: "ACTION_STARTED",
        action: {
          id: "search-initial",
          label: "Scanning the open web",
          detail: "Supabase vs Firebase comparison",
          status: "active",
          at: now(),
        },
        at: now(),
      }));
      later(3600, () => ({
        type: "ACTION_COMPLETED",
        actionId: "search-initial",
        detail: "Broad comparison collected",
        at: now(),
      }));
    },

    interrupt(constraint = demoCopy.interruption) {
      if (disposed) return;
      cancelPending();
      send({ type: "INTERRUPTED", actionId: "search-initial", constraint, at: now() });
      send({ type: "TALK_TURN_FINALIZED", speaker: "user", text: constraint, at: now() });
      send({ type: "PLAN_SET", plan: revisedPlan, revised: true, at: now() });
      later(450, () => ({
        type: "TALK_TURN_FINALIZED",
        speaker: "agent",
        text: demoCopy.revisionAcknowledgement,
        at: now(),
      }));
      later(700, () => ({
        type: "ACTION_STARTED",
        action: {
          id: "research-official",
          label: "Checking official sources",
          detail: "Pricing and compliance only",
          status: "active",
          at: now(),
        },
        at: now(),
      }));
      vendorEvidence.forEach((evidence, index) =>
        later(1300 + index * 500, () => ({ type: "EVIDENCE_ADDED", evidence, at: now() })),
      );
      later(3500, () => ({
        type: "ACTION_COMPLETED",
        actionId: "research-official",
        detail: "4 official findings captured",
        at: now(),
      }));
      later(3750, () => ({
        type: "ACTION_STARTED",
        action: {
          id: "write-brief",
          label: "Writing decision brief",
          detail: "Comparing cost and compliance",
          status: "active",
          at: now(),
        },
        at: now(),
      }));
      later(4550, () => ({ type: "BRIEF_WRITTEN", brief: createDecisionBrief(now()), at: now() }));
      later(4575, () => ({ type: "ACTION_COMPLETED", actionId: "write-brief", at: now() }));
      later(4750, () => ({
        type: "TALK_TURN_FINALIZED",
        speaker: "agent",
        text: demoCopy.recommendation,
        at: now(),
      }));
      later(5000, () => ({ type: "VOICE_STATE_CHANGED", voiceState: "idle", at: now() }));
    },

    finish() {
      if (disposed) return;
      cancelPending();
      send({ type: "OBJECTIVE_SET", objective: demoCopy.objective, at: now() });
      send({ type: "PLAN_SET", plan: revisedPlan, revised: true, at: now() });
      send({
        type: "ACTION_STARTED",
        action: {
          id: "research-official",
          label: "Checking official sources",
          detail: "Pricing and compliance only",
          status: "active",
          at: now(),
        },
        at: now(),
      });
      emitFinishedResearch();
    },

    dispose() {
      cancelPending();
      disposed = true;
    },
  };
}

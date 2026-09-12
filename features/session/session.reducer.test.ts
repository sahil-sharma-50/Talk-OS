import { describe, expect, it } from "vitest";
import { decisionBrief, initialSessionState } from "./session.fixtures";
import { sessionReducer } from "./session.reducer";
import type { Activity, SessionEvent, SessionState } from "./session.types";

const at = "2026-09-12T12:00:00.000Z";

function reduce(events: SessionEvent[]): SessionState {
  return events.reduce(sessionReducer, initialSessionState);
}

function action(id: string, label: string): Activity {
  return { id, label, detail: "", status: "active", at };
}

describe("sessionReducer", () => {
  it("interrupts the active action and rejects its stale completion", () => {
    const acting = reduce([
      { type: "ACTION_STARTED", action: action("search-1", "Searching provider docs"), at },
      {
        type: "INTERRUPTED",
        actionId: "search-1",
        constraint: "Use official sources only",
        at,
      },
    ]);

    const stale = sessionReducer(acting, { type: "ACTION_COMPLETED", actionId: "search-1", at });

    expect(stale.activities.find((item) => item.id === "search-1")?.status).toBe("interrupted");
    expect(stale.constraints).toContain("Use official sources only");
    expect(stale.invalidatedActionIds).toContain("search-1");
    expect(stale.voiceState).toBe("interrupted");
  });

  it("stores evidence and activates Documents when a brief is written", () => {
    const state = sessionReducer(initialSessionState, {
      type: "BRIEF_WRITTEN",
      brief: decisionBrief,
      at,
    });

    expect(state.activeWorkspace).toBe("documents");
    expect(state.notesHasUpdate).toBe(true);
    expect(state.brief?.recommendation).toMatch(/Supabase/);
  });

  it("keeps a partial transcript separate and clears it on finalization", () => {
    const state = reduce([
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Compare Supa", at },
      { type: "TALK_TURN_FINALIZED", speaker: "user", text: "Compare Supabase", at },
    ]);

    expect(state.partialTranscript).toBeNull();
    expect(state.turns).toEqual([
      expect.objectContaining({ speaker: "user", text: "Compare Supabase" }),
    ]);
  });

  it("ignores empty finalized turns", () => {
    const state = sessionReducer(initialSessionState, {
      type: "TALK_TURN_FINALIZED",
      speaker: "user",
      text: "   ",
      at,
    });

    expect(state.turns).toHaveLength(0);
  });

  it("marks active work interrupted before redirect text is final", () => {
    const active = sessionReducer(initialSessionState, {
      type: "ACTION_STARTED",
      action: action("call-1", "Drafting a launch plan"),
      at,
    });
    const interrupted = sessionReducer(active, {
      type: "INTERRUPTION_STARTED",
      actionId: "call-1",
      at,
    });

    expect(interrupted.voiceState).toBe("interrupted");
    expect(interrupted.invalidatedActionIds).toContain("call-1");
    expect(interrupted.activities.find((item) => item.id === "call-1")?.status).toBe("interrupted");
    expect(interrupted.constraints).toEqual([]);
  });

  it("accumulates transcript fragments from the same speaker", () => {
    const state = reduce([
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Wait", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: ", target developers", at },
    ]);

    expect(state.partialTranscript).toEqual({
      speaker: "user",
      text: "Wait, target developers",
    });
  });

  it("keeps word deltas readable without adding spaces before punctuation", () => {
    const state = reduce([
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "Hi,", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "I'm", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "your", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "TalkOS", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "agent", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: ".", at },
    ]);

    expect(state.partialTranscript?.text).toBe("Hi, I'm your TalkOS agent.");
  });

  it("replaces cumulative user transcript partials instead of duplicating them", () => {
    const state = reduce([
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Plan", replace: true, at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Plan my", replace: true, at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Plan my week", replace: true, at },
    ]);

    expect(state.partialTranscript).toEqual({ speaker: "user", text: "Plan my week" });
  });

  it("starts a new partial transcript when the speaker changes", () => {
    const state = reduce([
      { type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Build it", at },
      { type: "TRANSCRIPT_PARTIAL", speaker: "agent", text: "I will", at },
    ]);

    expect(state.partialTranscript).toEqual({ speaker: "agent", text: "I will" });
  });

  it("hydrates saved conversation turns without replaying events", () => {
    const turns = [{ id: "saved-turn", speaker: "agent" as const, text: "Welcome back", at }];
    const state = sessionReducer(initialSessionState, { type: "TURNS_HYDRATED", turns, at });
    expect(state.turns).toEqual(turns);
  });
});

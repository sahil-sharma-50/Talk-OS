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

  it("stores evidence and activates Notes when a brief is written", () => {
    const state = sessionReducer(initialSessionState, {
      type: "BRIEF_WRITTEN",
      brief: decisionBrief,
      at,
    });

    expect(state.activeWorkspace).toBe("notes");
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
});

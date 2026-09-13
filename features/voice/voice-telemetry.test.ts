import { describe, expect, it } from "vitest";
import { emptyVoiceTelemetry, recordVoiceTelemetry } from "./voice-telemetry";

describe("recordVoiceTelemetry", () => {
  it("keeps event identifiers unique when word deltas arrive in the same millisecond", () => {
    const state = Array.from({ length: 80 }).reduce<typeof emptyVoiceTelemetry>((current) => recordVoiceTelemetry(current, { type: "transcript.agent.delta", delta: "word" }, 1000), emptyVoiceTelemetry);
    expect(new Set(state.events.map((event) => event.id)).size).toBe(40);
  });
  it("measures response at audible playback, ignoring tool replies and repeated audio", () => {
    let state = emptyVoiceTelemetry;
    state = recordVoiceTelemetry(state, { type: "input.speech.stopped" }, 1000);
    state = recordVoiceTelemetry(state, { type: "transcript.user", text: "Change it" }, 1125);
    state = recordVoiceTelemetry(state, { type: "reply.started" }, 1340);
    expect(state.responseLatencyMs).toBeNull();
    state = recordVoiceTelemetry(state, { type: "talkos.playback.started" }, 2000);

    expect(state.endpointLatencyMs).toBe(125);
    expect(state.responseLatencyMs).toBe(875);
    state = recordVoiceTelemetry(state, { type: "reply.started" }, 2200);
    state = recordVoiceTelemetry(state, { type: "talkos.playback.started" }, 2300);
    expect(state.responseLatencyMs).toBe(875);
    state = recordVoiceTelemetry(state, { type: "transcript.user", text: "Next request" }, 3000);
    expect(state.responseLatencyMs).toBeNull();
    state = recordVoiceTelemetry(state, { type: "talkos.playback.started" }, 3500);
    expect(state.responseLatencyMs).toBe(500);
  });

  it("keeps only the forty most recent telemetry events", () => {
    const state = Array.from({ length: 45 }, (_, index) => index).reduce(
      (current, receivedAt) => recordVoiceTelemetry(current, { type: "session.ready" }, receivedAt),
      emptyVoiceTelemetry,
    );

    expect(state.events).toHaveLength(40);
    expect(state.events[0].receivedAt).toBe(5);
  });

  it("distinguishes interruption candidates from confirmed interruptions", () => {
    let state = recordVoiceTelemetry(
      emptyVoiceTelemetry,
      { type: "talkos.interruption.candidate" },
      100,
    );
    state = recordVoiceTelemetry(state, { type: "reply.done", status: "interrupted" }, 180);

    expect(state.events.map((event) => event.kind)).toEqual([
      "interruption_candidate",
      "interruption_confirmed",
    ]);
  });

  it("ignores events that are not useful in Developer Mode", () => {
    const state = recordVoiceTelemetry(emptyVoiceTelemetry, { type: "reply.audio" }, 100);
    expect(state).toBe(emptyVoiceTelemetry);
  });
});

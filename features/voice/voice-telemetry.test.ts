import { describe, expect, it } from "vitest";
import { emptyVoiceTelemetry, recordVoiceTelemetry } from "./voice-telemetry";

describe("recordVoiceTelemetry", () => {
  it("derives endpoint and response latency from event receipt times", () => {
    let state = emptyVoiceTelemetry;
    state = recordVoiceTelemetry(state, { type: "input.speech.stopped" }, 1000);
    state = recordVoiceTelemetry(state, { type: "transcript.user", text: "Change it" }, 1125);
    state = recordVoiceTelemetry(state, { type: "reply.started" }, 1340);

    expect(state.endpointLatencyMs).toBe(125);
    expect(state.responseLatencyMs).toBe(215);
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

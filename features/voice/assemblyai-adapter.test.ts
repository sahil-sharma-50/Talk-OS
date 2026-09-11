import { describe, expect, it } from "vitest";
import { normalizeVoiceEvent } from "./assemblyai-adapter";

describe("normalizeVoiceEvent", () => {
  it("maps a final user transcript to a finalized TalkOS turn", () => {
    expect(
      normalizeVoiceEvent({
        type: "transcript.user",
        text: "Compare vendors",
      }),
    ).toMatchObject({
      type: "TALK_TURN_FINALIZED",
      speaker: "user",
      text: "Compare vendors",
    });
  });

  it("maps transcript deltas without finalizing them", () => {
    expect(
      normalizeVoiceEvent({ type: "transcript.user.delta", delta: "Compare Supa" }),
    ).toMatchObject({ type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Compare Supa" });
  });

  it("marks an interrupted reply as an interruption state", () => {
    expect(
      normalizeVoiceEvent({ type: "reply.done", status: "interrupted" }),
    ).toMatchObject({ type: "VOICE_STATE_CHANGED", voiceState: "interrupted" });
  });
});

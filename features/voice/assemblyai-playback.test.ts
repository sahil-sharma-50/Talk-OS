import { afterEach, expect, it, vi } from "vitest";
import { createAssemblyAIAdapter } from "./assemblyai-adapter";
import { initialSessionState } from "@/features/session/session.fixtures";
import { sessionReducer } from "@/features/session/session.reducer";
import { emptyVoiceTelemetry } from "./voice-telemetry";
import { createWorkspace } from "@/features/workspace/workspace-model";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function playbackSession() {
  vi.useFakeTimers();
  class Socket extends EventTarget { readyState = 1; send = vi.fn(); close = vi.fn(); }
  const socket = new Socket();
  const nodes: Array<{ onended: (() => void) | null; stop: ReturnType<typeof vi.fn> }> = [];
  const workletPort: { onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null } = { onmessage: null };
  const mediaTrack = { stop: vi.fn(), enabled: true };
  const context = {
    currentTime: 10, state: "running", sampleRate: 48000, resume: vi.fn(async () => {}), close: vi.fn(), destination: {},
    suspend: vi.fn(async () => {}),
    audioWorklet: { addModule: vi.fn() },
    createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createBuffer: (_: number, length: number, rate: number) => ({ duration: length / rate, getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => { const node = { onended: null, stop: vi.fn(), connect: vi.fn(), start: vi.fn(), buffer: null }; nodes.push(node); return node; },
  };
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
  vi.stubGlobal("AudioWorkletNode", class { port = workletPort; connect = vi.fn(); disconnect = vi.fn(); });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [mediaTrack], getAudioTracks: () => [mediaTrack] })) } });
  vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
  vi.stubGlobal("fetch", async () => Response.json({ token: "test" }));
  let state = initialSessionState;
  let workspace = createWorkspace();
  const navigate = vi.fn();
  const adapter = createAssemblyAIAdapter(undefined, { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: navigate });
  let telemetry = emptyVoiceTelemetry;
  adapter.setTelemetryListener?.(value => { telemetry = value; });
  await adapter.connect(event => { state = sessionReducer(state, event); });
  const receive = (message: unknown) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  receive({ type: "session.ready" });
  return {
    adapter, nodes, receive, navigate, context, state: () => state, telemetry: () => telemetry,
    sent: () => socket.send.mock.calls.map(([data]) => JSON.parse(data)),
    tick: (time: number) => { context.currentTime = time; vi.advanceTimersByTime(50); },
    pushMic: (level: number) => {
      const frame = new Int16Array(480);
      frame.fill(Math.round(level * 32767));
      workletPort.onmessage?.(new MessageEvent("message", { data: frame.buffer }));
    },
    audio: (id: string, seconds: number) => receive({ type: "reply.audio", reply_id: id, data: btoa("\xff\x1f".repeat(seconds * 24000)) }),
    silence: (id: string, seconds: number) => receive({ type: "reply.audio", reply_id: id, data: btoa("\0".repeat(seconds * 48000)) }),
    word: (id: string, delta: string, start_ms: number, end_ms: number) => receive({ type: "transcript.agent.delta", reply_id: id, delta, start_ms, end_ms }),
  };
}

it("holds a completed tool across an older boundary until the newest reply ends", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "research", text: "Research this market." });
    s.receive({ type: "reply.started", reply_id: "tool-owner" });
    s.receive({ type: "tool.call", call_id: "read-workspace", name: "get_workspace", arguments: {} });
    await vi.advanceTimersByTimeAsync(0);
    s.receive({ type: "reply.started", reply_id: "speculative" });
    s.receive({ type: "reply.done", reply_id: "tool-owner", status: "completed" });
    expect(s.sent().filter(message => message.call_id === "read-workspace")).toHaveLength(0);
    s.receive({ type: "reply.done", reply_id: "speculative", status: "completed" });
    expect(s.sent()).toContainEqual(expect.objectContaining({ type: "tool.result", call_id: "read-workspace" }));
  } finally { await s.adapter.disconnect(); }
});

it("leaves Thinking after the final transcript even if reply.done is lost", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "missing-boundary" });
    s.audio("missing-boundary", 1);
    s.tick(10.2);
    s.receive({ type: "transcript.agent", reply_id: "missing-boundary", text: "The task is complete." });
    s.tick(11.1);
    s.nodes[0].onended?.();

    expect(s.state().voiceState).toBe("listening");
    expect(s.state().speechCaption).toBeNull();
  } finally { await s.adapter.disconnect(); }
});

it("reports a stalled connection with a recovery action instead of silently discarding the reply", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "stalled" });
    expect(s.state().voiceState).toBe("thinking");

    await vi.advanceTimersByTimeAsync(15_100);
    expect(s.state().voiceState).toBe("thinking");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(s.state().voiceState).toBe("error");
    expect(s.state().error).toMatch(/reconnect/i);
  } finally { await s.adapter.disconnect(); }
});

it("pauses playback on local speech but cancels work only after server confirmation", async () => {
  const s = await playbackSession();
  try {
    await s.adapter.startListening();
    s.receive({ type: "reply.started", reply_id: "speaking" });
    s.audio("speaking", 2);
    s.tick(10.2);

    for (let frame = 0; frame < 8; frame += 1) s.pushMic(.01);
    expect(s.nodes[0].stop).not.toHaveBeenCalled();
    for (let frame = 0; frame < 5; frame += 1) s.pushMic(.12);

    expect(s.context.suspend).toHaveBeenCalledTimes(1);
    expect(s.nodes[0].stop).not.toHaveBeenCalled();
    expect(s.state().voiceState).toBe("listening");
    s.receive({ type: "input.speech.started" });
    expect(s.nodes[0].stop).toHaveBeenCalledTimes(1);
    s.receive({ type: "input.speech.stopped" });
    s.receive({ type: "transcript.user", item_id: "redirect", text: "Use my other document" });
    s.receive({ type: "reply.started", reply_id: "new" }); s.audio("new", 1);
    expect(s.nodes).toHaveLength(2);
  } finally { await s.adapter.disconnect(); }
});

it("resumes the same playback after an unconfirmed local noise candidate", async () => {
  const s = await playbackSession();
  try {
    await s.adapter.startListening();
    s.receive({ type: "reply.started", reply_id: "answer" }); s.audio("answer", 2); s.tick(10.1);
    for (let i = 0; i < 5; i++) s.pushMic(.12);
    s.context.resume.mockClear();
    await vi.advanceTimersByTimeAsync(900);
    expect(s.context.resume).toHaveBeenCalled();
    expect(s.nodes[0].stop).not.toHaveBeenCalled();
    expect(s.state().voiceState).toBe("speaking");
  } finally { await s.adapter.disconnect(); }
});

it("does not expose untimed transcript deltas ahead of buffered audio", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "untimed" });
    s.receive({ type: "transcript.agent.delta", reply_id: "untimed", delta: "An entire answer arrives early", start_ms: null, end_ms: null });
    s.audio("untimed", 3);
    s.tick(10.1);
    // An empty playback caption intentionally masks raw network text in UI.
    expect(s.state().speechCaption).toMatchObject({ turnId: "agent-untimed", text: "" });
  } finally { await s.adapter.disconnect(); }
});

it("keeps a continued request together when queued transcript words have not been spoken", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "research", text: "Research an Android app like Instagram" });
    s.receive({ type: "reply.started", reply_id: "early" });
    s.word("early", "Certainly", 0, 1000);
    s.receive({ type: "transcript.user", item_id: "prd", text: "and put that research into a PRD." });
    expect(s.state().turns.filter(turn => turn.speaker === "user")).toHaveLength(1);
    expect(s.state().turns.at(-1)?.text).toBe("Research an Android app like Instagram and put that research into a PRD.");
  } finally { await s.adapter.disconnect(); }
});

it("does not report silent provider audio as a spoken response and includes the playback queue", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "latency", text: "Explain the plan" });
    s.receive({ type: "reply.started", reply_id: "reply" });
    s.silence("reply", 2);
    expect(s.telemetry().responseLatencyMs).toBeNull();
    s.receive({ type: "reply.audio", reply_id: "reply", data: btoa("\0".repeat(24000) + "\xff\x1f".repeat(12000)) });
    expect(s.telemetry().responseLatencyMs).toBe(2500);
  } finally { await s.adapter.disconnect(); }
});

it("keeps a continued user request intact while a tool reply streams only silence", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "request-start", text: "Create a planner" });
    s.receive({ type: "reply.started", reply_id: "tool-wait" });
    s.silence("tool-wait", 1);
    s.receive({ type: "transcript.user", item_id: "request-tail", text: "with tasks for bread and milk" });
    expect(s.state().turns.filter(turn => turn.speaker === "user")).toHaveLength(1);
    expect(s.state().turns.at(-1)?.text).toBe("Create a planner with tasks for bread and milk");
  } finally { await s.adapter.disconnect(); }
});

it("says Speaking only when nonsilent audio reaches the playback clock", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "reply" });
    expect(s.state().voiceState).toBe("thinking");
    s.silence("reply", 1);
    s.tick(10.3);
    expect(s.state().voiceState).toBe("thinking");
    s.word("reply", "Hello", 1000, 1500);
    s.audio("reply", 1);
    s.tick(10.8);
    expect(s.state().voiceState).toBe("thinking");
    s.tick(11.2);
    expect(s.state().voiceState).toBe("speaking");
  } finally { await s.adapter.disconnect(); }
});

it("keeps a silent reply available when the provider reuses it after a continued phrase", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "first", text: "Wait, stop." });
    s.receive({ type: "reply.started", reply_id: "pending" }); s.silence("pending", 1); s.tick(10.2);
    s.receive({ type: "input.speech.started" });
    s.silence("pending", 0.5);
    expect(s.nodes).toHaveLength(1);
    s.receive({ type: "input.speech.stopped" });
    s.receive({ type: "transcript.user", item_id: "second", text: "Just say okay." });
    // The service continues this same reply; it does not send reply.started again.
    s.word("pending", "Okay.", 1500, 2000); s.audio("pending", 1); s.tick(10.4);
    expect(s.nodes).toHaveLength(2);
    expect(s.state().voiceState).toBe("speaking");
    expect(s.state().speechCaption).toMatchObject({ turnId: "agent-pending", text: "Okay." });
    expect(s.state().turns.find(turn => turn.speaker === "user")?.text).toBe("Wait, stop. Just say okay.");
    s.receive({ type: "reply.done", reply_id: "pending", status: "completed" });
    s.tick(11.3); s.nodes[1].onended?.();
    expect(s.state().voiceState).toBe("listening");
  } finally { await s.adapter.disconnect(); }
});

it("does not let an old interrupted completion or transcript stop a newer answer", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "old" }); s.audio("old", 2); s.tick(10.1);
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "transcript.user", item_id: "new", text: "Explain the launch plan" });
    s.receive({ type: "reply.started", reply_id: "new" }); s.word("new", "Here", 0, 1000); s.audio("new", 2); s.tick(10.4);
    s.receive({ type: "reply.done", reply_id: "old", status: "interrupted" });
    s.receive({ type: "transcript.agent", reply_id: "old", text: "The outdated answer", interrupted: true });
    expect(s.nodes[1].stop).not.toHaveBeenCalled();
    expect(s.state().voiceState).toBe("speaking");
    expect(s.state().speechCaption?.turnId).toBe("agent-new");
    expect(s.state().turns.some(turn => turn.text === "The outdated answer")).toBe(false);
  } finally { await s.adapter.disconnect(); }
});

it("accepts a new server reply after a speech candidate ends without a transcript", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "old" }); s.audio("old", 2); s.tick(10.1);
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "input.speech.stopped" });
    s.receive({ type: "reply.started", reply_id: "resumed" }); s.audio("resumed", 2); s.tick(10.4);
    expect(s.nodes).toHaveLength(2);
    expect(s.state().voiceState).toBe("speaking");
  } finally { await s.adapter.disconnect(); }
});

it("can resume a navigation confirmation after a rejected speech candidate", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "nav", text: "Open Sheets." });
    s.receive({ type: "reply.started", reply_id: "old-confirmation" }); s.audio("old-confirmation", 2); s.tick(10.1);
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "input.speech.stopped" });
    s.receive({ type: "reply.started", reply_id: "resumed-confirmation" }); s.audio("resumed-confirmation", 2); s.tick(10.4);
    expect(s.nodes).toHaveLength(2);
    expect(s.state().voiceState).toBe("speaking");
    expect(s.navigate).toHaveBeenCalledTimes(1);
  } finally { await s.adapter.disconnect(); }
});

it("resumes an unspoken reply after a speech candidate ends without finalized text", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "pending" }); s.silence("pending", 1); s.tick(10.2);
    s.receive({ type: "input.speech.started" }); s.receive({ type: "input.speech.stopped" });
    s.word("pending", "Ready.", 1000, 1500); s.audio("pending", 1); s.tick(10.4);
    expect(s.nodes).toHaveLength(2);
    expect(s.state().voiceState).toBe("speaking");
    expect(s.state().speechCaption?.text).toBe("Ready.");
  } finally { await s.adapter.disconnect(); }
});

it("requests one prompt navigation confirmation, ignores duplicate replies, then allows the next task", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "nav", text: "Open Sheets." });
    expect(s.navigate).toHaveBeenCalledExactlyOnceWith("sheets");
    expect(s.sent().filter(m => m.type === "reply.create")).toEqual([{ type: "reply.create", instructions: expect.stringContaining("Sheets is open.") }]);
    s.receive({ type: "reply.started", reply_id: "confirmation" }); s.word("confirmation", "Sheets is open.", 0, 1000); s.audio("confirmation", 1);
    s.receive({ type: "transcript.agent", reply_id: "confirmation", text: "Sheets is open." });
    s.receive({ type: "reply.done", reply_id: "confirmation", status: "completed" });
    s.receive({ type: "reply.started", reply_id: "duplicate" }); s.audio("duplicate", 1);
    s.receive({ type: "transcript.agent", reply_id: "duplicate", text: "I have opened Sheets." });
    s.receive({ type: "reply.done", reply_id: "duplicate", status: "completed" });
    expect(s.nodes).toHaveLength(1);
    expect(s.state().turns.filter(turn => turn.speaker === "agent")).toHaveLength(1);
    s.tick(11.1); s.nodes[0].onended?.();
    s.receive({ type: "tool.call", call_id: "redundant-open", name: "open_workspace", arguments: { view: "sheets" } });
    expect(s.navigate).toHaveBeenCalledTimes(1);
    expect(s.state().voiceState).toBe("listening");
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "transcript.user", item_id: "follow", text: "Explain what a formula is" });
    s.receive({ type: "reply.started", reply_id: "formula" }); s.audio("formula", 1); s.tick(11.3);
    expect(s.nodes).toHaveLength(2);
    expect(s.state().voiceState).toBe("speaking");
  } finally { await s.adapter.disconnect(); }
});

it("does not let a silent automatic reply claim the navigation confirmation", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "nav", text: "Open Sheets." });
    s.receive({ type: "reply.started", reply_id: "silent-auto" }); s.silence("silent-auto", 1);
    s.receive({ type: "reply.started", reply_id: "spoken-confirmation" }); s.word("spoken-confirmation", "Sheets", 0, 1000); s.audio("spoken-confirmation", 1);
    s.receive({ type: "reply.done", reply_id: "silent-auto", status: "interrupted" });
    s.tick(11.2);
    expect(s.state().voiceState).toBe("speaking");
    expect(s.state().speechCaption?.turnId).toBe("agent-spoken-confirmation");
    expect(s.nodes[1].stop).not.toHaveBeenCalled();
  } finally { await s.adapter.disconnect(); }
});

it("streams captions at audio time and stays speaking after the server finishes", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "one" });
    s.word("one", "Hello", 0, 400); s.word("one", "there.", 1000, 1400);
    s.audio("one", 2);
    s.receive({ type: "transcript.agent", reply_id: "one", text: "Hello there." });
    s.receive({ type: "reply.done", reply_id: "one", status: "completed" });
    s.tick(10.2);
    expect(s.state().speechCaption).toMatchObject({ text: "Hello", activeStart: 0, activeEnd: 5 });
    expect(s.state().voiceState).toBe("speaking");
    expect(s.state().turns.at(-1)?.text).toBe("Hello there.");
    s.tick(11.2);
    expect(s.state().speechCaption).toMatchObject({ text: "Hello there.", activeStart: 6, activeEnd: 12 });
    s.tick(12);
    s.nodes[0].onended?.();
    expect(s.state().voiceState).toBe("listening");
    expect(s.state().speechCaption).toBeNull();
  } finally { await s.adapter.disconnect(); }
});

it("keeps an earlier reply visible while the next reply's audio is queued", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "one" }); s.word("one", "First.", 0, 1900); s.audio("one", 2);
    s.receive({ type: "reply.done", reply_id: "one", status: "completed" });
    s.receive({ type: "tool.call", call_id: "next-step", name: "get_workspace", arguments: {} });
    s.receive({ type: "reply.done", reply_id: "one", status: "completed" });
    await vi.advanceTimersByTimeAsync(0);
    s.receive({ type: "reply.started", reply_id: "two" }); s.word("two", "Second.", 0, 1900); s.audio("two", 2);
    s.tick(11);
    expect(s.state().speechCaption).toMatchObject({ turnId: "agent-one", text: "First." });
    s.tick(12.2);
    expect(s.state().speechCaption).toMatchObject({ turnId: "agent-two", text: "Second." });
  } finally { await s.adapter.disconnect(); }
});

it("plays one acknowledgment per input while allowing the next user request", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "thanks", text: "Thanks." });
    for (const id of ["welcome", "duplicate-welcome"]) {
      s.receive({ type: "reply.started", reply_id: id });
      s.word(id, "You're welcome.", 0, 900); s.audio(id, 1);
      s.receive({ type: "transcript.agent", reply_id: id, text: "You're welcome." });
      s.receive({ type: "reply.done", reply_id: id, status: "completed" });
    }
    expect(s.nodes).toHaveLength(1);
    expect(s.state().turns.filter(turn => turn.speaker === "agent")).toHaveLength(1);
    s.tick(11.2); s.nodes[0].onended?.();
    expect(s.state().voiceState).toBe("listening");
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "transcript.user", item_id: "explain", text: "Explain my plan." });
    s.receive({ type: "reply.started", reply_id: "explanation" });
    s.audio("explanation", 1);
    expect(s.nodes).toHaveLength(2);
  } finally { await s.adapter.disconnect(); }
});

it("settles a cancelled call after the new reply without playing its error continuation", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "old-request", text: "Move my sheet." });
    s.receive({ type: "reply.started", reply_id: "pending" });
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "tool.call", call_id: "abandoned", name: "get_workspace", arguments: {} });
    s.receive({ type: "transcript.user", item_id: "thanks", text: "Thanks." });
    s.word("pending", "You're welcome.", 0, 900); s.audio("pending", 1);
    expect(s.sent().some(m => m.type === "tool.result")).toBe(false);
    s.receive({ type: "reply.done", reply_id: "pending", status: "completed" });
    expect(s.sent().filter(m => m.type === "tool.result")).toHaveLength(1);
    for (const id of ["old-error", "duplicate-welcome"]) {
      s.receive({ type: "reply.started", reply_id: id }); s.audio(id, 1);
      s.receive({ type: "transcript.agent", reply_id: id, text: "An obsolete reply" });
      s.receive({ type: "reply.done", reply_id: id, status: "completed" });
    }
    expect(s.nodes).toHaveLength(1);
    expect(s.state().turns.some(turn => turn.text === "An obsolete reply")).toBe(false);
    s.tick(11.2); s.nodes[0].onended?.();
    expect(s.state().voiceState).toBe("listening");
  } finally { await s.adapter.disconnect(); }
});

it("cancels the caption clock and ignores late audio after barge-in", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "reply.started", reply_id: "one" }); s.word("one", "Old", 0, 1000); s.audio("one", 2);
    s.tick(10.2);
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "transcript.user", text: "Actually change that", item_id: "new" });
    s.word("one", "reply", 1000, 1900); s.audio("one", 1);
    s.tick(11.2);
    expect(s.state().speechCaption).toBeNull();
    expect(s.nodes).toHaveLength(1);
    expect(s.nodes[0].stop).toHaveBeenCalled();
    expect(s.state().partialTranscript?.speaker).not.toBe("agent");
    await s.adapter.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  } finally { await s.adapter.disconnect(); }
});

it.each(["before", "after"])("does not trigger an error reply when speech arrives %s the tool call", async arrival => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "move", text: "Move my sheet into the document." });
    s.receive({ type: "reply.started", reply_id: "move-request" });
    if (arrival === "after") s.receive({ type: "tool.call", call_id: "old-tool", name: "get_workspace", arguments: {} });
    s.receive({ type: "input.speech.started" });
    if (arrival === "before") s.receive({ type: "tool.call", call_id: "old-tool", name: "get_workspace", arguments: {} });
    s.receive({ type: "reply.done", reply_id: "move-request", status: "interrupted" });
    s.receive({ type: "transcript.user", item_id: "thanks", text: "Okay, cool. Looks really nice. Thanks." });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.sent().filter(m => m.type === "tool.result")).toHaveLength(0);
    s.word("move-request", "I'm sorry, I ran into an error.", 0, 900); s.audio("move-request", 1);
    s.receive({ type: "transcript.agent", reply_id: "move-request", text: "I'm sorry, I ran into an error." });
    expect(s.nodes).toHaveLength(0);
    expect(s.state().turns.some(turn => turn.text.includes("I'm sorry"))).toBe(false);
    expect(s.state().turns.at(-1)?.text).toBe("Okay, cool. Looks really nice. Thanks.");
    s.receive({ type: "reply.started", reply_id: "welcome" });
    s.word("welcome", "You're welcome.", 0, 900); s.audio("welcome", 1); s.tick(10.2);
    expect(s.nodes).toHaveLength(1);
    expect(s.state().speechCaption).toMatchObject({ turnId: "agent-welcome", text: "You're welcome." });
    expect(s.state().voiceState).toBe("speaking");
  } finally { await s.adapter.disconnect(); }
});

it.each([true, false])("does not revive an older completed tool response after the user moves on (error: %s)", async isError => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "old", text: "Check the workspace." });
    s.receive({ type: "tool.call", call_id: "finished", name: "open_workspace", arguments: { view: isError ? "invalid" : "documents" } });
    s.receive({ type: "reply.done", status: "completed" });
    await vi.advanceTimersByTimeAsync(0);
    const result = JSON.parse(String(s.sent().find(m => m.call_id === "finished")?.result));
    expect(Object.hasOwn(result, "error")).toBe(isError);
    s.receive({ type: "reply.started", reply_id: "old-tool-reply" }); s.silence("old-tool-reply", 1);
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "transcript.user", item_id: "new", text: "Thanks." });
    // An ordinary unspoken reply may continue a phrase; a completed tool's
    // confirmation belongs to the input that triggered that particular tool.
    s.word("old-tool-reply", "Old result", 1000, 1900); s.audio("old-tool-reply", 1);
    expect(s.nodes).toHaveLength(1);
    expect(s.state().partialTranscript?.speaker).not.toBe("agent");
    s.receive({ type: "reply.started", reply_id: "new-reply" }); s.audio("new-reply", 1);
    expect(s.nodes).toHaveLength(2);
  } finally { await s.adapter.disconnect(); }
});

it("keeps current tool failures and multi-tool continuations audible", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "task", text: "Check the workspace and explain it." });
    for (const [id, view] of [["bad", "invalid"], ["good", "documents"]]) {
      s.receive({ type: "tool.call", call_id: id, name: "open_workspace", arguments: { view } });
      s.receive({ type: "reply.done", status: "completed" });
      await vi.advanceTimersByTimeAsync(0);
      s.receive({ type: "reply.started", reply_id: `result-${id}` });
      s.word(`result-${id}`, id, 0, 900); s.audio(`result-${id}`, 1);
      s.receive({ type: "reply.done", reply_id: `result-${id}`, status: "completed" });
    }
    expect(s.nodes).toHaveLength(2);
    expect(s.sent().filter(m => m.type === "tool.result").map(m => Object.hasOwn(JSON.parse(String(m.result)), "error"))).toEqual([true, false]);
  } finally { await s.adapter.disconnect(); }
});

it.each([true, false])("rejects a delayed result reply that starts after the next input (error: %s)", async isError => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "old", text: "Check my workspace." });
    s.receive({ type: "tool.call", call_id: "old-call", name: "open_workspace", arguments: { view: isError ? "invalid" : "documents" } });
    s.receive({ type: "reply.done", status: "completed" });
    await vi.advanceTimersByTimeAsync(0);
    s.receive({ type: "input.speech.started" });
    s.receive({ type: "transcript.user", item_id: "thanks", text: "Thanks." });
    s.receive({ type: "reply.started", reply_id: "late-result" });
    // Some service versions omit reply_id on PCM frames.
    s.receive({ type: "reply.audio", data: btoa("\xff\x1f".repeat(2400)) });
    s.word("late-result", "The old result", 0, 100);
    s.receive({ type: "reply.done", reply_id: "late-result", status: "completed" });
    expect(s.nodes).toHaveLength(0);
    s.receive({ type: "reply.started", reply_id: "welcome" }); s.audio("welcome", 1);
    expect(s.nodes).toHaveLength(1);
    expect(s.state().turns.at(-1)?.text).toBe("Thanks.");
  } finally { await s.adapter.disconnect(); }
});

it("settles a pending tool at a discarded reply's completion without changing the spoken answer", async () => {
  const s = await playbackSession();
  try {
    s.receive({ type: "transcript.user", item_id: "nav", text: "Open Sheets." });
    s.receive({ type: "reply.started", reply_id: "confirmation" });
    s.word("confirmation", "Sheets is open.", 0, 900); s.audio("confirmation", 1);
    s.receive({ type: "reply.done", reply_id: "confirmation", status: "completed" });
    s.receive({ type: "reply.started", reply_id: "duplicate" });
    s.receive({ type: "tool.call", call_id: "cached-open", name: "open_workspace", arguments: { view: "sheets" } });
    expect(s.sent().filter(m => m.type === "tool.result")).toHaveLength(0);
    s.receive({ type: "reply.done", reply_id: "duplicate", status: "completed" });
    expect(s.sent().filter(m => m.type === "tool.result")).toHaveLength(1);
    expect(s.nodes).toHaveLength(1);
    expect(s.navigate).toHaveBeenCalledTimes(1);
  } finally { await s.adapter.disconnect(); }
});

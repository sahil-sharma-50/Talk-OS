import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssemblyAIAdapter, normalizeVoiceEvent } from "./assemblyai-adapter";
import { LIVE_GREETING, LIVE_SYSTEM_PROMPT, workspaceTools } from "./research-tools";
import { createWorkspace } from "@/features/workspace/workspace-model";

afterEach(() => vi.unstubAllGlobals());

describe("AssemblyAI session setup", () => {
  it("configures the stored agent greeting, workspace prompt, and tools before it becomes ready", async () => {
    class TestSocket extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      send = vi.fn();
      close = vi.fn();
    }
    const socket = new TestSocket();
    const port = { onmessage: null as null | ((event: MessageEvent<ArrayBuffer>) => void) };
    vi.stubGlobal("WebSocket", class {
      static OPEN = 1;
      constructor() { return socket; }
    });
    vi.stubGlobal("AudioContext", class {
      state = "running";
      resume = vi.fn();
      close = vi.fn();
      audioWorklet = { addModule: vi.fn() };
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    });
    vi.stubGlobal("AudioWorkletNode", class {
      port = port;
      disconnect = vi.fn();
    });
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [] }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "test-token", agentId: "agent-123" })));

    const emit = vi.fn();
    const telemetry = vi.fn();
    const activeView = vi.fn();
    const setWorkspace = vi.fn();
    const adapter = createAssemblyAIAdapter(undefined, {
      getWorkspace: () => createWorkspace(),
      setWorkspace,
      getTavilyApiKey: () => "",
      setActiveView: activeView,
    });
    adapter.setTelemetryListener?.(telemetry);
    await adapter.connect(emit);
    try {
      expect(getUserMedia).not.toHaveBeenCalled();
      socket.dispatchEvent(new Event("open"));
      expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({
        type: "session.update",
        session: {
          agent_id: "agent-123",
          greeting: LIVE_GREETING,
          system_prompt: LIVE_SYSTEM_PROMPT,
          tools: workspaceTools,
        },
      });
      socket.send.mockClear();
      const audio = new MessageEvent("message", { data: new ArrayBuffer(2) });
      port.onmessage?.(audio);
      expect(socket.send).not.toHaveBeenCalled();

      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session.ready" }) }));
      expect(socket.send).not.toHaveBeenCalled();
      await adapter.startListening();
      expect(getUserMedia).toHaveBeenCalledOnce();
      port.onmessage?.(audio);
      expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ type: "input.audio", audio: "AAA=" });

      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "input.speech.stopped" }) }));
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "transcript.user", text: "Change it" }) }));
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "reply.started" }) }));
      expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({
        connected: true,
        endpointLatencyMs: expect.any(Number),
        responseLatencyMs: expect.any(Number),
      }));

      const duplicate = new MessageEvent("message", { data: JSON.stringify({ type: "tool.call", call_id: "same-call", name: "create_canvas", arguments: { title: "Only once" } }) });
      socket.dispatchEvent(duplicate);
      socket.dispatchEvent(duplicate);
      await vi.waitFor(() => expect(setWorkspace).toHaveBeenCalledOnce());

      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "tool.call", call_id: "call-follow", name: "search_web", arguments: { query: "voice agents" } }) }));
      expect(activeView).toHaveBeenCalledWith("research");
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "tool.call", call_id: "call-live", name: "get_workspace", arguments: {} }) }));
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "input.speech.started" }) }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "INTERRUPTION_STARTED", actionId: "call-live" }));
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "transcript.user", text: "Target developers instead" }) }));
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({
        type: "INTERRUPTED",
        actionId: "call-live",
        constraint: "Target developers instead",
      }));
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "reply.done", status: "interrupted" }) }));
      await Promise.resolve();
      expect(telemetry).toHaveBeenLastCalledWith(expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({ kind: "interruption_candidate" }),
          expect.objectContaining({ kind: "interruption_confirmed" }),
        ]),
      }));
      expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).not.toContainEqual(expect.objectContaining({
        type: "tool.result",
        call_id: "call-live",
      }));
    } finally {
      await adapter.disconnect();
    }
  });

  it("injects typed messages and requests a reply", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; currentTime = 0; resume = vi.fn(); close = vi.fn(); audioWorklet = { addModule: vi.fn() }; createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() }); });
    vi.stubGlobal("AudioWorkletNode", class { port = {}; disconnect = vi.fn(); });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "test-token", agentId: "agent-123" })));
    const adapter = createAssemblyAIAdapter();
    await adapter.connect(vi.fn());
    socket.dispatchEvent(new Event("open"));
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session.ready" }) }));
    socket.send.mockClear();
    adapter.submitText?.("Build my budget");
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: "conversation.message", role: "user", content: "Build my budget" },
      { type: "reply.create" },
    ]);
    await adapter.disconnect();
  });

  it("queues a typed message until the stored-agent session is ready", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; currentTime = 0; resume = vi.fn(); close = vi.fn(); audioWorklet = { addModule: vi.fn() }; });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "test-token", agentId: "agent-123" })));
    const adapter = createAssemblyAIAdapter();
    await adapter.connect(vi.fn());
    socket.dispatchEvent(new Event("open"));
    socket.send.mockClear();

    adapter.submitText?.("Make a launch plan");
    expect(socket.send).not.toHaveBeenCalled();

    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session.ready" }) }));
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: "conversation.message", role: "user", content: "Make a launch plan" },
      { type: "reply.create" },
    ]);
    await adapter.disconnect();
  });

  it("reports microphone energy to the reactive orb", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    const port = { onmessage: null as null | ((event: MessageEvent<ArrayBuffer>) => void) };
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class {
      state = "running"; sampleRate = 48_000; currentTime = 0; resume = vi.fn(); close = vi.fn();
      audioWorklet = { addModule: vi.fn() };
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    });
    vi.stubGlobal("AudioWorkletNode", class { port = port; disconnect = vi.fn(); });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "test-token", agentId: "agent-123" })));
    const level = vi.fn();
    const adapter = createAssemblyAIAdapter();
    adapter.setLevelListener?.(level);
    await adapter.connect(vi.fn());
    socket.dispatchEvent(new Event("open"));
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session.ready" }) }));
    await adapter.startListening();
    const samples = new Int16Array([0, 16_384, -16_384, 8_192]);
    port.onmessage?.(new MessageEvent("message", { data: samples.buffer }));
    expect(level).toHaveBeenCalledWith(expect.any(Number));
    expect(level.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.2);
    await adapter.disconnect();
  });
});

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
      normalizeVoiceEvent({ type: "transcript.user.delta", text: "Compare Supabase" }),
    ).toMatchObject({ type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Compare Supabase", replace: true });
  });

  it("marks an interrupted reply as an interruption state", () => {
    expect(
      normalizeVoiceEvent({ type: "reply.done", status: "interrupted" }),
    ).toMatchObject({ type: "VOICE_STATE_CHANGED", voiceState: "interrupted" });
  });

  it("preserves the AssemblyAI call id on visible tool activity", () => {
    expect(
      normalizeVoiceEvent({ type: "tool.call", call_id: "call-42", name: "search_sources" }),
    ).toMatchObject({ type: "ACTION_STARTED", action: { id: "call-42" } });
  });
});

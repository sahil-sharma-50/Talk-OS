import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssemblyAIAdapter, normalizeVoiceEvent, VOICE_INPUT_CONFIG } from "./assemblyai-adapter";
import { LIVE_GREETING, LIVE_SYSTEM_PROMPT, workspaceTools } from "./research-tools";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { sessionReducer } from "@/features/session/session.reducer";
import { initialSessionState } from "@/features/session/session.fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssemblyAI session setup", () => {
  it("sends only AssemblyAI credentials to the voice-token route", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; resume = vi.fn(); close = vi.fn(); });
    const fetchRequest = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ token: "test-token" });
    });
    vi.stubGlobal("fetch", fetchRequest);
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en-US", calendar: "gregory", numberingSystem: "latn", timeZone: "Europe/Berlin",
    });

    const adapter = createAssemblyAIAdapter({ apiKey: "assembly-secret", agentId: "agent-123", tavilyApiKey: "tavily-secret" });
    await adapter.connect(vi.fn());
    try {
      expect(fetchRequest.mock.calls[0][0]).toBe("/api/voice-token");
      expect(JSON.parse(String(fetchRequest.mock.calls[0][1]?.body))).toEqual({ apiKey: "assembly-secret", agentId: "agent-123", region: "eu" });
    } finally {
      await adapter.disconnect();
    }
  });

  it("opens the WebSocket in the region that minted the temporary token", async () => {
    const opened = vi.fn();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; addEventListener() {} close = vi.fn(); constructor(url: string) { opened(url); } });
    vi.stubGlobal("AudioContext", class { state = "running"; resume = vi.fn(); close = vi.fn(); });
    vi.stubGlobal("fetch", async () => Response.json({ token: "eu-token", region: "eu" }));
    const adapter = createAssemblyAIAdapter();

    await adapter.connect(vi.fn());

    expect(String(opened.mock.calls[0][0])).toBe("wss://agents.eu.assemblyai.com/v1/ws?token=eu-token");
    await adapter.disconnect();
  });

  it("retains a segmented Planner request across tool replies and recovers from a wrong creation tool", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; resume = vi.fn(); close = vi.fn(); });
    vi.stubGlobal("fetch", async () => Response.json({ token: "test-token" }));
    let workspace = createWorkspace();
    let session = initialSessionState;
    const activeView = vi.fn();
    const adapter = createAssemblyAIAdapter(undefined, {
      getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: activeView,
    });
    await adapter.connect(event => { session = sessionReducer(session, event); });
    const receive = (message: unknown) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
    const sent = () => socket.send.mock.calls.map(([value]) => JSON.parse(value));
    try {
      receive({ type: "session.ready" });
      receive({ type: "transcript.user", item_id: "phrase-one", text: "Open my planner" });
      // A tool-only reply is not the end of the user's spoken request.
      receive({ type: "reply.started", reply_id: "fc-open" });
      receive({ type: "tool.call", call_id: "open", name: "open_workspace", arguments: { view: "planner" } });
      receive({ type: "reply.done", reply_id: "fc-open", status: "completed" });
      await vi.waitFor(() => expect(activeView).toHaveBeenCalledWith("planner"));
      receive({ type: "transcript.user.delta", item_id: "phrase-two", text: "and create a shopping" });
      expect(session.partialTranscript?.text).toBe("Open my planner and create a shopping");
      receive({ type: "transcript.user", item_id: "phrase-two", text: "and create a shopping list." });
      receive({ type: "transcript.user", item_id: "phrase-two", text: "and create a shopping list." });
      expect(session.turns.filter(turn => turn.speaker === "user")).toHaveLength(1);
      expect(session.turns.at(-1)?.text).toBe("Open my planner and create a shopping list.");
      expect(sent().filter(message => message.type === "session.update").at(-1).session.system_prompt).toContain('"latest_user_request":"Open my planner and create a shopping list.","requested_workspace":"planner"');
      receive({ type: "tool.call", call_id: "wrong", name: "create_sheet", arguments: { title: "Shopping list" } });
      receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(sent()).toContainEqual(expect.objectContaining({ type: "tool.result", call_id: "wrong" })));
      expect(workspace.sheets).toHaveLength(0);
      const wrongResult = JSON.parse(sent().find(message => message.call_id === "wrong").result);
      expect(wrongResult).toMatchObject({ error: "workspace_target_mismatch", requested_workspace: "planner" });
      receive({ type: "tool.call", call_id: "right", name: "create_planner", arguments: { title: "Shopping list", tasks: [{ title: "Milk" }, { title: "Apples" }] } });
      receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(workspace.planners).toHaveLength(1));
      expect(activeView).toHaveBeenLastCalledWith("planner");
      expect(workspace.planners[0].tasks.map(task => task.title)).toEqual(["Milk", "Apples"]);
      receive({ type: "reply.started", reply_id: "spoken" });
      receive({ type: "transcript.agent", reply_id: "spoken", text: "Your list is ready." });
      receive({ type: "input.speech.started" });
      receive({ type: "transcript.user", item_id: "new-request", text: "Actually use Sheets and make a budget." });
      receive({ type: "transcript.user", item_id: "phrase-one", text: "Open my planner" });
      expect(session.turns.at(-1)?.text).toBe("Actually use Sheets and make a budget.");
      receive({ type: "tool.call", call_id: "budget", name: "create_sheet", arguments: { title: "Budget" } });
      receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(workspace.sheets).toHaveLength(1));
      expect(activeView).toHaveBeenLastCalledWith("sheets");
    } finally { await adapter.disconnect(); }
  });
  it("does not open a socket when stopped while a token is pending", async () => {
    let release: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => { release = resolve; }));
    const opened = vi.fn();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; addEventListener() {} constructor() { opened(); } });
    vi.stubGlobal("AudioContext", class { resume = vi.fn(); });
    const adapter = createAssemblyAIAdapter();
    const connecting = adapter.connect(vi.fn());
    await adapter.disconnect();
    release(new Response(JSON.stringify({ token: "temporary", agentId: "agent-123" })));
    await connecting.catch(() => undefined);
    expect(opened).not.toHaveBeenCalled();
  });
  it("starts with the TalkOS greeting, prompt, and workspace tools", async () => {
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
          greeting: LIVE_GREETING,
          system_prompt: LIVE_SYSTEM_PROMPT,
          input: VOICE_INPUT_CONFIG,
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
        responseLatencyMs: null,
      }));

      const duplicate = new MessageEvent("message", { data: JSON.stringify({ type: "tool.call", call_id: "same-call", name: "create_canvas", arguments: { title: "Only once" } }) });
      socket.dispatchEvent(duplicate);
      socket.dispatchEvent(duplicate);
      await vi.waitFor(() => expect(setWorkspace).toHaveBeenCalledOnce());

      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "tool.call", call_id: "call-follow", name: "search_web", arguments: { query: "voice agents" } }) }));
      await vi.waitFor(() => expect(activeView).toHaveBeenCalledWith("research"));
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
      expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).not.toContainEqual(expect.objectContaining({ type: "tool.result", call_id: "call-live" }));
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
    expect(socket.send).not.toHaveBeenCalled();
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "reply.done", status: "completed" }) }));
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: "session.update", session: { system_prompt: expect.stringContaining('"latest_user_request":"Build my budget"') } },
      { type: "conversation.message", role: "user", content: "Build my budget" },
      { type: "reply.create", instructions: "Build my budget" },
    ]);
    await adapter.disconnect();
  });

  it("waits for the current tool reply to finish even when the previous reply is done", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; resume = vi.fn(); close = vi.fn(); });
    vi.stubGlobal("fetch", async () => Response.json({ token: "test-token" }));
    const adapter = createAssemblyAIAdapter(); await adapter.connect(vi.fn());
    const receive = (message: unknown) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
    receive({ type: "session.ready" }); receive({ type: "reply.done", status: "completed" });
    socket.send.mockClear();
    receive({ type: "reply.started", reply_id: "next" });
    receive({ type: "tool.call", call_id: "next-read", name: "search_web", arguments: { query: "product news" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(socket.send).not.toHaveBeenCalled();
    receive({ type: "reply.done", status: "completed" });
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toContainEqual(expect.objectContaining({ type: "tool.result", call_id: "next-read" }));
    await adapter.disconnect();
  });

  it("sends tool results using the exact AssemblyAI protocol envelope", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; resume = vi.fn(); close = vi.fn(); });
    vi.stubGlobal("fetch", async () => Response.json({ token: "test-token" }));
    const adapter = createAssemblyAIAdapter();
    await adapter.connect(vi.fn());
    const receive = (message: unknown) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
    try {
      receive({ type: "session.ready" });
      receive({ type: "tool.call", call_id: "workspace", name: "get_workspace", arguments: {} });
      receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(socket.send.mock.calls.some(([value]) => JSON.parse(value).type === "tool.result")).toBe(true));
      const result = socket.send.mock.calls.map(([value]) => JSON.parse(value)).find(message => message.type === "tool.result");
      expect(result).toEqual({
        type: "tool.result",
        call_id: "workspace",
        result: expect.any(String),
        is_error: false,
      });
    } finally {
      await adapter.disconnect();
    }
  });

  it("queues a typed message until the stored-agent session is ready", async () => {
    class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
    const socket = new TestSocket();
    vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
    vi.stubGlobal("AudioContext", class { state = "running"; currentTime = 0; resume = vi.fn(); close = vi.fn(); audioWorklet = { addModule: vi.fn() }; });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ token: "test-token", agentId: "agent-123" })));
    const adapter = createAssemblyAIAdapter();
    await adapter.connect(vi.fn());
    adapter.submitText?.("Make a launch plan");
    expect(socket.send).not.toHaveBeenCalled();
    socket.dispatchEvent(new Event("open"));
    expect(JSON.parse(socket.send.mock.calls[0][0]).session.greeting).toBeUndefined();
    socket.send.mockClear();

    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "session.ready" }) }));
    expect(socket.send.mock.calls.map(([value]) => JSON.parse(value))).toEqual([
      { type: "session.update", session: { system_prompt: expect.stringContaining('"latest_user_request":"Make a launch plan"') } },
      { type: "conversation.message", role: "user", content: "Make a launch plan" },
      { type: "reply.create", instructions: "Make a launch plan" },
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
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    port.onmessage?.(new MessageEvent("message", { data: samples.buffer }));
    expect(level).toHaveBeenCalledWith(expect.any(Number));
    expect(level.mock.calls.at(-1)?.[0]).toBeGreaterThan(0.2);
    for (let i = 0; i < 100; i++) port.onmessage?.(new MessageEvent("message", { data: samples.buffer }));
    expect(level).toHaveBeenCalledTimes(1);
    expect(socket.send.mock.calls.filter(([data]) => JSON.parse(data).type === "input.audio")).toHaveLength(101);
    clock.mockReturnValue(40);
    port.onmessage?.(new MessageEvent("message", { data: samples.buffer }));
    expect(level).toHaveBeenCalledTimes(2);
    clock.mockRestore();
    await adapter.disconnect();
  });
});

describe("normalizeVoiceEvent", () => {
  it("keeps adaptive endpointing patient without adding barge-in delay", () => {
    expect(VOICE_INPUT_CONFIG).toMatchObject({ transcription_mode: "balanced", continuous_partials: true, turn_detection: { interrupt_response: true, interruption_delay: 0 } });
    expect(VOICE_INPUT_CONFIG.turn_detection).not.toHaveProperty("min_silence");
    expect(VOICE_INPUT_CONFIG.turn_detection).not.toHaveProperty("max_silence");
  });
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

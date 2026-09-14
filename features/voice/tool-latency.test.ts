import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssemblyAIAdapter } from "./assemblyai-adapter";
import { workspaceTools } from "./research-tools";
import { createWorkspace } from "@/features/workspace/workspace-model";

afterEach(() => vi.unstubAllGlobals());

async function connect() {
  class TestSocket extends EventTarget { static OPEN = 1; readyState = 1; send = vi.fn(); close = vi.fn(); }
  const socket = new TestSocket();
  vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
  vi.stubGlobal("AudioContext", class { state = "running"; resume = vi.fn(); close = vi.fn(); });
  let finishResearch: (response: Response) => void = () => {};
  vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/voice-token" ? Promise.resolve(Response.json({ token: "test-token" })) : new Promise<Response>(resolve => { finishResearch = resolve; })));
  let workspace = createWorkspace();
  const navigate = vi.fn();
  const adapter = createAssemblyAIAdapter(undefined, { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: navigate });
  await adapter.connect(vi.fn());
  const receive = (message: unknown) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  receive({ type: "session.ready" });
  const sent = () => socket.send.mock.calls.map(([data]) => JSON.parse(data));
  const call = (id: string, name: string, args = {}) => receive({ type: "tool.call", call_id: id, name, arguments: args });
  return { adapter, receive, call, sent, navigate, finishResearch: () => finishResearch(Response.json({ sources: [] })) };
}

describe("voice tool result latency", () => {
  it("does not release a late result into new speech when its VAD start event is missing", async () => {
    const h = await connect();
    try {
      h.receive({ type: "transcript.user", item_id: "old", text: "Check the workspace." });
      h.call("pending", "get_workspace");
      h.receive({ type: "reply.done", status: "completed" });
      h.receive({ type: "transcript.user.delta", item_id: "new", text: "Thanks" });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(h.sent().some(m => m.type === "tool.result")).toBe(false);
      h.receive({ type: "transcript.user", item_id: "new", text: "Thanks." });
      expect(h.sent().some(m => m.type === "tool.result")).toBe(false);
      h.receive({ type: "reply.started", reply_id: "thanks" });
      h.receive({ type: "reply.done", reply_id: "thanks", status: "completed" });
      expect(h.sent().filter(m => m.type === "tool.result")).toHaveLength(1);
    } finally { await h.adapter.disconnect(); }
  });
  it("applies only finalized standalone navigation locally while retaining the complete tool set", async () => {
    const h = await connect();
    try {
      h.receive({ type: "transcript.user.delta", item_id: "nav", text: "Open Sheets" });
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.sent()).toEqual([]);
      h.receive({ type: "transcript.user", item_id: "nav", text: "Open Sheets." });
      expect(h.navigate).toHaveBeenCalledExactlyOnceWith("sheets");
      const configuration = h.sent().filter(m => m.type === "session.update").at(-1).session;
      expect(configuration.tools).toBeUndefined(); // No narrowing of the registered tools.
      expect(configuration.system_prompt).toContain('"active_view":"sheets"');
      expect(configuration.system_prompt).toContain("completed_client_action");
      expect(h.sent().some(m => m.type === "tool.result")).toBe(false);
      expect(h.sent().filter(m => m.type === "reply.create")).toHaveLength(1);
      h.receive({ type: "transcript.user", item_id: "nav", text: "Open Sheets." });
      expect(h.navigate).toHaveBeenCalledTimes(1);
      expect(h.sent().filter(m => m.type === "reply.create")).toHaveLength(1);
      h.receive({ type: "input.speech.started" });
      h.receive({ type: "transcript.user", item_id: "follow", text: "and make a shopping list" });
      expect(h.navigate).toHaveBeenCalledTimes(1);
      expect(h.sent().filter(m => m.type === "session.update").at(-1).session.system_prompt).toContain("and make a shopping list");
    } finally { await h.adapter.disconnect(); }
  });

  it("does not execute partial tab commands that become compound instructions", async () => {
    const h = await connect();
    try {
      h.receive({ type: "transcript.user.delta", item_id: "compound", text: "Open Sheets" });
      h.receive({ type: "transcript.user.delta", item_id: "compound", text: "Open Sheets and create a budget" });
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.sent()).toEqual([]);
      h.receive({ type: "transcript.user", item_id: "compound", text: "Open Sheets and create a budget" });
      expect(h.navigate).not.toHaveBeenCalled();
    } finally { await h.adapter.disconnect(); }
  });

  it("leaves compound commands for the agent to plan as a whole", async () => {
    const h = await connect();
    try {
      h.receive({ type: "transcript.user", item_id: "multi", text: "Open my planner and create a shopping list." });
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.sent().find(m => m.type === "session.update").session.system_prompt).not.toContain('"completed_client_action":');
    } finally { await h.adapter.disconnect(); }
  });

  it("keeps every workspace tool interruptible instead of holding subsequent user speech", () => {
    expect(workspaceTools.length).toBeGreaterThan(30);
    expect(workspaceTools.every(tool => tool.execution_mode === "interactive")).toBe(true);
  });

  it("opens the tab immediately and releases one result when the server turn ends", async () => {
    const h = await connect();
    try {
      h.call("open", "open_workspace", { view: "sheets" });
      expect(h.navigate).toHaveBeenCalledExactlyOnceWith("sheets");
      expect(h.sent().some(m => m.type === "tool.result")).toBe(false);
      h.receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(h.sent()).toContainEqual(expect.objectContaining({ type: "tool.result", call_id: "open" })));
      expect(h.navigate).toHaveBeenCalledExactlyOnceWith("sheets");
      h.call("open", "open_workspace", { view: "sheets" });
      h.receive({ type: "reply.done", status: "completed" });
      expect(h.sent().filter(m => m.type === "tool.result")).toHaveLength(1);
      expect(h.sent().some(m => m.type === "reply.create")).toBe(false);
    } finally { await h.adapter.disconnect(); }
  });

  it("returns current validation errors at the turn boundary so the agent can correct them", async () => {
    const h = await connect();
    try {
      h.call("bad", "open_workspace", { view: "unknown" });
      h.receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(h.sent()).toContainEqual(expect.objectContaining({ type: "tool.result", call_id: "bad" })));
      const result = JSON.parse(String(h.sent().find(m => m.call_id === "bad")?.result));
      expect(result).toMatchObject({ error: expect.any(String) });
      expect(h.navigate).not.toHaveBeenCalled();
    } finally { await h.adapter.disconnect(); }
  });

  it("drains multiple local results independently of slow interactive research", async () => {
    const h = await connect();
    try {
      h.receive({ type: "reply.started", reply_id: "research" });
      h.call("slow", "search_web", { query: "product news" });
      h.call("read-one", "get_workspace");
      h.call("read-two", "get_workspace");
      await new Promise(resolve => setTimeout(resolve, 0));
      h.receive({ type: "reply.done", status: "completed" });
      await vi.waitFor(() => expect(h.sent().filter(m => m.type === "tool.result").map(m => m.call_id)).toEqual(["read-one", "read-two"]));
      h.finishResearch();
      await new Promise(resolve => setTimeout(resolve, 0));
      // No reply.started has arrived: the server may be waiting for every
      // parallel result before it starts the continuation.
      await vi.waitFor(() => expect(h.sent()).toContainEqual(expect.objectContaining({ call_id: "slow" })));
    } finally { await h.adapter.disconnect(); }
  });

  it("discards interrupted work without sending a result that triggers an obsolete apology", async () => {
    const h = await connect();
    try {
      h.call("cancelled", "get_workspace");
      h.receive({ type: "input.speech.started" });
      await new Promise(resolve => setTimeout(resolve, 0));
      const results = h.sent().filter(m => m.type === "tool.result");
      expect(results).toHaveLength(0);
      expect(h.sent().filter(m => m.type === "reply.create")).toHaveLength(0);
    } finally { await h.adapter.disconnect(); }
  });
});

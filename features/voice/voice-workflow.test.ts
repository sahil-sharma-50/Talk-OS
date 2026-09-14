import { afterEach, expect, it, vi } from "vitest";
import { createAssemblyAIAdapter } from "./assemblyai-adapter";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { initialSessionState } from "@/features/session/session.fixtures";
import { sessionReducer } from "@/features/session/session.reducer";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function workflow(searchMs = 0) {
  vi.useFakeTimers();
  class Socket extends EventTarget { readyState = 1; send = vi.fn(); close = vi.fn(); }
  const socket = new Socket();
  vi.stubGlobal("WebSocket", class { static OPEN = 1; constructor() { return socket; } });
  vi.stubGlobal("AudioContext", class { state = "running"; currentTime = 0; resume = vi.fn(); close = vi.fn(); });
  vi.stubGlobal("fetch", (url: string) => url === "/api/voice-token" ? Promise.resolve(Response.json({ token: "test" })) : new Promise(resolve => setTimeout(() => resolve(Response.json({ results: [{ title: "Market evidence", url: "https://example.org/study", content: "People seek smaller interest groups." }] })), searchMs)));
  let workspace: ReturnType<typeof createWorkspace> = { ...createWorkspace(), documents: [], activeDocumentId: "" };
  const turns: string[] = [];
  let state = initialSessionState;
  const adapter = createAssemblyAIAdapter(undefined, { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "" });
  await adapter.connect(event => { state = sessionReducer(state, event); if (event.type === "TALK_TURN_FINALIZED" && event.speaker === "agent") turns.push(event.text); });
  socket.dispatchEvent(new Event("open"));
  const receive = (event: unknown) => socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  const sent = () => socket.send.mock.calls.map(([data]) => JSON.parse(data));
  receive({ type: "session.ready" });
  return { adapter, receive, sent, turns, state: () => state, workspace: () => workspace };
}

it("returns a slow successful search before the registered provider deadline and continues to a cited PRD", async () => {
  const h = await workflow(22_000);
  try {
    const request = "Research the audience for an Android app like Instagram and create a sourced PRD.";
    h.receive({ type: "transcript.user", item_id: "request", text: request });
    h.receive({ type: "reply.started", reply_id: "search" });
    h.receive({ type: "tool.call", call_id: "search-call", name: "search_web", arguments: { query: "social app audience" } });
    h.receive({ type: "reply.done", reply_id: "search", status: "completed" });
    expect(h.state().voiceState).toBe("acting");
    const config = h.sent()[0].session.tools.find((tool: { name: string }) => tool.name === "search_web");
    let expired = false;
    const deadline = setTimeout(() => { expired = true; }, config.timeout_seconds * 1000);
    await vi.advanceTimersByTimeAsync(22_100);
    clearTimeout(deadline);
    expect(expired).toBe(false);
    const result = JSON.parse(h.sent().find(m => m.call_id === "search-call").result);
    expect(result.sources[0].url).toBe("https://example.org/study");
    expect(result.request_context.latest_user_request).toBe(request);
    h.receive({ type: "reply.started", reply_id: "document" });
    h.receive({ type: "tool.call", call_id: "document-call", name: "create_document", arguments: { title: "Android PRD", content: "# PRD\nBuild for interest groups. [Evidence](https://example.org/study)" } });
    h.receive({ type: "reply.done", reply_id: "document", status: "completed" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.workspace().documents).toHaveLength(1);
    expect(h.sent().filter(m => m.call_id === "document-call")).toHaveLength(1);
  } finally { await h.adapter.disconnect(); }
});

it.each(["get_workspace", "invalid"])("reports the provider error flag accurately for the %s tool outcome", async name => {
  const h = await workflow();
  try {
    h.receive({ type: "reply.started", reply_id: "tool-turn" });
    h.receive({ type: "tool.call", call_id: "open", name, arguments: {} });
    h.receive({ type: "reply.done", reply_id: "tool-turn" });
    await vi.advanceTimersByTimeAsync(0);
    const result = h.sent().find(m => m.type === "tool.result");
    expect(result.is_error).toBe(name === "invalid");
    expect(Boolean(JSON.parse(result.result).error)).toBe(name === "invalid");
  } finally { await h.adapter.disconnect(); }
});

it("offers recovery if the service never acknowledges a delivered tool result", async () => {
  const h = await workflow();
  try {
    h.receive({ type: "reply.started", reply_id: "read" });
    h.receive({ type: "tool.call", call_id: "read-call", name: "get_workspace", arguments: {} });
    h.receive({ type: "reply.done", reply_id: "read", status: "completed" });
    await vi.advanceTimersByTimeAsync(46_000);
    expect(h.state().voiceState).toBe("error");
    expect(h.state().error).toMatch(/reconnect/i);
  } finally { await h.adapter.disconnect(); }
});

it("does not strand a completed tool when the transition transcript arrives without reply.done", async () => {
  const h = await workflow();
  try {
    h.receive({ type: "reply.started", reply_id: "transition" });
    h.receive({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "social apps" } });
    await vi.advanceTimersByTimeAsync(1);
    h.receive({ type: "transcript.agent", reply_id: "transition", text: "Let me check that." });
    expect(h.sent().filter(m => m.type === "tool.result")).toHaveLength(0);
    expect(h.state().voiceState).toBe("acting");
    await vi.advanceTimersByTimeAsync(46_000);
    expect(h.state().voiceState).toBe("error");
    expect(h.workspace().sources).toHaveLength(1);
  } finally { await h.adapter.disconnect(); }
});

it("does not close an idle delivery boundary merely because a tool call arrives late", async () => {
  const h = await workflow();
  try {
    h.receive({ type: "reply.started", reply_id: "read" });
    h.receive({ type: "reply.done", reply_id: "read", status: "completed" });
    h.receive({ type: "tool.call", call_id: "late", name: "get_workspace", arguments: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent().filter(m => m.call_id === "late")).toHaveLength(1);
  } finally { await h.adapter.disconnect(); }
});

it("holds a late result when a new reply has actually begun", async () => {
  const h = await workflow(2000);
  try {
    h.receive({ type: "reply.started", reply_id: "search" });
    h.receive({ type: "tool.call", call_id: "search-call", name: "search_web", arguments: { query: "audience" } });
    h.receive({ type: "reply.done", reply_id: "search", status: "completed" });
    h.receive({ type: "reply.started", reply_id: "progress" });
    await vi.advanceTimersByTimeAsync(2100);
    expect(h.sent().filter(m => m.call_id === "search-call")).toHaveLength(0);
    h.receive({ type: "reply.done", reply_id: "search", status: "completed" });
    expect(h.sent().filter(m => m.call_id === "search-call")).toHaveLength(0);
    h.receive({ type: "reply.done", reply_id: "progress", status: "completed" });
    expect(h.sent().filter(m => m.call_id === "search-call")).toHaveLength(1);
  } finally { await h.adapter.disconnect(); }
});

it("consumes grouped tool results without suppressing the next user request", async () => {
  const h = await workflow();
  try {
    h.receive({ type: "transcript.user", item_id: "first", text: "Inspect my workspace" });
    h.receive({ type: "reply.started", reply_id: "tools" });
    for (const call_id of ["a", "b"]) h.receive({ type: "tool.call", call_id, name: "get_workspace", arguments: {} });
    await vi.advanceTimersByTimeAsync(0);
    h.receive({ type: "reply.done", reply_id: "tools", status: "completed" });
    h.receive({ type: "reply.started", reply_id: "grouped" });
    h.receive({ type: "transcript.agent", reply_id: "grouped", text: "Workspace inspected." });
    h.receive({ type: "reply.done", reply_id: "grouped", status: "completed" });
    h.receive({ type: "input.speech.started" });
    h.receive({ type: "transcript.user", item_id: "thanks", text: "Thanks." });
    h.receive({ type: "reply.started", reply_id: "welcome" });
    h.receive({ type: "transcript.agent", reply_id: "welcome", text: "You are welcome." });
    expect(h.turns).toEqual(["Workspace inspected.", "You are welcome."]);
  } finally { await h.adapter.disconnect(); }
});

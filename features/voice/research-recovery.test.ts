import { afterEach, expect, it, vi } from "vitest";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";
import { addRetrievedSources, createWorkspace } from "@/features/workspace/workspace-model";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function runtimeFor(request: string) {
  let workspace = createWorkspace();
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", getCurrentRequest: () => request };
  return runtime;
}

it("ends a hung research request before the voice tool expires and ignores its late response", async () => {
  vi.useFakeTimers();
  const runtime = runtimeFor("Research Android social apps and create a PRD");
  let release!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { release = resolve; }));
  let result: Awaited<ReturnType<typeof executeResearchTool>> | undefined;
  const run = executeResearchTool({ type: "tool.call", call_id: "hung", name: "search_web", arguments: { query: "Android apps" } }, runtime).then(value => { result = value; });
  await vi.advanceTimersByTimeAsync(31_000);
  expect(result).toMatchObject({ isError: true, result: { error: "research_timed_out" } });
  release(Response.json({ results: [{ title: "Late", url: "https://example.org/late", content: "Late evidence" }] }));
  await run;
  await vi.advanceTimersByTimeAsync(0);
  expect(runtime.getWorkspace().sources).toHaveLength(0);
});

it("saves a named-source research draft with references instead of a fatal compilation error", async () => {
  const runtime = runtimeFor("Research my market and write a sourced PRD");
  vi.stubGlobal("fetch", async () => Response.json({ results: [{ title: "Market study", url: "https://example.org/study", content: "Demand for smaller communities" }] }));
  await executeResearchTool({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "social market" } }, runtime);
  const content = "# PRD\nTest a small-community Android app.\n\n*Sources: Market study.*";
  const result = await executeResearchTool({ type: "tool.call", call_id: "prd", name: "create_document", arguments: { title: "PRD", content } }, runtime);
  expect(result.isError).not.toBe(true);
  expect(result.result.document_id).toBe(runtime.getWorkspace().documents.at(-1)?.id);
  expect(runtime.getWorkspace().documents.at(-1)?.content).toContain(content);
  expect(runtime.getWorkspace().documents.at(-1)?.content).toContain("[Market study](https://example.org/study)");
  expect(runtime.getWorkspace().documents.at(-1)?.content).toContain("Sources retrieved for this request");
  expect(result.events.some(event => event.type === "ACTION_FAILED")).toBe(false);
});

it("does not attach unrelated workspace evidence or evidence from an earlier request", async () => {
  let request = "Research social communities";
  const runtime = runtimeFor(request);
  runtime.getCurrentRequest = () => request;
  runtime.setWorkspace(addRetrievedSources(runtime.getWorkspace(), [{ id: "old", title: "Unrelated", url: "https://example.org/old", snippet: "Old", content: "", retrievedAt: new Date().toISOString() }], "unrelated"));
  vi.stubGlobal("fetch", async () => Response.json({ results: [{ title: "Market", url: "https://example.org/market", content: "Market" }] }));
  await executeResearchTool({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "communities" } }, runtime);
  request = "Write a research interview invitation";
  await executeResearchTool({ type: "tool.call", call_id: "inspect", name: "get_workspace", arguments: {} }, runtime);
  const content = "# Invitation\nPlease join our interview.";
  const result = await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "Invitation", content } }, runtime);
  expect(result.isError).not.toBe(true);
  expect(runtime.getWorkspace().documents.at(-1)?.content).toBe(content);
});

it("attaches references from a fresh search even when the request does not say research", async () => {
  const runtime = runtimeFor("Find current Android trends and create a PRD");
  vi.stubGlobal("fetch", async () => Response.json({ results: [{ title: "Android trends", url: "https://example.org/android", content: "Current Android evidence" }] }));
  await executeResearchTool({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "current Android trends" } }, runtime);

  await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "PRD", content: "# PRD\nBuild for Android communities." } }, runtime);

  expect(runtime.getWorkspace().documents.at(-1)?.content).toContain("[Android trends](https://example.org/android)");
});

it("does not reuse references when a later request has identical words but a different id", async () => {
  let requestId = "request-one";
  const runtime = Object.assign(runtimeFor("Find current Android trends and create a PRD"), { getCurrentRequestId: () => requestId });
  vi.stubGlobal("fetch", async () => Response.json({ results: [{ title: "Earlier trends", url: "https://example.org/earlier", content: "Earlier evidence" }] }));
  await executeResearchTool({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "current Android trends" } }, runtime);
  requestId = "request-two";

  const content = "# PRD\nA fresh request with identical wording.";
  await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "PRD", content } }, runtime);

  expect(runtime.getWorkspace().documents.at(-1)?.content).toBe(content);
});

it.each(["Use those sources to write a brief", "Put that research into a document", "Create a document out of this research"])("reuses selected saved evidence for a follow-up: %s", async request => {
  const runtime = runtimeFor(request);
  runtime.setWorkspace(addRetrievedSources(runtime.getWorkspace(), [{ id: "saved", title: "Saved study", url: "https://example.org/saved", snippet: "Existing evidence", content: "", retrievedAt: new Date().toISOString() }], "market"));
  await executeResearchTool({ type: "tool.call", call_id: "inspect", name: "get_workspace", arguments: {} }, runtime);
  const result = await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "Report", content: "# Report\nTest smaller communities." } }, runtime);
  expect(result.isError).not.toBe(true);
  expect(runtime.getWorkspace().documents.at(-1)?.content).toContain("[Saved study](https://example.org/saved)");
});

it("limits generated references to the eight most recent sources", async () => {
  const runtime = runtimeFor("Research Android trends and write a report");
  const results = Array.from({ length: 10 }, (_, index) => ({ title: `Study ${index + 1}`, url: `https://example.org/study-${index + 1}`, content: `Evidence ${index + 1}` }));
  vi.stubGlobal("fetch", async () => Response.json({ results }));
  await executeResearchTool({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "Android trends" } }, runtime);

  await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "Report", content: "# Report" } }, runtime);

  const content = runtime.getWorkspace().documents.at(-1)!.content;
  expect(content.match(/https:\/\/example\.org\/study-/g)).toHaveLength(8);
  expect(content).not.toContain("https://example.org/study-1)");
  expect(content).not.toContain("https://example.org/study-2)");
  expect(content).toContain("https://example.org/study-10)");
});

it("keeps references from parallel searches, preserves inline links, and excludes unrelated saved sources", async () => {
  const runtime = runtimeFor("Research competitors and audiences and write a report");
  runtime.setWorkspace(addRetrievedSources(runtime.getWorkspace(), [{ id: "old", title: "Unrelated", url: "https://example.org/old", snippet: "Old", content: "", retrievedAt: new Date().toISOString() }], "unrelated"));
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const { query } = JSON.parse(String(init.body));
    return Response.json({ results: [{ title: query, url: `https://example.org/${query}`, content: query }] });
  });
  await Promise.all(["competitors", "audiences"].map(query => executeResearchTool({ type: "tool.call", call_id: query, name: "search_web", arguments: { query } }, runtime)));
  const content = "# Report\n[Competitors](https://example.org/competitors)";
  await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "Report", content } }, runtime);
  const saved = runtime.getWorkspace().documents.at(-1)!;
  expect(saved.content).toContain(content);
  expect(saved.content.match(/https:\/\/example.org\/competitors/g)).toHaveLength(1);
  expect(saved.content).toContain("[audiences](https://example.org/audiences)");
  expect(saved.content).not.toContain("example.org/old");
  // An explicit later edit must not silently reinsert references the user removed.
  await executeResearchTool({ type: "tool.call", call_id: "edit", name: "edit_document", arguments: { document_id: saved.id, expected_revision: saved.revision, content: "# Revised report" } }, runtime);
  expect(runtime.getWorkspace().documents.at(-1)?.content).toBe("# Revised report");
});

it("escapes retrieved source titles and URL delimiters in generated references", async () => {
  const runtime = runtimeFor("Research my market and write a report");
  vi.stubGlobal("fetch", async () => Response.json({ results: [{ title: "Study [draft]\nresult", url: "https://example.org/study(2026)", content: "Evidence" }] }));
  await executeResearchTool({ type: "tool.call", call_id: "search", name: "search_web", arguments: { query: "market" } }, runtime);
  await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "Report", content: "# Report" } }, runtime);
  expect(runtime.getWorkspace().documents.at(-1)?.content).toContain("[Study \\[draft\\] result](https://example.org/study%282026%29)");
});

it("keeps saved snippets available when full-source extraction returns an HTTP error", async () => {
  const runtime = runtimeFor("Turn the research into a PRD");
  runtime.setWorkspace(addRetrievedSources(runtime.getWorkspace(), [{ id: "study", title: "Study", url: "https://example.org/study", snippet: "Existing evidence", content: "", retrievedAt: new Date().toISOString() }], "market"));
  vi.stubGlobal("fetch", async () => Response.json({ error: "research_unavailable" }, { status: 502 }));
  const result = await executeResearchTool({ type: "tool.call", call_id: "extract", name: "read_sources", arguments: { urls: ["https://example.org/study"] } }, runtime);
  expect(result).toMatchObject({ isError: true, result: { available_sources: [{ url: "https://example.org/study", snippet: "Existing evidence" }] } });
});

it("accepts valid citations from any of the request's research collections", async () => {
  const runtime = runtimeFor("Research competitors and audiences and write a sourced PRD");
  for (const id of ["competitors", "audiences"]) runtime.setWorkspace(addRetrievedSources(runtime.getWorkspace(), [{ id, title: id, url: `https://example.org/${id}`, snippet: id, content: "", retrievedAt: new Date().toISOString() }], id));
  const result = await executeResearchTool({ type: "tool.call", call_id: "doc", name: "create_document", arguments: { title: "PRD", content: "# PRD\n[Competitive research](https://example.org/competitors)" } }, runtime);
  expect(result.isError).not.toBe(true);
  expect(runtime.getWorkspace().documents.at(-1)?.title).toBe("PRD");
});

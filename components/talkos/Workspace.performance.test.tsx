import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { initialSessionState } from "@/features/session/session.fixtures";
import { sessionReducer } from "@/features/session/session.reducer";
import { addRetrievedSources, createWorkspace } from "@/features/workspace/workspace-model";
import { emptyVoiceTelemetry } from "@/features/voice/voice-telemetry";
import { ResearchWorkspace } from "./ResearchWorkspace";
import { Workspace } from "./Workspace";
import { LatestExchange } from "./LatestExchange";

vi.mock("./ResearchWorkspace", async importOriginal => {
  const actual = await importOriginal<typeof import("./ResearchWorkspace")>();
  return { ...actual, ResearchWorkspace: vi.fn(actual.ResearchWorkspace) };
});

it("updates live words without re-rendering the research reader on every voice tick", () => {
  const workspace = addRetrievedSources(createWorkspace(), [{ id: "source", title: "Audience study", url: "https://example.org/study", snippet: "Source preview", content: "Research evidence. ".repeat(1000), retrievedAt: new Date().toISOString() }], "Android social apps");
  let state = { ...initialSessionState, activeWorkspace: "research" as const };
  const props = { workspace, onWorkspaceChange: vi.fn(), onWorkspaceDataChange: vi.fn(), credentials: { apiKey: "", agentId: "" }, onCredentialsChange: vi.fn(), telemetry: emptyVoiceTelemetry, activityOpen: false, onActivityToggle: vi.fn(), onUndo: vi.fn() };
  const app = () => <><LatestExchange partialTranscript={state.partialTranscript} turns={state.turns} /><Workspace {...props} state={state} /></>;
  const { rerender } = render(app());
  expect(ResearchWorkspace).toHaveBeenCalledTimes(1);
  for (let tick = 1; tick <= 60; tick++) {
    state = { ...sessionReducer(state, { type: "TRANSCRIPT_PARTIAL", speaker: "user", turnId: "request-live", text: `My live instruction ${tick}`, replace: true, at: new Date().toISOString() }), activeWorkspace: "research" };
    rerender(app());
    expect(screen.getByRole("article", { name: "You" })).toHaveTextContent(`My live instruction ${tick}`);
  }
  expect(ResearchWorkspace).toHaveBeenCalledTimes(1);
  // Real workspace changes must still update the reader, not freeze it.
  props.workspace = { ...workspace, researchCollections: workspace.researchCollections.map(collection => ({ ...collection, query: "Updated audience study" })) };
  rerender(app());
  expect(ResearchWorkspace).toHaveBeenCalledTimes(2);
  expect(screen.getAllByText("Updated audience study").length).toBeGreaterThan(0);
});

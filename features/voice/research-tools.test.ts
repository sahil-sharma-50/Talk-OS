import { describe, expect, it } from "vitest";
import { executeResearchTool, researchTools } from "./research-tools";

describe("TalkOS AssemblyAI client tools", () => {
  it("declares the four constrained read-only research tools", () => {
    expect(researchTools.map((tool) => tool.name)).toEqual([
      "search_sources",
      "open_source",
      "capture_finding",
      "write_decision_brief",
    ]);
  });

  it("turns a captured source into visible evidence", () => {
    const execution = executeResearchTool({
      type: "tool.call",
      call_id: "call-1",
      name: "capture_finding",
      arguments: { source_id: "supabase-pricing" },
    });

    expect(execution.events).toContainEqual(
      expect.objectContaining({ type: "EVIDENCE_ADDED", evidence: expect.objectContaining({ id: "supabase-pricing" }) }),
    );
    expect(execution.result).toMatchObject({ source_id: "supabase-pricing", captured: true });
  });

  it("writes a decision brief through the normalized event stream", () => {
    const execution = executeResearchTool({
      type: "tool.call",
      call_id: "call-2",
      name: "write_decision_brief",
      arguments: {},
    });

    expect(execution.events).toContainEqual(expect.objectContaining({ type: "BRIEF_WRITTEN" }));
    expect(execution.result).toMatchObject({ written: true, recommendation: expect.stringMatching(/Supabase/) });
  });
});

import { describe, expect, it } from "vitest";
import { addRetrievedSources, applyWorkspaceChanges, createWorkspace } from "./workspace-model";

describe("workspace audit regressions", () => {
  it("keeps shared research source IDs and extracted text across searches", () => {
    const source = { id: "original", title: "Source", url: "https://example.com", snippet: "First", content: "Extracted evidence", retrievedAt: new Date().toISOString() };
    const first = addRetrievedSources(createWorkspace(), [source], "First query");
    const next = addRetrievedSources(first, [{ ...source, id: "replacement", content: "", snippet: "New" }], "Second query");
    expect(next.sources).toHaveLength(1);
    expect(next.sources[0]).toMatchObject({ id: "original", content: "Extracted evidence" });
    expect(next.researchCollections.every((collection) => collection.sourceIds.every((id) => next.sources.some((item) => item.id === id)))).toBe(true);
  });

  it("rejects duplicate mutations before any document is changed", () => {
    const workspace = createWorkspace();
    const document = workspace.documents[0];
    const mutation = { kind: "document" as const, artifactId: document.id, expectedRevision: 1, content: "First change" };
    const result = applyWorkspaceChanges(workspace, "Both edits", [mutation, { ...mutation, content: "Second change" }]);
    expect(result.ok).toBe(false);
    expect(workspace.documents[0].revision).toBe(1);
  });
});

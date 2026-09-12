import { describe, expect, it } from "vitest";
import { createWorkspace } from "./workspace-model";
import { parseWorkspaceExport, serializeWorkspace } from "./workspace-storage";

describe("workspace export", () => {
  it("round-trips a valid workspace", () => {
    const workspace = { ...createWorkspace(), conversation: [{ id: "turn-1", speaker: "user" as const, text: "Remember this", at: "2026-09-12T12:00:00.000Z" }] };
    expect(parseWorkspaceExport(serializeWorkspace(workspace))).toEqual(workspace);
  });

  it("rejects malformed or unsupported workspace files", () => {
    expect(() => parseWorkspaceExport("not json")).toThrow("invalid_workspace_file");
    expect(() => parseWorkspaceExport(JSON.stringify({ version: 3 }))).toThrow("invalid_workspace_file");
  });

  it("migrates a version-one workspace without losing documents or sources", () => {
    const current = createWorkspace();
    const legacy = {
      version: 1,
      documents: current.documents,
      activeDocumentId: current.activeDocumentId,
      sources: [{ id: "old", title: "Old source", url: "https://example.com", snippet: "Useful", content: "", retrievedAt: "2026-09-12T12:00:00.000Z" }],
      selectedSourceId: "old",
      task: current.task,
    };

    const migrated = parseWorkspaceExport(JSON.stringify(legacy));
    expect(migrated.version).toBe(2);
    expect(migrated.documents[0].id).toBe(current.documents[0].id);
    expect(migrated.researchCollections[0].sourceIds).toEqual(["old"]);
    expect(migrated.conversation).toEqual([]);
  });
});

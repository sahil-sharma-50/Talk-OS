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
    expect(() => parseWorkspaceExport(JSON.stringify({ version: 4 }))).toThrow("invalid_workspace_file");
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
    expect(migrated.version).toBe(4);
    expect(migrated.documents[0].id).toBe(current.documents[0].id);
    expect(migrated.researchCollections[0].sourceIds).toEqual(["old"]);
    expect(migrated.conversation).toEqual([]);
    expect(migrated.canvases).toEqual([]);
    expect(migrated.canvasAssets).toEqual({});
    expect(migrated.dashboards).toEqual([]);
  });

  it("migrates version three canvases without inventing dashboards", () => {
    const current = createWorkspace();
    const legacy = { ...current, version: 3 };
    delete (legacy as Partial<typeof current>).dashboards;
    delete (legacy as Partial<typeof current>).activeDashboardId;
    const migrated = parseWorkspaceExport(JSON.stringify(legacy));
    expect(migrated.version).toBe(4);
    expect(migrated.canvases).toEqual(current.canvases);
    expect(migrated.canvasAssets).toEqual(current.canvasAssets);
    expect(migrated.dashboards).toEqual([]);
  });
});

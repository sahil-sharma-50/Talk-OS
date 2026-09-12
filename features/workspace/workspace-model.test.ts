import { describe, expect, it } from "vitest";
import {
  addRetrievedSources,
  applyWorkspaceChanges,
  createPlanner,
  createSheet,
  createWorkspace,
  deleteResearchCollection,
  deleteResearchSource,
  editWorkspaceDocument,
  moveArtifactToTrash,
  restoreTrashedArtifact,
  undoLastWorkspaceChange,
  undoWorkspaceDocument,
  updateWorkspaceTask,
} from "./workspace-model";

describe("workspace model", () => {
  it("starts with a real editable project-notes document", () => {
    const workspace = createWorkspace();

    expect(workspace.documents).toHaveLength(1);
    expect(workspace.documents[0]).toMatchObject({ title: "Project notes", kind: "notes", revision: 1 });
    expect(workspace.activeDocumentId).toBe(workspace.documents[0].id);
  });

  it("revises and undoes a document without losing its history", () => {
    const workspace = createWorkspace();
    const document = workspace.documents[0];
    const revised = editWorkspaceDocument(workspace, document.id, "New constraints", document.revision, "agent");

    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.workspace.documents[0]).toMatchObject({ content: "New constraints", revision: 2 });
    expect(revised.workspace.documents[0].history).toHaveLength(1);

    const undone = undoWorkspaceDocument(revised.workspace, document.id);
    expect(undone.documents[0]).toMatchObject({ content: document.content, revision: 3 });
  });

  it("rejects an agent edit based on a stale document revision", () => {
    const workspace = createWorkspace();
    const document = workspace.documents[0];
    const manual = editWorkspaceDocument(workspace, document.id, "User changed this", 1, "user");
    if (!manual.ok) throw new Error("manual edit failed");

    const stale = editWorkspaceDocument(manual.workspace, document.id, "Agent overwrite", 1, "agent");
    expect(stale).toEqual({ ok: false, error: "document_revision_conflict", currentRevision: 2 });
  });

  it("stores generic retrieved sources and updates a visible task", () => {
    let workspace = createWorkspace();
    workspace = updateWorkspaceTask(workspace, {
      objective: "Choose a support platform",
      constraints: ["Self-hosting required"],
      steps: ["Read notes", "Search alternatives"],
    });
    workspace = addRetrievedSources(workspace, [{
      id: "src-1",
      title: "Example source",
      url: "https://example.com/source",
      snippet: "A relevant passage",
      content: "Full retrieved content",
      retrievedAt: "2026-09-12T12:00:00.000Z",
    }]);

    expect(workspace.task).toMatchObject({ revision: 1, objective: "Choose a support platform" });
    expect(workspace.sources[0].url).toBe("https://example.com/source");
    expect(workspace.researchCollections[0]).toMatchObject({ query: "Earlier research", sourceIds: ["src-1"] });
  });

  it("deletes a research result without removing a source shared by another search", () => {
    const shared = {
      id: "shared-source",
      title: "Shared source",
      url: "https://example.com/shared",
      snippet: "Used by both searches",
      content: "Shared evidence",
      retrievedAt: "2026-09-12T12:00:00.000Z",
    };
    const firstOnly = { ...shared, id: "first-source", title: "First source", url: "https://example.com/first" };
    const secondOnly = { ...shared, id: "second-source", title: "Second source", url: "https://example.com/second" };
    let workspace = addRetrievedSources(createWorkspace(), [shared, firstOnly], "First search");
    workspace = addRetrievedSources(workspace, [shared, secondOnly], "Second search");
    const first = workspace.researchCollections.find((item) => item.query === "First search")!;
    workspace = { ...workspace, selectedResearchCollectionId: first.id, selectedSourceId: shared.id };

    const withoutSharedResult = deleteResearchSource(workspace, first.id, shared.id);

    expect(withoutSharedResult.researchCollections.find((item) => item.id === first.id)?.sourceIds).toEqual([firstOnly.id]);
    expect(withoutSharedResult.sources.map((source) => source.id)).toContain(shared.id);
    expect(withoutSharedResult.selectedSourceId).toBe(firstOnly.id);
  });

  it("deletes a saved search, removes orphaned sources, and selects the next search", () => {
    const firstSource = {
      id: "first-source",
      title: "First source",
      url: "https://example.com/first",
      snippet: "First evidence",
      content: "First content",
      retrievedAt: "2026-09-12T12:00:00.000Z",
    };
    const secondSource = { ...firstSource, id: "second-source", title: "Second source", url: "https://example.com/second" };
    let workspace = addRetrievedSources(createWorkspace(), [firstSource], "First search");
    const firstId = workspace.selectedResearchCollectionId!;
    workspace = addRetrievedSources(workspace, [secondSource], "Second search");
    workspace = { ...workspace, selectedResearchCollectionId: firstId, selectedSourceId: firstSource.id };

    const next = deleteResearchCollection(workspace, firstId);

    expect(next.researchCollections.map((item) => item.query)).toEqual(["Second search"]);
    expect(next.sources.map((source) => source.id)).toEqual([secondSource.id]);
    expect(next.selectedResearchCollectionId).toBe(next.researchCollections[0].id);
    expect(next.selectedSourceId).toBe(secondSource.id);
  });

  it("creates sheets and planners as first-class workspace artifacts", () => {
    const workspace = createPlanner(createSheet(createWorkspace(), "Event budget"), "Launch plan");

    expect(workspace.sheets[0]).toMatchObject({ title: "Event budget", revision: 1 });
    expect(workspace.planners[0]).toMatchObject({ title: "Launch plan", revision: 1 });
  });

  it("applies document, sheet, and planner edits as one undoable change", () => {
    const workspace = createPlanner(createSheet(createWorkspace(), "Event budget"), "Launch plan");
    const document = workspace.documents[0];
    const sheet = workspace.sheets[0];
    const planner = workspace.planners[0];

    const result = applyWorkspaceChanges(workspace, "Adjust event for 30 guests", [
      { kind: "document", artifactId: document.id, expectedRevision: 1, content: "Plan for 30 guests." },
      { kind: "sheet", artifactId: sheet.id, expectedRevision: 1, cells: { A1: "Guests", B1: 30, A2: "Cost", B2: "=B1*20" } },
      { kind: "planner", artifactId: planner.id, expectedRevision: 1, tasks: [{ id: "venue", title: "Confirm venue", completed: false, dueDate: "2026-09-18" }] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.documents[0]).toMatchObject({ content: "Plan for 30 guests.", revision: 2 });
    expect(result.workspace.sheets[0].cells.B1.value).toBe(30);
    expect(result.workspace.planners[0].tasks[0].title).toBe("Confirm venue");
    expect(result.workspace.changeHistory).toHaveLength(1);

    const undone = undoLastWorkspaceChange(result.workspace, result.change.id);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.workspace.documents[0].content).toBe(document.content);
    expect(undone.workspace.sheets[0].cells).toEqual({});
    expect(undone.workspace.planners[0].tasks).toEqual([]);
  });

  it("rejects an entire coordinated change when one revision is stale", () => {
    const workspace = createSheet(createWorkspace(), "Budget");
    const result = applyWorkspaceChanges(workspace, "Unsafe overwrite", [
      { kind: "document", artifactId: workspace.documents[0].id, expectedRevision: 1, content: "Should not apply" },
      { kind: "sheet", artifactId: workspace.sheets[0].id, expectedRevision: 99, cells: { A1: "Should not apply" } },
    ]);

    expect(result).toMatchObject({ ok: false, error: "revision_conflict" });
    expect(workspace.documents[0].content).not.toBe("Should not apply");
  });

  it("moves an artifact to recoverable trash and restores it", () => {
    const workspace = createSheet(createWorkspace(), "Budget");
    const trashed = moveArtifactToTrash(workspace, "sheet", workspace.sheets[0].id);
    expect(trashed.sheets).toHaveLength(0);
    expect(trashed.trash[0]).toMatchObject({ artifactType: "sheet" });

    const restored = restoreTrashedArtifact(trashed, trashed.trash[0].id);
    expect(restored.sheets[0].title).toBe("Budget");
    expect(restored.trash).toHaveLength(0);
  });
});

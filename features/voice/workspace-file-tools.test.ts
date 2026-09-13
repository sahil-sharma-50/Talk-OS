import { describe, expect, it, vi } from "vitest";
import { applyWorkspaceChanges, createWorkspace } from "@/features/workspace/workspace-model";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";

function setup() {
  let workspace = createWorkspace();
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: vi.fn(), setActivityOpen: vi.fn(), clearActivity: vi.fn(), downloadFile: vi.fn() };
  const call = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => executeResearchTool({ type: "tool.call", call_id: crypto.randomUUID(), name, arguments: args }, runtime, signal);
  return { call, runtime, workspace: () => workspace };
}

describe("agent file and drawer controls", () => {
  it.each([undefined, "documents", "Document", "doc", "file"])("resolves deletion by exact file id when kind is %s", async kind => {
    const app = setup(); const doc = app.workspace().documents[0];
    const result = await app.call("manage_artifact", { action: "delete", kind, artifact_id: doc.id, expected_revision: doc.revision });
    expect(result.isError).not.toBe(true);
    expect(result.result.kind).toBe("document");
    expect(app.workspace().documents).toHaveLength(0);
    expect(app.workspace().trash[0].artifact.id).toBe(doc.id);
  });

  it("rejects a contradictory file type without deleting a different file", async () => {
    const app = setup(); const before = app.workspace(); const doc = before.documents[0];
    const result = await app.call("manage_artifact", { action: "trash", kind: "sheets", artifact_id: doc.id, expected_revision: doc.revision });
    expect(result.result).toMatchObject({ error: "artifact_kind_mismatch", actual_kind: "document" });
    expect(app.workspace()).toEqual(before);
  });
  it("duplicates, trashes and restores a file using the same workspace state", async () => {
    const app = setup(); const original = app.workspace().documents[0];
    const copy = await app.call("manage_artifact", { action: "duplicate", kind: "document", artifact_id: original.id, expected_revision: 1 });
    expect(copy.isError).not.toBe(true);
    expect(app.workspace().documents).toHaveLength(2);
    const trashed = await app.call("manage_artifact", { action: "trash", kind: "document", artifact_id: copy.result.artifact_id, expected_revision: 1 });
    expect(app.workspace().documents).toEqual([original]);
    expect(app.workspace().trash).toHaveLength(1);
    const restored = await app.call("manage_artifact", { action: "restore", trash_id: trashed.result.trash_id });
    expect(restored.isError).not.toBe(true);
    expect(app.workspace().documents).toHaveLength(2);
    expect(app.workspace().trash).toHaveLength(0);
    expect(app.workspace().activeDocumentId).toBe(copy.result.artifact_id);
  });

  it("rejects stale revisions and aborted deletion without moving the file", async () => {
    const app = setup(); const before = app.workspace(); const id = before.documents[0].id;
    expect((await app.call("manage_artifact", { action: "trash", kind: "document", artifact_id: id, expected_revision: 8 })).isError).toBe(true);
    expect((await app.call("manage_artifact", { action: "trash", kind: "document", artifact_id: id, expected_revision: 1 }, AbortSignal.abort())).isError).toBe(true);
    expect(app.workspace()).toEqual(before);
  });

  it("does not overwrite a draft whose saved base has changed", async () => {
    const app = setup(); const before = app.workspace(); const doc = before.documents[0];
    app.runtime.setWorkspace({ ...before, documentDrafts: { [doc.id]: { content: "My draft", baseContent: "Older base", baseRevision: 1 } } });
    const result = await app.call("save_document", { document_id: doc.id, expected_revision: 1 });
    expect(result.result.status).toBe("needs_clarification");
    expect(app.workspace().documents).toEqual(before.documents);
    expect(app.workspace().documentDrafts![doc.id].content).toBe("My draft");
  });

  it("can resolve which document version to duplicate without changing the original", async () => {
    const app = setup(); const before = app.workspace(); const doc = before.documents[0];
    const draft = { content: "Unsaved draft", baseContent: doc.content, baseRevision: doc.revision };
    app.runtime.setWorkspace({ ...before, documentDrafts: { [doc.id]: draft } });
    const args = { action: "duplicate", kind: "document", artifact_id: doc.id, expected_revision: doc.revision };
    expect((await app.call("manage_artifact", args)).result.status).toBe("needs_clarification");
    for (const version of ["saved", "draft"]) {
      const result = await app.call("manage_artifact", { ...args, document_version: version });
      expect(result.isError).not.toBe(true);
      expect(app.workspace().documents.find((item) => item.id === result.result.artifact_id)?.content).toBe(version === "draft" ? draft.content : doc.content);
      expect(app.workspace().documents.find((item) => item.id === doc.id)).toEqual(doc);
      expect(app.workspace().documentDrafts![doc.id]).toEqual(draft);
    }
  });

  it("undoes and redoes a real document change", async () => {
    const app = setup(); const doc = app.workspace().documents[0];
    const changed = applyWorkspaceChanges(app.workspace(), "Updated document", [{ kind: "document", artifactId: doc.id, expectedRevision: 1, content: "New content" }]);
    if (!changed.ok) throw new Error("Fixture edit failed");
    app.runtime.setWorkspace(changed.workspace);
    await app.call("undo_change", { change_id: changed.change.id });
    expect(app.workspace().documents[0].content).toBe(doc.content);
    const result = await app.call("redo_change", { change_id: changed.change.id });
    expect(result.isError).not.toBe(true);
    expect(app.workspace().documents[0].content).toBe("New content");
  });

  it("uses host controls for Activity and does not claim unsupported downloads", async () => {
    const app = setup();
    await app.call("control_activity", { action: "show" });
    expect(app.runtime.setActivityOpen).toHaveBeenCalledWith(true);
    await app.call("control_activity", { action: "clear" });
    expect(app.runtime.clearActivity).toHaveBeenCalledOnce();
    const doc = app.workspace().documents[0];
    const exported = await app.call("export_document", { document_id: doc.id });
    expect(exported.result.download_started).toBe(true);
    expect(app.runtime.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ content: doc.content }));
    delete app.runtime.downloadFile;
    const payload = await app.call("export_document", { document_id: doc.id });
    expect(payload.result.download_started).toBe(false);
    delete app.runtime.setActivityOpen;
    expect((await app.call("control_activity", { action: "show" })).isError).toBe(true);
  });
});

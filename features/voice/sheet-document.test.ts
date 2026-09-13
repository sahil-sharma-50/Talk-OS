import { describe, expect, it, vi } from "vitest";
import { createWorkspace, undoLastWorkspaceChange } from "@/features/workspace/workspace-model";
import { portableDocumentMarkdown } from "@/features/workspace/document-embeds";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";

async function setup() {
  let workspace = createWorkspace();
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: next => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: vi.fn() };
  let sequence = 0;
  const call = (name: string, args: Record<string, unknown>) => executeResearchTool({ type: "tool.call", call_id: `sheet-doc-${++sequence}`, name, arguments: args }, runtime);
  const document = await call("create_document", { title: "Budget report", content: "# Budget\n\n## Costs\nKeep this explanation.\n\n## Next steps\nKeep this too." });
  const sheet = await call("create_sheet", { title: "Launch budget", cells: { B2: "Item", C2: "Cost", B3: "Research", C3: 12, B4: "Design", C4: 18, B5: "Total", C5: "=SUM(C3:C4)", E10: "Outside selection" } });
  await call("format_sheet", { sheet_id: sheet.result.sheet_id, expected_revision: 1, range: "C3:C5", number_format: "currency", bold: true });
  const args = { document_id: document.result.document_id, expected_revision: 1, sheet_id: sheet.result.sheet_id, sheet_revision: 2, range: "B2:C5", placement: "after_section", section_heading: "Costs" };
  return { call, args, runtime, workspace: () => workspace, document: () => workspace.documents.find(doc => doc.id === args.document_id)! };
}

describe("sheet tables in documents", () => {
  it("inserts calculated, formatted cells at the requested section with source metadata and undo", async () => {
    const app = await setup(); const before = app.document().content;
    const result = await app.call("embed_sheet_in_document", app.args);
    expect(result.isError).not.toBe(true);
    const document = app.document(); const snapshot = document.embeds![String(result.result.embed_id)];
    expect(snapshot.kind).toBe("sheet");
    if (snapshot.kind !== "sheet") throw new Error("Expected sheet snapshot");
    expect(snapshot.range).toBe("B2:C5"); expect(snapshot.headerRow).toBe(true);
    expect(snapshot.rows.at(-1)?.at(-1)).toMatchObject({ text: "€30.00", numeric: true, style: { bold: true } });
    expect(document.content.indexOf("talkos-embed:")).toBeGreaterThan(document.content.indexOf("Keep this explanation."));
    expect(document.content.indexOf("talkos-embed:")).toBeLessThan(document.content.indexOf("## Next steps"));
    const read = await app.call("read_document", { document_id: document.id });
    expect(read.result.embeds).toContainEqual(expect.objectContaining({ id: snapshot.id, kind: "sheet", sheet_id: app.args.sheet_id, sheet_revision: 2, range: "B2:C5" }));
    const portable = portableDocumentMarkdown(document.content, document.embeds);
    expect(portable).toContain("| Item | Cost |"); expect(portable).toContain("€30.00");
    expect(portable).not.toContain("Outside selection"); expect(portable).not.toContain("talkos-embed:");
    expect(app.workspace().documentView).toMatchObject({ documentId: document.id, mode: "preview", embedId: snapshot.id });
    const undo = undoLastWorkspaceChange(app.workspace(), String(result.result.change_id));
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.workspace.documents.find(doc => doc.id === document.id)?.content).toBe(before);
  });

  it("keeps a selected range stable, refreshes it on request and relocates without duplication", async () => {
    const app = await setup(); const result = await app.call("embed_sheet_in_document", app.args);
    expect(result.isError).not.toBe(true);
    const id = String(result.result.embed_id); const original = structuredClone(app.document().embeds![id]);
    await app.call("update_sheet", { sheet_id: app.args.sheet_id, expected_revision: 2, cells: { C3: 20 } });
    expect(app.document().embeds![id]).toEqual(original);
    const refresh = await app.call("embed_sheet_in_document", { document_id: app.args.document_id, expected_revision: 2, sheet_id: app.args.sheet_id, sheet_revision: 3, embed_id: id });
    expect(refresh.isError).not.toBe(true);
    expect(portableDocumentMarkdown(app.document().content, app.document().embeds)).toContain("€38.00");
    expect(portableDocumentMarkdown(app.document().content, app.document().embeds)).not.toContain("Outside selection");
    const move = await app.call("embed_sheet_in_document", { ...app.args, expected_revision: 3, sheet_revision: 3, embed_id: id, section_heading: "Next steps" });
    expect(move.isError).not.toBe(true); expect(app.document().content.match(/talkos-embed:/g)).toHaveLength(1);
    expect(app.document().content.indexOf("talkos-embed:")).toBeGreaterThan(app.document().content.indexOf("Keep this too."));
  });

  it("inserts into the unsaved draft, includes the used sheet when range is omitted and preserves the source", async () => {
    const app = await setup(); const doc = app.document(); const source = structuredClone(app.workspace().sheets);
    app.runtime.setWorkspace({ ...app.workspace(), documentDrafts: { [doc.id]: { content: doc.content + "\nUnsaved text", baseContent: doc.content, baseRevision: 1 } } });
    const result = await app.call("embed_sheet_in_document", { ...app.args, range: undefined });
    expect(result.result.applied_to).toBe("draft"); expect(app.document()).toEqual(doc);
    const draft = app.workspace().documentDrafts![doc.id];
    expect(draft.content).toContain("Unsaved text"); expect(portableDocumentMarkdown(draft.content, draft.embeds)).toContain("Outside selection");
    expect(app.workspace().sheets).toEqual(source);
  });

  it.each([{ sheet_revision: 99 }, { expected_revision: 99 }, { range: "AA1:BB2" }, { range: "A0:B3" }, { range: "A1:B3:C5" }, { sheet_id: "missing" }, { embed_id: "missing" }])("rejects invalid or stale input without changing files: %j", async override => {
    const app = await setup(); const before = app.workspace();
    const result = await app.call("embed_sheet_in_document", { ...app.args, ...override });
    expect(result.isError).toBe(true); expect(app.workspace()).toEqual(before);
  });

  it("asks about empty ranges and missing sections instead of guessing", async () => {
    const app = await setup(); const before = app.workspace();
    for (const override of [{ range: "X1:Z3" }, { section_heading: "Unknown" }]) {
      const result = await app.call("embed_sheet_in_document", { ...app.args, ...override });
      expect(result.result.status).toBe("needs_clarification"); expect(app.workspace()).toEqual(before);
    }
  });
});

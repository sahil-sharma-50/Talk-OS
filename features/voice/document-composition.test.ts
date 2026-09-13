import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspace, undoLastWorkspaceChange } from "@/features/workspace/workspace-model";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";
import type { DocumentEmbed } from "@/features/workspace/workspace.types";

function snapshotSvg(embed: DocumentEmbed) {
  if (embed.kind !== "canvas") throw new Error("Expected a canvas snapshot");
  return embed.svg;
}

afterEach(() => vi.unstubAllGlobals());
async function setup(content = "# PRD\n\n## Market\nExisting evidence.\n\n## User flow\nKeep this description.\n\n### Exceptions\nKeep exceptions.\n\n## Success metrics\nKeep these metrics.") {
  let workspace = createWorkspace();
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "", setActiveView: vi.fn() };
  let n = 0;
  const call = (name: string, args: Record<string, unknown>) => executeResearchTool({ type: "tool.call", call_id: `call-${++n}`, name, arguments: args }, runtime);
  const doc = await call("create_document", { title: "Launch PRD", content });
  const canvas = await call("create_canvas", { title: "Acquisition flow", operations: [{ op: "add_node", id: "discover", role: "process", text: "Discover product", x: 0, y: 0 }, { op: "add_node", id: "signup", role: "process", text: "Sign up", x: 0, y: 200 }, { op: "connect", id: "link", sourceId: "discover", targetId: "signup" }] });
  const args = { document_id: doc.result.document_id, expected_revision: 1, canvas_id: canvas.result.canvas_id, canvas_revision: 1, placement: "after_section", section_heading: "User flow" };
  return { call, args, runtime, workspace: () => workspace, document: () => workspace.documents.find((item) => item.id === doc.result.document_id)! };
}

describe("voice document composition", () => {
  it("researches, inserts sourced content, then embeds the diagram after the complete named section as an undoable snapshot", async () => {
    const app = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ title: "Market update", url: "https://example.com/market", content: "Verified market evidence" }] }))));
    const research = await app.call("search_web", { query: "Current market update" });
    expect(research.isError).not.toBe(true);
    const insert = await app.call("insert_document_content", { document_id: app.args.document_id, expected_revision: 1, placement: "after_section", section_heading: "Market", content: "Current evidence. [Market update](https://example.com/market)" });
    expect(insert.isError).not.toBe(true);
    const before = app.document();
    const embed = await app.call("embed_canvas_in_document", { ...app.args, expected_revision: before.revision });
    expect(embed.isError).not.toBe(true);
    const document = app.document();
    const snapshot = Object.values(document.embeds!)[0];
    expect(snapshotSvg(snapshot)).toContain("Discover product");
    expect(snapshot.sourceRevision).toBe(1);
    expect(document.content.indexOf("talkos-embed:")).toBeGreaterThan(document.content.indexOf("Keep exceptions."));
    expect(document.content.indexOf("talkos-embed:")).toBeLessThan(document.content.indexOf("## Success metrics"));
    expect(document.content).toContain("[Market update](https://example.com/market)");
    expect(app.workspace().documentView).toMatchObject({ documentId: document.id, mode: "preview", section: "User flow" });
    expect(app.workspace().canvases).toHaveLength(1);
    const undo = undoLastWorkspaceChange(app.workspace(), String(embed.result.change_id));
    expect(undo.ok).toBe(true);
    if (undo.ok) expect(undo.workspace.documents.find((item) => item.id === document.id)?.content).toBe(before.content);
  });

  it.each(["Missing", "Repeated"])("asks about an unresolved section (%s) without changing the document", async (section) => {
    const app = await setup("# PRD\n## Repeated\nOne\n## Repeated\nTwo");
    const before = app.workspace();
    const result = await app.call("embed_canvas_in_document", { ...app.args, section_heading: section });
    expect(result.result.status).toBe("needs_clarification");
    expect(app.workspace()).toEqual(before);
  });

  it("ignores heading-like text in code blocks", async () => {
    const app = await setup("# PRD\n```md\n## User flow\nExample\n```\n## User flow\nReal content\n## Next\nKeep");
    const result = await app.call("embed_canvas_in_document", app.args);
    expect(result.isError).not.toBe(true);
    expect(app.document().content.indexOf("talkos-embed:")).toBeGreaterThan(app.document().content.indexOf("Real content"));
  });

  it("keeps the snapshot stable until an explicit refresh, and can relocate it without duplicating it", async () => {
    const app = await setup();
    const first = await app.call("embed_canvas_in_document", app.args);
    expect(first.isError).not.toBe(true);
    const id = String(first.result.embed_id); const original = snapshotSvg(app.document().embeds![id]);
    await app.call("edit_canvas", { canvas_id: app.args.canvas_id, expected_revision: 1, operations: [{ op: "set_text", id: "discover", text: "New discovery" }] });
    expect(snapshotSvg(app.document().embeds![id])).toBe(original);
    const moved = await app.call("embed_canvas_in_document", { ...app.args, expected_revision: app.document().revision, canvas_revision: 2, embed_id: id, section_heading: "Market" });
    expect(moved.isError).not.toBe(true);
    expect(Object.keys(app.document().embeds!)).toEqual([id]);
    expect(snapshotSvg(app.document().embeds![id])).toContain("New discovery");
    expect(app.document().content.match(/talkos-embed:/g)).toHaveLength(1);
    expect(app.document().content.indexOf("talkos-embed:")).toBeLessThan(app.document().content.indexOf("## User flow"));
  });

  it("inserts into the current draft without saving over it, and refuses a stale canvas revision", async () => {
    const app = await setup(); const doc = app.document();
    app.runtime.setWorkspace({ ...app.workspace(), documentDrafts: { [doc.id]: { content: `${doc.content}\nUnsaved words`, baseContent: doc.content, baseRevision: doc.revision } } });
    const bad = await app.call("embed_canvas_in_document", { ...app.args, canvas_revision: 9 });
    expect(bad.isError).toBe(true);
    const result = await app.call("embed_canvas_in_document", app.args);
    expect(result.result.applied_to).toBe("draft");
    expect(app.document()).toEqual(doc);
    expect(app.workspace().documentDrafts![doc.id].content).toContain("Unsaved words");
    expect(app.workspace().documentDrafts![doc.id].content).toContain("talkos-embed:");
    expect(Object.values(app.workspace().documentDrafts![doc.id].embeds!)).toHaveLength(1);
  });
});

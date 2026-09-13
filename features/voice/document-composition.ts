import { exportCanvasSvg } from "@/features/canvas/canvas-export";
import { documentEmbedPattern, embedMarkdown } from "@/features/workspace/document-embeds";
import { insertDocumentContent } from "@/features/workspace/document-sections";
import { applyWorkspaceChanges } from "@/features/workspace/workspace-model";
import { createSheetSnapshot } from "@/features/workspace/sheet-snapshot";
import { normalizeDocumentMarkdown } from "@/features/workspace/document-markdown";
import type { ResearchToolCall, ResearchToolExecution, WorkspaceRuntime } from "./research-tools";

const placement = {
  document_id: { type: "string" }, expected_revision: { type: "integer" },
  placement: { type: "string", enum: ["start", "end", "before_section", "after_section"] },
  section_heading: { type: "string", description: "Exact heading from read_document. after_section includes its body and subsections." },
  section_occurrence: { type: "integer", minimum: 1, description: "Use only after the user identifies which duplicate heading they mean." },
};
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({ type: "function" as const, name, description, execution_mode: "interactive" as const, timeout_seconds: 20, parameters: { type: "object", properties, required } });
export const documentCompositionTools = [
  tool("insert_document_content", "Insert Markdown, sourced research or a section at a precise document location, preserving all surrounding text and human drafts. Read the document first; ask the returned question if a heading is missing/ambiguous.", { ...placement, content: { type: "string" } }, ["document_id", "expected_revision", "placement", "content"]),
  tool("embed_canvas_in_document", "Insert a rendered, saved snapshot of an existing canvas diagram into a document and show its preview. Preserve the editable canvas. Read both revisions first. Supply embed_id from read_document to refresh or relocate an existing snapshot without duplicating it; omit placement when only refreshing.", { ...placement, canvas_id: { type: "string" }, canvas_revision: { type: "integer" }, embed_id: { type: "string" }, caption: { type: "string" } }, ["document_id", "expected_revision", "canvas_id", "canvas_revision"]),
  tool("embed_sheet_in_document", "Import an existing sheet into a document as a formatted table of calculated values and show its preview. Omit range to include all used cells, or choose an A1 range. Preserve the source sheet and unsaved document draft. Read both revisions first. Supply embed_id from read_document to refresh or relocate an existing table; omitted range retains its original selection, and omitted placement refreshes in place. Ask the returned question on ambiguity.", { ...placement, sheet_id: { type: "string" }, sheet_revision: { type: "integer" }, range: { type: "string", description: "Optional A1:D12 range. Omit for the whole used sheet; retain the previous selection when refreshing." }, header_row: { type: "boolean", description: "Whether the first included row contains column headings. Defaults to detection." }, embed_id: { type: "string" }, caption: { type: "string" } }, ["document_id", "expected_revision", "sheet_id", "sheet_revision"]),
];

export function executeDocumentComposition(call: ResearchToolCall, runtime: WorkspaceRuntime): ResearchToolExecution | null {
  if (!documentCompositionTools.some((tool) => tool.name === call.name)) return null;
  const reply = (value: Record<string, unknown>, error?: string): ResearchToolExecution => ({ result: { ...value, ...(error ? { error } : {}) }, ...(error ? { isError: true } : {}), events: [{ type: error ? "ACTION_FAILED" : "ACTION_COMPLETED", actionId: call.call_id, detail: error ?? String(value.message ?? "Document updated"), at: new Date().toISOString() }] });
  const clarify = (question: string, extra: Record<string, unknown> = {}) => reply({ status: "needs_clarification", question, message: "Waiting for clarification", ...extra });
  const args = call.arguments; const workspace = runtime.getWorkspace();
  const document = workspace.documents.find((item) => item.id === args.document_id);
  if (!document) return reply({}, "document_not_found");
  if (document.revision !== args.expected_revision) return reply({ current_revision: document.revision }, "revision_conflict");
  const draft = workspace.documentDrafts?.[document.id];
  const dirty = draft && draft.content !== draft.baseContent;
  if (dirty && draft.baseContent !== document.content) return clarify("Your draft and the saved document changed separately. Which version should I use?");
  let content = dirty ? draft.content : document.content;
  const embeds = { ...(dirty ? draft.embeds ?? document.embeds : document.embeds) };
  let embedId: string | undefined;
  let block = typeof args.content === "string" ? normalizeDocumentMarkdown(args.content) : "";
  const isEmbed = call.name === "embed_canvas_in_document" || call.name === "embed_sheet_in_document";
  if (isEmbed) {
    if (args.embed_id !== undefined && (typeof args.embed_id !== "string" || !embeds[args.embed_id])) return reply({}, "document_embed_not_found");
    embedId = typeof args.embed_id === "string" ? args.embed_id : `embed-${crypto.randomUUID()}`;
    const previous = embeds[embedId];
    const kind = call.name === "embed_sheet_in_document" ? "sheet" : "canvas";
    if (previous && previous.kind !== kind) return reply({}, "document_embed_kind_mismatch");
    if (args.embed_id && !content.split("\n").some((line) => line.match(documentEmbedPattern)?.[2] === embedId)) return reply({}, "document_embed_not_in_content");
    const caption = typeof args.caption === "string" && args.caption.trim() ? args.caption.trim() : previous?.title;
    if (call.name === "embed_sheet_in_document") {
      const sheet = workspace.sheets.find(item => item.id === args.sheet_id);
      if (!sheet) return reply({}, "sheet_not_found");
      if (sheet.revision !== args.sheet_revision) return reply({ current_sheet_revision: sheet.revision }, "sheet_revision_conflict");
      if (args.range !== undefined && typeof args.range !== "string") return reply({}, "invalid_sheet_range");
      if (args.header_row !== undefined && typeof args.header_row !== "boolean") return reply({}, "invalid_header_row");
      const oldTable = previous?.kind === "sheet" ? previous : undefined;
      const selectedRange = (args.range as string | undefined) ?? oldTable?.sourceRange;
      const snapshot = createSheetSnapshot(sheet, selectedRange, (args.header_row as boolean | undefined) ?? (args.range === undefined ? oldTable?.headerRow : undefined));
      if ("error" in snapshot) return reply({}, snapshot.error);
      if ("question" in snapshot) return clarify(snapshot.question);
      embeds[embedId] = { id: embedId, kind: "sheet", title: caption ?? sheet.title, sourceId: sheet.id, sourceRevision: sheet.revision, createdAt: new Date().toISOString(), ...snapshot };
    } else {
      const canvas = workspace.canvases.find((item) => item.id === args.canvas_id);
      if (!canvas) return reply({}, "canvas_not_found");
      if (canvas.revision !== args.canvas_revision) return reply({ current_canvas_revision: canvas.revision }, "canvas_revision_conflict");
      if (!canvas.elements.length) return clarify("This canvas is empty. What should the diagram show?");
      const title = caption ?? canvas.title;
      embeds[embedId] = { id: embedId, kind: "canvas", title, sourceId: canvas.id, sourceRevision: canvas.revision, createdAt: new Date().toISOString(), svg: exportCanvasSvg(canvas, workspace.canvasAssets, { fitToContent: true, background: "transparent" }) };
    }
    block = embedMarkdown(embeds[embedId].title, embedId);
    if (args.embed_id && args.placement === undefined) content = content.split("\n").map((line) => line.match(documentEmbedPattern)?.[2] === embedId ? block : line).join("\n");
    else if (args.embed_id) content = content.split("\n").filter((line) => line.match(documentEmbedPattern)?.[2] !== embedId).join("\n");
  }
  if (!block.trim()) return clarify("What content should I insert?");
  if (!(isEmbed && args.embed_id && args.placement === undefined)) {
    const inserted = insertDocumentContent(content, block, String(args.placement ?? "end"), typeof args.section_heading === "string" ? args.section_heading : undefined, typeof args.section_occurrence === "number" ? args.section_occurrence : undefined);
    if ("question" in inserted) return clarify(inserted.question, { sections: inserted.sections });
    content = inserted.content;
  }
  let next = workspace; let changeId: string | undefined;
  if (dirty) next = { ...workspace, documentDrafts: { ...workspace.documentDrafts, [document.id]: { ...draft, content, embeds } } };
  else {
    const changed = applyWorkspaceChanges(workspace, `${embedId ? "Inserted snapshot in" : "Updated"} ${document.title}`, [{ kind: "document", artifactId: document.id, expectedRevision: document.revision, content, embeds }]);
    if (!changed.ok) return reply({}, changed.error);
    next = changed.workspace; changeId = changed.change.id;
  }
  next = { ...next, activeDocumentId: document.id, documentView: { documentId: document.id, mode: "preview", section: typeof args.section_heading === "string" ? args.section_heading : undefined, embedId, requestId: crypto.randomUUID() } };
  runtime.setWorkspace(next); runtime.setActiveView?.("documents");
  return reply({ document_id: document.id, revision: document.revision + (dirty ? 0 : 1), applied_to: dirty ? "draft" : "saved", ...(embedId ? { embed_id: embedId, source_revision: embeds[embedId].sourceRevision } : {}), ...(changeId ? { change_id: changeId } : {}), message: call.name === "embed_sheet_in_document" ? "Sheet table placed in document" : embedId ? "Diagram snapshot placed in document" : "Content inserted in document" });
}

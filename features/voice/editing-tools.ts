import { applyWorkspaceChanges, renameArtifact } from "@/features/workspace/workspace-model";
import { insertSheetRows, sheetRangeAddresses, validSheetAddress } from "@/features/workspace/sheet-operations";
import type { ArtifactType, SheetCellFormat, SheetCellStyle } from "@/features/workspace/workspace.types";
import type { ResearchToolCall, ResearchToolExecution, WorkspaceRuntime } from "./research-tools";

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({ type: "function" as const, name, description, execution_mode: "interactive" as const, timeout_seconds: 20, parameters: { type: "object", properties, required } });
const id = { type: "string" }; const revision = { type: "integer", minimum: 1 };
export const editingTools = [
  tool("format_document", "Apply bold, italic, underline, strikethrough, heading, list or quote to selected text, an exact unique phrase, or the whole document. Retains human drafts. Read the document first; ambiguous targets return a question to ask.", { document_id: id, expected_revision: revision, format: { type: "string", enum: ["bold", "italic", "underline", "strikethrough", "heading", "bulleted_list", "numbered_list", "quote", "code"] }, target_text: id, scope: { type: "string", enum: ["selection", "all"] } }, ["document_id", "expected_revision", "format"]),
  tool("format_sheet", "Format a cell, range, or entire column without changing formulas or values.", { sheet_id: id, expected_revision: revision, range: { type: "string", description: "A1, A1:C10 or B:B for the whole column." }, number_format: { type: "string", enum: ["text", "number", "currency", "percent"] }, bold: { type: "boolean" }, italic: { type: "boolean" }, underline: { type: "boolean" }, align: { type: "string", enum: ["left", "center", "right"] }, background: { type: "string", description: "Six-digit hex color" }, color: { type: "string", description: "Six-digit hex text color" } }, ["sheet_id", "expected_revision", "range"]),
  tool("insert_sheet_rows", "Insert blank rows before a row number, shifting data and formula references. Use update_sheet afterward to populate the new row. Returns the new revision.", { sheet_id: id, expected_revision: revision, before_row: { type: "integer", minimum: 1, maximum: 1000 }, count: { type: "integer", minimum: 1, maximum: 1000 } }, ["sheet_id", "expected_revision", "before_row"]),
  tool("rename_artifact", "Rename a document, sheet, planner, canvas or dashboard using its current revision.", { artifact_id: id, expected_revision: revision, kind: { type: "string", enum: ["document", "sheet", "planner", "canvas", "dashboard"] }, title: id }, ["artifact_id", "expected_revision", "kind", "title"]),
];
const result = (call: ResearchToolCall, value: Record<string, unknown>, error?: string): ResearchToolExecution => ({ result: error ? { error, ...value } : value, ...(error ? { isError: true } : {}), events: [{ type: error ? "ACTION_FAILED" : "ACTION_COMPLETED", actionId: call.call_id, detail: error ?? String(value.message ?? "Workspace updated"), at: new Date().toISOString() }] });
const clarify = (call: ResearchToolCall, question: string) => result(call, { status: "needs_clarification", question, message: "Waiting for clarification" });

export function executeEditingTool(call: ResearchToolCall, runtime: WorkspaceRuntime, signal?: AbortSignal): ResearchToolExecution | null {
  if (!editingTools.some((tool) => tool.name === call.name)) return null;
  if (signal?.aborted) return result(call, {}, "interrupted");
  const workspace = runtime.getWorkspace(); const args = call.arguments;
  if (call.name === "rename_artifact") {
    const lists = { document: workspace.documents, sheet: workspace.sheets, planner: workspace.planners, canvas: workspace.canvases, dashboard: workspace.dashboards };
    if (!Object.hasOwn(lists, String(args.kind))) return result(call, {}, "invalid_artifact_kind");
    const kind = args.kind as ArtifactType; const artifact = lists[kind].find((item) => item.id === args.artifact_id);
    if (!artifact) return result(call, {}, "artifact_not_found");
    if (artifact.revision !== args.expected_revision) return result(call, { current_revision: artifact.revision }, "revision_conflict");
    if (typeof args.title !== "string" || !args.title.trim()) return clarify(call, "What should I name it?");
    runtime.setWorkspace(renameArtifact(workspace, kind, artifact.id, args.title));
    return result(call, { artifact_id: artifact.id, revision: artifact.revision + 1, message: `Renamed to ${args.title.trim()}` });
  }
  if (call.name === "format_document") {
    const document = workspace.documents.find((item) => item.id === args.document_id);
    if (!document) return result(call, {}, "document_not_found");
    if (document.revision !== args.expected_revision) return result(call, { current_revision: document.revision }, "revision_conflict");
    const draft = workspace.documentDrafts?.[document.id]; const content = draft?.content ?? document.content;
    let start = 0; let end = content.length;
    if (args.scope !== "all") {
      if (typeof args.target_text === "string" && args.target_text) {
        start = content.indexOf(args.target_text); end = start + args.target_text.length;
        if (start < 0) return clarify(call, "I could not find that exact text. Which phrase should I format?");
        if (content.indexOf(args.target_text, end) >= 0) return clarify(call, "That phrase appears more than once. Which occurrence should I format?");
      } else {
        const selection = runtime.getContext?.().selection;
        if (!selection || selection.kind !== "document" || selection.artifactId !== document.id || selection.start === undefined || selection.end === undefined || selection.start === selection.end || selection.text !== content.slice(selection.start, selection.end)) return clarify(call, "Which text should I format, or should I apply it to the whole document?");
        start = selection.start; end = selection.end;
      }
    }
    const selected = content.slice(start, end);
    const wraps: Record<string, [string, string]> = { bold: ["**", "**"], italic: ["_", "_"], underline: ["<u>", "</u>"], strikethrough: ["~~", "~~"], code: ["`", "`"] };
    const wrap = wraps[String(args.format)]; let formatted: string;
    if (wrap) formatted = selected.startsWith(wrap[0]) && selected.endsWith(wrap[1]) ? selected : `${wrap[0]}${selected}${wrap[1]}`;
    else if (["heading", "bulleted_list", "numbered_list", "quote"].includes(String(args.format))) formatted = selected.split("\n").map((line, index) => `${args.format === "heading" ? "## " : args.format === "bulleted_list" ? "- " : args.format === "quote" ? "> " : `${index + 1}. `}${line}`).join("\n");
    else return result(call, {}, "unsupported_document_format");
    const next = content.slice(0, start) + formatted + content.slice(end);
    if (draft && draft.content !== draft.baseContent) {
      runtime.setWorkspace({ ...workspace, documentDrafts: { ...workspace.documentDrafts, [document.id]: { ...draft, content: next } } });
      return result(call, { document_id: document.id, revision: document.revision, applied_to: "draft", message: "Formatted your current draft" });
    }
    const changed = applyWorkspaceChanges(workspace, `Formatted ${document.title}`, [{ kind: "document", artifactId: document.id, expectedRevision: document.revision, content: next }]);
    if (!changed.ok) return result(call, {}, changed.error);
    runtime.setWorkspace(changed.workspace);
    return result(call, { document_id: document.id, revision: document.revision + 1, change_id: changed.change.id, message: "Document formatted" });
  }
  const sheet = workspace.sheets.find((item) => item.id === args.sheet_id);
  if (!sheet) return result(call, {}, "sheet_not_found");
  if (sheet.revision !== args.expected_revision) return result(call, { current_revision: sheet.revision }, "revision_conflict");
  try {
    let changed;
    if (call.name === "insert_sheet_rows") {
      const cells = insertSheetRows(sheet.cells, args.before_row as number, args.count === undefined ? 1 : args.count as number);
      changed = applyWorkspaceChanges(workspace, "Inserted sheet rows", [{ kind: "sheet", artifactId: sheet.id, expectedRevision: sheet.revision, cells: {}, replaceCells: cells }]);
    } else {
      if (typeof args.range !== "string") return result(call, {}, "range_required");
      const range = args.range.toUpperCase().replace(/^([A-Z]):([A-Z])$/, (_, start: string, end: string) => `${start}1:${end}1000`);
      const addresses = sheetRangeAddresses(range); const style: SheetCellStyle = {};
      for (const key of ["bold", "italic", "underline"] as const) { if (args[key] !== undefined) { if (typeof args[key] !== "boolean") throw new Error("Formatting flags must be true or false."); style[key] = args[key]; } }
      if (args.align !== undefined) { if (!["left", "center", "right"].includes(String(args.align))) throw new Error("Invalid alignment."); style.align = args.align as SheetCellStyle["align"]; }
      for (const key of ["color", "background"] as const) if (args[key] !== undefined) { if (typeof args[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(args[key])) throw new Error("Use a six-digit hex color."); style[key] = args[key]; }
      if (args.number_format !== undefined && !["text", "number", "currency", "percent"].includes(String(args.number_format))) throw new Error("Unsupported number format.");
      if (!addresses.every(validSheetAddress)) throw new Error("Invalid cell address.");
      changed = applyWorkspaceChanges(workspace, "Formatted sheet cells", [{ kind: "sheet", artifactId: sheet.id, expectedRevision: sheet.revision, cells: {}, styles: Object.fromEntries(addresses.map((address) => [address, style])), ...(args.number_format ? { formats: Object.fromEntries(addresses.map((address) => [address, args.number_format as SheetCellFormat])) } : {}) }]);
    }
    if (!changed.ok) return result(call, {}, changed.error);
    runtime.setWorkspace(changed.workspace);
    return result(call, { sheet_id: sheet.id, revision: sheet.revision + 1, change_id: changed.change.id, message: call.name === "format_sheet" ? "Sheet formatted" : "Rows inserted" });
  } catch (error) { return result(call, { detail: error instanceof Error ? error.message : "Invalid sheet edit" }, "invalid_sheet_edit"); }
}

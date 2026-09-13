import { applyWorkspaceChanges, duplicateArtifact, moveArtifactToTrash, redoWorkspaceChange, restoreTrashedArtifact } from "@/features/workspace/workspace-model";
import { activeWorkspaceArtifact, viewForArtifact, workspaceItems } from "@/features/workspace/workspace-navigation";
import type { ArtifactType } from "@/features/workspace/workspace.types";
import type { ResearchToolCall, ResearchToolExecution, WorkspaceRuntime } from "./research-tools";

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({ type: "function" as const, name, description, execution_mode: "interactive" as const, timeout_seconds: 20, parameters: { type: "object", properties, required } });
export const workspaceFileTools = [
  tool("manage_artifact", "Duplicate a file, move it to recoverable Trash, or restore it from Trash. For deletion use action trash with artifact_id and expected_revision from get_workspace. Kind can be omitted: the exact file id determines its type. Never use trash unless the user requested removal.", { action: { type: "string", enum: ["duplicate", "trash", "restore"] }, kind: { type: "string", enum: ["document", "sheet", "planner", "canvas", "dashboard"], description: "Optional singular file type, not the workspace tab name. Omit when using the exact artifact_id." }, artifact_id: { type: "string" }, expected_revision: { type: "integer" }, trash_id: { type: "string" }, document_version: { type: "string", enum: ["saved", "draft"], description: "When duplicating a document with unsaved edits, ask which version to copy, then supply the choice. The original is unchanged." } }, ["action"]),
  tool("save_document", "Save the current local document draft, including diagram snapshots, without overwriting conflicting edits. Read the current document first.", { document_id: { type: "string" }, expected_revision: { type: "integer" } }, ["document_id", "expected_revision"]),
  tool("redo_change", "Redo an undone workspace change while checking for intervening edits.", { change_id: { type: "string" } }, ["change_id"]),
  tool("control_activity", "Show or hide the Activity drawer, or clear its ledger when the user asks. Clearing history leaves workspace files untouched.", { action: { type: "string", enum: ["show", "hide", "clear"] } }, ["action"]),
];

export function executeWorkspaceFileTool(call: ResearchToolCall, runtime: WorkspaceRuntime): ResearchToolExecution | null {
  if (!workspaceFileTools.some((tool) => tool.name === call.name)) return null;
  const reply = (value: Record<string, unknown>, error?: string): ResearchToolExecution => ({ result: { ...value, ...(error ? { error } : {}) }, ...(error ? { isError: true } : {}), events: [{ type: error ? "ACTION_FAILED" : "ACTION_COMPLETED", actionId: call.call_id, detail: error ?? String(value.message ?? "Workspace updated"), at: new Date().toISOString() }] });
  const args = call.arguments; const workspace = runtime.getWorkspace();
  const requestedAction = String(args.action ?? "").trim().toLowerCase();
  const action = ["delete", "remove"].includes(requestedAction) ? "trash" : requestedAction;
  if (call.name === "control_activity") {
    if (args.action === "clear" && runtime.clearActivity) runtime.clearActivity();
    else if (["show", "hide"].includes(String(args.action)) && runtime.setActivityOpen) runtime.setActivityOpen(args.action === "show");
    else return reply({}, "activity_control_unavailable");
    return reply({ message: args.action === "clear" ? "Ledger cleared" : args.action === "show" ? "Activity opened" : "Activity closed" });
  }
  if (call.name === "save_document") {
    const doc = workspace.documents.find((item) => item.id === args.document_id);
    if (!doc) return reply({}, "document_not_found");
    if (doc.revision !== args.expected_revision) return reply({ current_revision: doc.revision }, "revision_conflict");
    const draft = workspace.documentDrafts?.[doc.id];
    if (!draft || draft.content === draft.baseContent) return reply({ document_id: doc.id, revision: doc.revision, message: "Document already saved" });
    if (draft.baseContent !== doc.content) return reply({ status: "needs_clarification", question: "The saved document and your draft both changed. Which version should I keep?", message: "Waiting for clarification" });
    const saved = applyWorkspaceChanges(workspace, `Saved ${doc.title}`, [{ kind: "document", artifactId: doc.id, expectedRevision: doc.revision, content: draft.content, embeds: draft.embeds }]);
    if (!saved.ok) return reply({}, saved.error);
    const drafts = { ...saved.workspace.documentDrafts }; delete drafts[doc.id];
    runtime.setWorkspace({ ...saved.workspace, documentDrafts: drafts });
    return reply({ document_id: doc.id, revision: doc.revision + 1, change_id: saved.change.id, message: "Document saved" });
  }
  if (call.name === "redo_change") {
    const result = redoWorkspaceChange(workspace, String(args.change_id ?? ""));
    if (!result.ok) return reply({}, result.error);
    runtime.setWorkspace(result.workspace);
    const target = result.change.after?.at(-1); if (target) runtime.setActiveView?.(viewForArtifact[target.artifactType]);
    return reply({ change_id: result.change.id, message: "Change redone" });
  }
  if (action === "restore") {
    const item = workspace.trash.find((entry) => entry.id === args.trash_id);
    if (!item) return reply({}, "trash_item_not_found");
    if (workspaceItems(workspace, viewForArtifact[item.artifactType]).some((entry) => entry.id === item.artifact.id)) return reply({}, "artifact_already_exists");
    runtime.setWorkspace(restoreTrashedArtifact(workspace, item.id)); runtime.setActiveView?.(viewForArtifact[item.artifactType]);
    return reply({ artifact_id: item.artifact.id, message: `Restored ${item.artifact.title}` });
  }
  const lists = { document: workspace.documents, sheet: workspace.sheets, planner: workspace.planners, canvas: workspace.canvases, dashboard: workspace.dashboards };
  const aliases: Record<string, ArtifactType> = { document: "document", documents: "document", doc: "document", sheet: "sheet", sheets: "sheet", spreadsheet: "sheet", spreadsheets: "sheet", planner: "planner", planners: "planner", plan: "planner", plans: "planner", canvas: "canvas", canvases: "canvas", dashboard: "dashboard", dashboards: "dashboard" };
  const requestedKind = typeof args.kind === "string" ? args.kind.trim().toLowerCase() : "";
  const kindHint = Object.hasOwn(aliases, requestedKind) ? aliases[requestedKind] : undefined;
  const matches = Object.entries(lists).flatMap(([kind, items]) => items.filter(item => item.id === args.artifact_id).map(artifact => ({ kind: kind as ArtifactType, artifact })));
  if (matches.length !== 1) return reply({ message: "Read get_workspace and use the exact file id and revision.", valid_kinds: Object.keys(lists) }, matches.length ? "ambiguous_artifact_id" : "artifact_not_found");
  const { kind, artifact } = matches[0];
  if (kindHint && kindHint !== kind) return reply({ actual_kind: kind, message: "The id belongs to a different file type. Check the target before retrying." }, "artifact_kind_mismatch");
  if (artifact.revision !== args.expected_revision) return reply({ current_revision: artifact.revision }, "revision_conflict");
  if (action !== "duplicate" && action !== "trash") return reply({}, "invalid_artifact_action");
  const draft = kind === "document" ? workspace.documentDrafts?.[artifact.id] : undefined;
  if (args.document_version !== undefined && !["saved", "draft"].includes(String(args.document_version))) return reply({}, "invalid_document_version");
  if (action === "duplicate" && draft && draft.content !== draft.baseContent && args.document_version === undefined) return reply({ status: "needs_clarification", question: "Should I duplicate the saved document or your current draft?", message: "Waiting for clarification" });
  let next = action === "duplicate" ? duplicateArtifact(workspace, kind, artifact.id) : moveArtifactToTrash(workspace, kind, artifact.id);
  if (action === "duplicate" && kind === "document" && args.document_version === "draft" && draft) {
    next = { ...next, documents: next.documents.map((item) => item.id === next.activeDocumentId ? { ...item, content: draft.content, embeds: draft.embeds ?? item.embeds, history: [] } : item) };
  }
  runtime.setWorkspace(next); runtime.setActiveView?.(viewForArtifact[kind]);
  return reply({ kind, artifact_id: action === "duplicate" ? activeWorkspaceArtifact(next, viewForArtifact[kind]) : artifact.id, ...(action === "trash" ? { trash_id: next.trash.at(-1)?.id } : {}), message: action === "duplicate" ? `Duplicated ${artifact.title}` : `Moved ${artifact.title} to Trash` });
}

import type { SessionEvent, WorkspaceView } from "@/features/session/session.types";
import { addRetrievedSources, applyWorkspaceChanges, createPlanner, createSheet, createWorkspaceDocument, undoLastWorkspaceChange, updateWorkspaceTask } from "@/features/workspace/workspace-model";
import type { PlannerTask, RetrievedSource, SheetCell, WorkspaceMutation, WorkspaceSnapshot } from "@/features/workspace/workspace.types";

export interface ResearchToolCall { type: "tool.call"; call_id: string; name: string; arguments: Record<string, unknown> }
interface FunctionTool { type: "function"; name: string; description: string; execution_mode: "interactive"; timeout_seconds: number; parameters: Record<string, unknown> }
export interface WorkspaceRuntime { getWorkspace(): WorkspaceSnapshot; setWorkspace(workspace: WorkspaceSnapshot): void; getTavilyApiKey(): string; setActiveView?(view: Exclude<WorkspaceView, "settings">): void }
export interface ResearchToolExecution { events: SessionEvent[]; result: Record<string, unknown>; isError?: boolean }

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): FunctionTool => ({ type: "function", name, description, execution_mode: "interactive", timeout_seconds: 20, parameters: { type: "object", properties, ...(required.length ? { required } : {}) } });
const artifactId = { type: "string", description: "The exact workspace artifact id." };
const expectedRevision = { type: "number", description: "The artifact revision returned by the latest read." };
const cellsSchema = { type: "object", description: "A1 cell addresses mapped to text, numbers, or formulas beginning with =.", additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] } };
const plannerTasksSchema = { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, notes: { type: "string" }, completed: { type: "boolean" }, due_date: { type: "string" }, starts_at: { type: "string" }, ends_at: { type: "string" } }, required: ["title"] } };

export const workspaceTools: FunctionTool[] = [
  tool("get_workspace", "List documents, sheets, planners, current task, research collections, and recent changes. Use before planning or editing.", {}),
  tool("read_document", "Read a document by id. Omit document_id to read the active document.", { document_id: artifactId }),
  tool("create_document", "Create an editable document and open Documents.", { title: { type: "string" }, content: { type: "string" } }, ["title", "content"]),
  tool("edit_document", "Revision-safe document edit. Cite researched claims with Markdown links.", { document_id: artifactId, expected_revision: expectedRevision, title: { type: "string" }, content: { type: "string" } }, ["document_id", "expected_revision", "content"]),
  tool("create_sheet", "Create a working sheet and open Sheets.", { title: { type: "string" }, cells: cellsSchema }, ["title"]),
  tool("read_sheet", "Read a sheet's input cells, formulas, calculated values, and revision.", { sheet_id: artifactId }, ["sheet_id"]),
  tool("update_sheet", "Revision-safe update to sheet cells.", { sheet_id: artifactId, expected_revision: expectedRevision, cells: cellsSchema }, ["sheet_id", "expected_revision", "cells"]),
  tool("create_planner", "Create a task planner and open Planner.", { title: { type: "string" }, tasks: plannerTasksSchema }, ["title"]),
  tool("read_planner", "Read a planner and its revision.", { planner_id: artifactId }, ["planner_id"]),
  tool("update_planner", "Replace a planner task list using its current revision.", { planner_id: artifactId, expected_revision: expectedRevision, tasks: plannerTasksSchema }, ["planner_id", "expected_revision", "tasks"]),
  tool("apply_workspace_changes", "Atomically update related documents, sheets, and planners as one undoable change. Validate every expected revision first.", { label: { type: "string" }, changes: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["document", "sheet", "planner"] }, artifact_id: artifactId, expected_revision: expectedRevision, title: { type: "string" }, content: { type: "string" }, cells: cellsSchema, tasks: plannerTasksSchema }, required: ["kind", "artifact_id", "expected_revision"] } } }, ["label", "changes"]),
  tool("undo_change", "Undo one coordinated workspace change if none of its artifacts changed again.", { change_id: { type: "string" } }),
  tool("update_task", "Set or revise the objective, constraints, and short visible plan.", { objective: { type: "string" }, constraints: { type: "array", items: { type: "string" } }, steps: { type: "array", items: { type: "string" } } }, ["objective"]),
  tool("search_web", "Search the public web with Tavily. Results stay grouped under this exact query.", { query: { type: "string" } }, ["query"]),
  tool("read_sources", "Extract the full text of up to eight retrieved source URLs.", { urls: { type: "array", items: { type: "string" }, maxItems: 8 } }, ["urls"]),
  tool("summarize_research", "Attach a sourced summary to one research collection.", { collection_id: { type: "string" }, summary: { type: "string" }, source_ids: { type: "array", items: { type: "string" } } }, ["collection_id", "summary", "source_ids"]),
  tool("export_document", "Prepare a document as a Markdown download payload.", { document_id: artifactId }, ["document_id"]),
];

export const LIVE_GREETING = "Hi, I’m TalkOS. What would you like to get done today?";

export const LIVE_SYSTEM_PROMPT = `You are TalkOS, a general productivity agent that controls a visible workspace through natural conversation.
The workspace has Documents, Sheets, Planner, and Research. Inspect it before claiming to know its contents, create a short plan, then do useful work.
Use Sheets for calculations, Planner for tasks and dates, Documents for deliverables, and Research only when current public facts help. Open the tool you are using.
When one request changes related artifacts, use apply_workspace_changes so the user can undo it as one action. Never invent sources or claim a change succeeded before its result confirms it.
Keep spoken updates short. The user can interrupt or change a constraint at any time; acknowledge the correction, revise the task, and avoid committing stale work.
The newest completed user turn overrides any conflicting earlier instruction. When redirected, abandon stale tool results and replan from the correction.`;

const success = (call: ResearchToolCall, detail: string, result: Record<string, unknown>): ResearchToolExecution => ({ events: [{ type: "ACTION_COMPLETED", actionId: call.call_id, detail, at: new Date().toISOString() }], result });
const failure = (call: ResearchToolCall, error: string, extra: Record<string, unknown> = {}): ResearchToolExecution => ({ events: [{ type: "ACTION_FAILED", actionId: call.call_id, detail: error, at: new Date().toISOString() }], result: { error, ...extra }, isError: true });
const text = (args: Record<string, unknown>, key: string) => typeof args[key] === "string" ? String(args[key]).trim() : "";
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
const cells = (value: unknown): Record<string, string | number> => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string" || typeof item === "number")) : {};
const plannerTasks = (value: unknown): PlannerTask[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).title === "string").map((item) => ({
  id: typeof item.id === "string" ? item.id : crypto.randomUUID(), title: String(item.title).trim(), notes: typeof item.notes === "string" ? item.notes : undefined,
  completed: item.completed === true, dueDate: typeof item.due_date === "string" ? item.due_date : undefined,
  startsAt: typeof item.starts_at === "string" ? item.starts_at : undefined, endsAt: typeof item.ends_at === "string" ? item.ends_at : undefined,
})) : [];
const commit = (runtime: WorkspaceRuntime, signal: AbortSignal | undefined, workspace: WorkspaceSnapshot) => { if (signal?.aborted) return false; runtime.setWorkspace(workspace); return true; };

export async function executeResearchTool(call: ResearchToolCall, runtime: WorkspaceRuntime, signal?: AbortSignal): Promise<ResearchToolExecution> {
  const workspace = runtime.getWorkspace(); const args = call.arguments;
  if (signal?.aborted) return failure(call, "interrupted");

  if (call.name === "get_workspace") return success(call, "Workspace inspected", {
    active_document_id: workspace.activeDocumentId, documents: workspace.documents.map(({ id, title, kind, revision }) => ({ id, title, kind, revision })),
    active_sheet_id: workspace.activeSheetId, sheets: workspace.sheets.map(({ id, title, revision }) => ({ id, title, revision })),
    active_planner_id: workspace.activePlannerId, planners: workspace.planners.map(({ id, title, revision, tasks }) => ({ id, title, revision, task_count: tasks.length })),
    task: workspace.task, research: workspace.researchCollections.map(({ id, query, summary, sourceIds, status }) => ({ id, query, summary, source_ids: sourceIds, status })),
    recent_changes: workspace.changeHistory.slice(-5).map(({ id, label, undone }) => ({ id, label, undone })),
  });
  if (call.name === "read_document") {
    const document = workspace.documents.find((item) => item.id === (text(args, "document_id") || workspace.activeDocumentId));
    return document ? success(call, `Read ${document.title}`, { id: document.id, title: document.title, content: document.content, revision: document.revision }) : failure(call, "document_not_found");
  }
  if (call.name === "create_document") {
    const next = createWorkspaceDocument(workspace, text(args, "title"), text(args, "content"), "brief"); if (!commit(runtime, signal, next)) return failure(call, "interrupted");
    runtime.setActiveView?.("documents"); const document = next.documents.at(-1)!; return success(call, `${document.title} created`, { document_id: document.id, revision: document.revision });
  }
  if (call.name === "edit_document") {
    const result = applyWorkspaceChanges(workspace, `Updated ${text(args, "title") || "document"}`, [{ kind: "document", artifactId: text(args, "document_id"), expectedRevision: args.expected_revision as number, content: typeof args.content === "string" ? args.content : "", title: text(args, "title") || undefined }]);
    if (!result.ok) return failure(call, result.error, { artifact_id: result.artifactId, current_revision: result.currentRevision });
    if (!commit(runtime, signal, result.workspace)) return failure(call, "interrupted"); runtime.setActiveView?.("documents");
    return success(call, "Document updated", { document_id: text(args, "document_id"), revision: result.change.afterRevisions[text(args, "document_id")], change_id: result.change.id });
  }
  if (call.name === "create_sheet") {
    const input = cells(args.cells); const cellMap = Object.fromEntries(Object.entries(input).map(([address, value]) => [address.toUpperCase(), { value } satisfies SheetCell]));
    const next = createSheet(workspace, text(args, "title"), cellMap); if (!commit(runtime, signal, next)) return failure(call, "interrupted"); runtime.setActiveView?.("sheets");
    const sheet = next.sheets.at(-1)!; return success(call, `${sheet.title} created`, { sheet_id: sheet.id, revision: sheet.revision });
  }
  if (call.name === "read_sheet") {
    const sheet = workspace.sheets.find((item) => item.id === text(args, "sheet_id")); if (!sheet) return failure(call, "sheet_not_found");
    const { evaluateSheet } = await import("@/features/workspace/sheet-formulas"); return success(call, `Read ${sheet.title}`, { id: sheet.id, title: sheet.title, revision: sheet.revision, cells: sheet.cells, calculated_values: evaluateSheet(sheet.cells) });
  }
  if (call.name === "update_sheet") {
    const id = text(args, "sheet_id"); const result = applyWorkspaceChanges(workspace, "Updated sheet", [{ kind: "sheet", artifactId: id, expectedRevision: args.expected_revision as number, cells: cells(args.cells) }]);
    if (!result.ok) return failure(call, result.error, { artifact_id: result.artifactId, current_revision: result.currentRevision }); if (!commit(runtime, signal, result.workspace)) return failure(call, "interrupted"); runtime.setActiveView?.("sheets");
    return success(call, "Sheet updated", { sheet_id: id, revision: result.change.afterRevisions[id], change_id: result.change.id });
  }
  if (call.name === "create_planner") {
    const next = createPlanner(workspace, text(args, "title"), plannerTasks(args.tasks)); if (!commit(runtime, signal, next)) return failure(call, "interrupted"); runtime.setActiveView?.("planner"); const planner = next.planners.at(-1)!;
    return success(call, `${planner.title} created`, { planner_id: planner.id, revision: planner.revision });
  }
  if (call.name === "read_planner") {
    const planner = workspace.planners.find((item) => item.id === text(args, "planner_id")); return planner ? success(call, `Read ${planner.title}`, { id: planner.id, title: planner.title, revision: planner.revision, timezone: planner.timezone, tasks: planner.tasks }) : failure(call, "planner_not_found");
  }
  if (call.name === "update_planner") {
    const id = text(args, "planner_id"); const result = applyWorkspaceChanges(workspace, "Updated plan", [{ kind: "planner", artifactId: id, expectedRevision: args.expected_revision as number, tasks: plannerTasks(args.tasks) }]);
    if (!result.ok) return failure(call, result.error, { artifact_id: result.artifactId, current_revision: result.currentRevision }); if (!commit(runtime, signal, result.workspace)) return failure(call, "interrupted"); runtime.setActiveView?.("planner");
    return success(call, "Plan updated", { planner_id: id, revision: result.change.afterRevisions[id], change_id: result.change.id });
  }
  if (call.name === "apply_workspace_changes") {
    const raw = Array.isArray(args.changes) ? args.changes : []; const mutations: WorkspaceMutation[] = [];
    raw.forEach((item) => {
      if (!item || typeof item !== "object") return; const change = item as Record<string, unknown>; const kind = change.kind; const id = text(change, "artifact_id"); const revision = change.expected_revision;
      if ((kind !== "document" && kind !== "sheet" && kind !== "planner") || !id || typeof revision !== "number") return;
      if (kind === "document") mutations.push({ kind, artifactId: id, expectedRevision: revision, content: typeof change.content === "string" ? change.content : "", title: text(change, "title") || undefined });
      else if (kind === "sheet") mutations.push({ kind, artifactId: id, expectedRevision: revision, cells: cells(change.cells) });
      else mutations.push({ kind, artifactId: id, expectedRevision: revision, tasks: plannerTasks(change.tasks) });
    });
    if (!mutations.length || mutations.length !== raw.length) return failure(call, "invalid_workspace_changes"); const result = applyWorkspaceChanges(workspace, text(args, "label"), mutations);
    if (!result.ok) return failure(call, result.error, { artifact_id: result.artifactId, current_revision: result.currentRevision }); if (!commit(runtime, signal, result.workspace)) return failure(call, "interrupted");
    const lastKind = mutations.at(-1)!.kind; runtime.setActiveView?.(lastKind === "document" ? "documents" : lastKind === "sheet" ? "sheets" : "planner");
    return success(call, result.change.label, { change_id: result.change.id, changed_artifact_ids: mutations.map((item) => item.artifactId), revisions: result.change.afterRevisions });
  }
  if (call.name === "undo_change") {
    const result = undoLastWorkspaceChange(workspace, text(args, "change_id") || undefined); if (!result.ok) return failure(call, result.error, { artifact_id: result.artifactId }); if (!commit(runtime, signal, result.workspace)) return failure(call, "interrupted"); return success(call, "Workspace change undone", { change_id: result.change.id });
  }
  if (call.name === "update_task") {
    const objective = text(args, "objective"); if (!objective) return failure(call, "objective_required"); const next = updateWorkspaceTask(workspace, { objective, constraints: strings(args.constraints), steps: strings(args.steps) }); if (!commit(runtime, signal, next)) return failure(call, "interrupted"); return success(call, "Task plan updated", { task: next.task });
  }
  if (call.name === "search_web") {
    const apiKey = runtime.getTavilyApiKey().trim(); if (!apiKey) return failure(call, "tavily_key_required"); const query = text(args, "query"); if (!query) return failure(call, "query_required");
    const response = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "search", apiKey, query }), signal }); const payload = await response.json() as { error?: string; results?: Array<{ title?: string; url?: string; content?: string }> };
    if (!response.ok) return failure(call, payload.error ?? "research_unavailable"); if (signal?.aborted) return failure(call, "interrupted");
    const sources: RetrievedSource[] = (payload.results ?? []).filter((item) => item.url).map((item) => ({ id: `source-${crypto.randomUUID()}`, title: item.title?.trim() || item.url!, url: item.url!, snippet: item.content?.trim() || "", content: "", retrievedAt: new Date().toISOString() }));
    const next = addRetrievedSources(runtime.getWorkspace(), sources, query); if (!commit(runtime, signal, next)) return failure(call, "interrupted"); runtime.setActiveView?.("research"); return success(call, `${sources.length} sources found`, { collection_id: next.selectedResearchCollectionId, sources: sources.map(({ id, title, url, snippet }) => ({ id, title, url, snippet })) });
  }
  if (call.name === "read_sources") {
    const apiKey = runtime.getTavilyApiKey().trim(); if (!apiKey) return failure(call, "tavily_key_required"); const urls = strings(args.urls)?.slice(0, 8) ?? []; if (!urls.length) return failure(call, "urls_required");
    const response = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "extract", apiKey, urls }), signal }); const payload = await response.json() as { error?: string; results?: Array<{ url: string; raw_content?: string }> };
    if (!response.ok) return failure(call, payload.error ?? "research_unavailable"); if (signal?.aborted) return failure(call, "interrupted"); const byUrl = new Map((payload.results ?? []).map((item) => [item.url, item.raw_content ?? ""])); const current = runtime.getWorkspace();
    const next = { ...current, sources: current.sources.map((source) => byUrl.has(source.url) ? { ...source, content: byUrl.get(source.url)! } : source) }; if (!commit(runtime, signal, next)) return failure(call, "interrupted"); runtime.setActiveView?.("research"); return success(call, `${byUrl.size} sources read`, { sources: [...byUrl].map(([url, content]) => ({ url, content })) });
  }
  if (call.name === "summarize_research") {
    const id = text(args, "collection_id"); const collection = workspace.researchCollections.find((item) => item.id === id); if (!collection) return failure(call, "research_collection_not_found"); const allowed = new Set(collection.sourceIds); const sourceIds = strings(args.source_ids)?.filter((sourceId) => allowed.has(sourceId)) ?? [];
    if (!sourceIds.length) return failure(call, "source_ids_required"); const next = { ...workspace, researchCollections: workspace.researchCollections.map((item) => item.id === id ? { ...item, summary: text(args, "summary"), sourceIds } : item) }; if (!commit(runtime, signal, next)) return failure(call, "interrupted"); runtime.setActiveView?.("research"); return success(call, "Research summary added", { collection_id: id, source_ids: sourceIds });
  }
  if (call.name === "export_document") {
    const document = workspace.documents.find((item) => item.id === text(args, "document_id")); if (!document) return failure(call, "document_not_found"); return success(call, `${document.title} prepared for export`, { file_name: `${document.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "talkos-document"}.md`, content: document.content, mime_type: "text/markdown" });
  }
  return failure(call, "unsupported_workspace_tool");
}

export const researchTools = workspaceTools;

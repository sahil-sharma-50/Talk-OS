import { expect, it } from "vitest";
import { executeResearchTool, type WorkspaceRuntime } from "./research-tools";
import { createSheet, createWorkspace } from "@/features/workspace/workspace-model";

it("builds a sheet dashboard from requested columns without counting the total row twice", async () => {
  let workspace = createSheet(createWorkspace(), "Sales", { A1: { value: "Region" }, B1: { value: "Units" }, C1: { value: "Revenue" }, A2: { value: "North" }, B2: { value: 2 }, C2: { value: 30, format: "currency" }, A3: { value: "South" }, B3: { value: 3 }, C3: { value: 50, format: "currency" }, A4: { value: "Total" }, C4: { value: "=SUM(C2:C3)" } });
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "" };
  const call = (measure_columns: string[]) => executeResearchTool({ type: "tool.call", call_id: "dashboard", name: "create_sheet_dashboard", arguments: { title: "Sales briefing", sheet_id: workspace.activeSheetId, measure_columns, category_column: "A" } }, runtime);
  const result = await call(["C"]);
  expect(result.isError).not.toBe(true);
  const dashboard = workspace.dashboards.at(-1)!;
  expect(dashboard.widgets.map((widget) => widget.title)).toEqual(["Total Revenue", "Revenue by Region"]);
  expect(dashboard.widgets[0].binding).toMatchObject({ kind: "sheet_sum", range: "C2:C3", currency: "EUR" });
  expect(dashboard.widgets[1].binding).toMatchObject({ kind: "category_sum", categoryRange: "A2:A3", amountRange: "C2:C3" });
  expect(JSON.stringify(result.result.resolved_widgets)).toContain("80");
  expect((await call(["Z"])).result.error).toBe("invalid_sheet_columns");
  expect(workspace.dashboards).toHaveLength(1);
});

it("reads compact sheet pages without sending hundreds of styled empty cells", async () => {
  const workspace = createSheet(createWorkspace(), "Data", { A1: { value: "Name" }, A2: { value: "North" }, B1000: { value: "", style: { bold: true } }, A150: { value: "South" } });
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: () => {}, getTavilyApiKey: () => "" };
  const read = await executeResearchTool({ type: "tool.call", call_id: "read", name: "read_sheet", arguments: { sheet_id: workspace.activeSheetId } }, runtime);
  expect(read.result.cells).toEqual({ A1: { value: "Name" }, A2: { value: "North" } });
  expect(read.result.next_range).toBe("A101:Z150");
  const next = await executeResearchTool({ type: "tool.call", call_id: "next", name: "read_sheet", arguments: { sheet_id: workspace.activeSheetId, range: "A101:Z150" } }, runtime);
  expect(next.result.cells).toEqual({ A150: { value: "South" } });
});

it("formats a selected human draft and preserves its unsaved status", async () => {
  let workspace = createWorkspace(); const id = workspace.activeDocumentId;
  workspace.documentDrafts = { [id]: { content: "New draft", baseContent: workspace.documents[0].content, baseRevision: 1 } };
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "", getContext: () => ({ activeView: "documents", selection: { kind: "document", artifactId: id, start: 4, end: 9, text: "draft" } }) };
  const result = await executeResearchTool({ type: "tool.call", call_id: "draft", name: "format_document", arguments: { document_id: id, expected_revision: 1, format: "italic", scope: "selection" } }, runtime);
  expect(result.result.applied_to).toBe("draft"); expect(workspace.documentDrafts?.[id].content).toBe("New _draft_");
  expect(workspace.documents[0].revision).toBe(1); expect(workspace.documents[0].content).not.toContain("New");
});

it("formats a document by voice without replacing unrelated content", async () => {
  let workspace = createWorkspace(); workspace.documents[0].content = "The launch is ready.";
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "" };
  const result = await executeResearchTool({ type: "tool.call", call_id: "format", name: "format_document", arguments: { document_id: workspace.activeDocumentId, expected_revision: 1, format: "bold", target_text: "launch" } }, runtime);
  expect(result.isError).not.toBe(true);
  expect(workspace.documents[0].content).toBe("The **launch** is ready.");
});
it("asks which text to format when a target occurs twice", async () => {
  let workspace = createWorkspace(); workspace.documents[0].content = "ready and ready";
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "" };
  const result = await executeResearchTool({ type: "tool.call", call_id: "format", name: "format_document", arguments: { document_id: workspace.activeDocumentId, expected_revision: 1, format: "italic", target_text: "ready" } }, runtime);
  expect(result.result.status).toBe("needs_clarification"); expect(workspace.documents[0].content).toBe("ready and ready");
});
it("inserts and formats sheet rows through validated voice tools", async () => {
  let workspace = createSheet(createWorkspace(), "Budget", { A1: { value: "Item" }, B1: { value: "Cost" }, A2: { value: "Train" }, B2: { value: 30 }, B3: { value: "=SUM(B2:B2)" } });
  const runtime: WorkspaceRuntime = { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; }, getTavilyApiKey: () => "" };
  const id = workspace.activeSheetId!;
  const call = (name: string, args: Record<string, unknown>) => executeResearchTool({ type: "tool.call", call_id: name, name, arguments: { sheet_id: id, ...args } }, runtime);
  expect((await call("insert_sheet_rows", { expected_revision: 1, before_row: 2, count: 1 })).isError).not.toBe(true);
  expect(workspace.sheets[0].cells.B4.value).toBe("=SUM(B3:B3)");
  expect((await call("format_sheet", { expected_revision: 2, range: "A1:B1", bold: true })).isError).not.toBe(true);
  expect(workspace.sheets[0].cells.A1.style?.bold).toBe(true);
  const read = await call("read_sheet", {}); expect(read.result.columns).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Cost" })]));
});

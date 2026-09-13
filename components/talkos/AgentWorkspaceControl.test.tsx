import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TalkOSApp } from "./TalkOSApp";
import { executeResearchTool, type WorkspaceRuntime } from "@/features/voice/research-tools";
import { portableDocumentMarkdown } from "@/features/workspace/document-embeds";
import { MarkdownPreview } from "./DocumentWorkspace";

async function startApp() {
  let runtime: WorkspaceRuntime | undefined;
  render(<TalkOSApp voiceAdapterFactory={(_, host) => {
    runtime = host;
    return { async connect(emit) { emit({ type: "CONNECTION_CHANGED", connected: true, at: new Date().toISOString() }); }, async startListening() {}, stopListening() {}, async disconnect() {} };
  }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Start voice agent" }));
  await waitFor(() => expect(runtime).toBeDefined());
  let n = 0;
  return { runtime: runtime!, call: async (name: string, args: Record<string, unknown>) => {
    let result;
    await act(async () => { result = await executeResearchTool({ type: "tool.call", call_id: `ui-${++n}`, name, arguments: args }, runtime!); });
    return result! as Awaited<ReturnType<typeof executeResearchTool>>;
  } };
}

describe("agent controls the visible workspace", () => {
  it("imports a sheet range into the document preview, preserving formulas, draft text and export values", async () => {
    const app = await startApp();
    const created = await app.call("create_document", { title: "Launch report", content: "## Budget\nMy plan\n## Next\nKeep next steps" });
    fireEvent.change(screen.getByRole("textbox", { name: "Document content" }), { target: { value: "## Budget\nMy unsaved plan\n## Next\nKeep next steps" } });
    const sheet = await app.call("create_sheet", { title: "Launch costs", cells: { A1: "Item", B1: "Cost", A2: "Research", B2: 15, A3: "Design", B3: 25, A4: "Total", B4: "=SUM(B2:B3)" } });
    await app.call("format_sheet", { sheet_id: sheet.result.sheet_id, expected_revision: 1, range: "B2:B4", number_format: "currency", bold: true });
    const embedded = await app.call("embed_sheet_in_document", { document_id: created.result.document_id, expected_revision: 1, sheet_id: sheet.result.sheet_id, sheet_revision: 2, placement: "after_section", section_heading: "Budget" });
    expect(embedded.result.applied_to).toBe("draft");
    expect(screen.getByRole("tab", { name: "Documents" })).toHaveAttribute("aria-selected", "true");
    const preview = screen.getByRole("region", { name: "Document preview" });
    const table = within(preview).getByRole("table", { name: "Launch costs A1:B4" });
    expect(within(table).getByRole("columnheader", { name: "Cost" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "€40.00" })).toHaveStyle({ textAlign: "right", fontWeight: 700 });
    expect(within(preview).getByText("My unsaved plan")).toBeInTheDocument();
    expect(app.runtime.getWorkspace().sheets[0].cells.B4.value).toBe("=SUM(B2:B3)");
    await app.call("save_document", { document_id: created.result.document_id, expected_revision: 1 });
    const downloadFile = vi.fn(); app.runtime.downloadFile = downloadFile;
    const result = await app.call("export_document", { document_id: created.result.document_id });
    expect(result.result.download_started).toBe(true);
    expect(downloadFile).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("| Total | **€40.00** |") }));
    // Removing the source leaves the saved document table intact.
    await act(async () => app.runtime.setWorkspace({ ...app.runtime.getWorkspace(), sheets: [] }));
    expect(within(preview).getByRole("cell", { name: "€40.00" })).toBeInTheDocument();
  });
  it("switches the selected tab and rendered panel for every workspace", async () => {
    const app = await startApp();
    for (const name of ["Sheets", "Planner", "Research", "Canvas", "Dashboard", "Settings", "Documents"]) {
      const result = await app.call("open_workspace", { view: name.toLowerCase() });
      expect(result.isError).not.toBe(true);
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel", { name })).toBeVisible();
      expect(app.runtime.getContext?.().activeView).toBe(name.toLowerCase());
    }
  });

  it("opens the exact sheet read by the agent, then can control Activity", async () => {
    const app = await startApp();
    const first = await app.call("create_sheet", { title: "Sales" });
    await app.call("create_sheet", { title: "Costs" });
    await app.call("read_sheet", { sheet_id: first.result.sheet_id });
    expect(screen.getByRole("textbox", { name: "Sheet title" })).toHaveValue("Sales");
    await app.call("control_activity", { action: "show" });
    expect(screen.getByRole("complementary", { name: "Activity drawer" })).toBeVisible();
    await app.call("control_activity", { action: "hide" });
    expect(screen.queryByRole("complementary", { name: "Activity drawer" })).not.toBeInTheDocument();
  });

  it("renders an embedded diagram in the requested section, saves a draft without resurrecting old content, and exports its snapshot", async () => {
    const app = await startApp();
    const created = await app.call("create_document", { title: "PRD", content: "# PRD\n## Flow\nDetails\n## Metrics\nKeep metrics" });
    fireEvent.change(screen.getByRole("textbox", { name: "Document content" }), { target: { value: "# PRD\n## Flow\nDraft details\n## Metrics\nKeep metrics" } });
    const canvas = await app.call("create_canvas", { title: "Signup flow", operations: [{ op: "add_node", role: "process", id: "join", text: "Sign up", x: 0, y: 0 }] });
    const inserted = await app.call("embed_canvas_in_document", { document_id: created.result.document_id, expected_revision: 1, canvas_id: canvas.result.canvas_id, canvas_revision: 1, placement: "after_section", section_heading: "Flow" });
    expect(inserted.result.applied_to).toBe("draft");
    const preview = screen.getByRole("region", { name: "Document preview" });
    const image = within(preview).getByRole("img", { name: "Signup flow" });
    expect(image).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml,"));
    expect(within(preview).getByText("Draft details")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "Metrics" })).toBeInTheDocument();
    await app.call("save_document", { document_id: created.result.document_id, expected_revision: 1 });
    await app.call("open_workspace", { view: "documents", document_mode: "source" });
    const editor = screen.getByRole("textbox", { name: "Document content" });
    expect((editor as HTMLTextAreaElement).value).toContain("talkos-embed:");
    fireEvent.change(editor, { target: { value: (editor as HTMLTextAreaElement).value + "\nNext draft" } });
    expect(screen.queryByText("The saved version changed. Choose which version to keep.")).not.toBeInTheDocument();
    const saved = app.runtime.getWorkspace().documents.find((item) => item.id === created.result.document_id)!;
    const portable = portableDocumentMarkdown(saved.content, saved.embeds);
    expect(portable).not.toContain("talkos-embed:");
    const exportHost = document.createElement("div"); document.body.append(exportHost);
    const output = render(<MarkdownPreview content={portable} />, { container: exportHost });
    expect(within(output.container).getByRole("img", { name: "Signup flow" })).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml,"));
    const downloadFile = vi.fn(); app.runtime.downloadFile = downloadFile;
    const exported = await app.call("export_document", { document_id: saved.id });
    expect(exported.result.download_started).toBe(true);
    expect(downloadFile).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("data:image/svg+xml,") }));
  });
});

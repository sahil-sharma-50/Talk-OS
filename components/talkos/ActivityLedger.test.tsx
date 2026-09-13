import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialSessionState } from "@/features/session/session.fixtures";
import { emptyVoiceTelemetry } from "@/features/voice/voice-telemetry";
import { applyWorkspaceChanges, createWorkspace, createWorkspaceDocument } from "@/features/workspace/workspace-model";
import { loadWorkspace, saveWorkspace } from "@/features/workspace/workspace-storage";
import { ActivityDrawer } from "./ActivityDrawer";
import { TalkOSApp } from "./TalkOSApp";

vi.mock("@/features/workspace/workspace-storage", () => ({ loadWorkspace: vi.fn(), saveWorkspace: vi.fn() }));

function savedChanges() {
  const workspace = createWorkspace();
  const agent = applyWorkspaceChanges(workspace, "Updated project notes", [{ kind: "document", artifactId: workspace.activeDocumentId, expectedRevision: 1, content: "Agent draft" }]);
  if (!agent.ok) throw new Error("Could not prepare agent change");
  const withManualDocument = createWorkspaceDocument(agent.workspace, "My document");
  const manual = applyWorkspaceChanges(withManualDocument, "My manual edit", [{ kind: "document", artifactId: withManualDocument.activeDocumentId, expectedRevision: 1, content: "Keep this work" }], "user");
  if (!manual.ok) throw new Error("Could not prepare manual change");
  return manual.workspace;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveWorkspace).mockResolvedValue();
});

describe("action ledger history", () => {
  it("enables clearing saved receipts when the current session has no activities", () => {
    const clear = vi.fn();
    render(<ActivityDrawer open state={initialSessionState} workspace={savedChanges()} telemetry={emptyVoiceTelemetry} onToggle={vi.fn()} onUndo={vi.fn()} onClear={clear} />);
    const ledger = screen.getByRole("region", { name: "Agent activity" });
    expect(within(ledger).queryByText("No activity yet.")).not.toBeInTheDocument();
    expect(screen.getByText("1 record")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear ledger" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear ledger" }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it.each(["changed", "deleted", "undone"])("hides an undo receipt after its file is %s", (reason) => {
    const workspace = savedChanges();
    const agentId = workspace.changeHistory[0].after![0].artifact.id;
    if (reason === "changed") workspace.documents = workspace.documents.map((doc) => doc.id === agentId ? { ...doc, revision: doc.revision + 1 } : doc);
    if (reason === "deleted") workspace.documents = workspace.documents.filter((doc) => doc.id !== agentId);
    if (reason === "undone") workspace.changeHistory[0].undone = true;
    render(<ActivityDrawer open state={initialSessionState} workspace={workspace} telemetry={emptyVoiceTelemetry} onToggle={vi.fn()} onUndo={vi.fn()} onClear={vi.fn()} />);
    expect(screen.queryByText("Updated project notes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo this change" })).not.toBeInTheDocument();
  });

  it.each(["Clear ledger", "New session"])("persists %s without deleting files or manual undo history", async (action) => {
    const workspace = savedChanges();
    vi.mocked(loadWorkspace).mockResolvedValue(workspace);
    const view = render(<TalkOSApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Open activity sidebar" }));
    await screen.findByText("Updated project notes");
    fireEvent.click(screen.getByRole("button", { name: action }));
    await waitFor(() => expect(screen.queryByText("Updated project notes")).not.toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(saveWorkspace).mock.calls.at(-1)?.[0].changeHistory.every((change) => change.author === "user")).toBe(true));
    const saved = vi.mocked(saveWorkspace).mock.calls.at(-1)![0];
    expect(saved.documents).toEqual(workspace.documents);
    expect(saved.changeHistory).toEqual(workspace.changeHistory.filter((change) => change.author === "user"));
    view.unmount();
    vi.mocked(loadWorkspace).mockResolvedValue(saved);
    render(<TalkOSApp />);
    await screen.findByDisplayValue("Keep this work");
    fireEvent.click(await screen.findByRole("button", { name: "Open activity sidebar" }));
    expect(screen.queryByText("Updated project notes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear ledger" })).toBeDisabled();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { createWorkspace, moveArtifactToTrash } from "@/features/workspace/workspace-model";

it("focuses Cancel, supports Escape, and removes files only after confirmation", () => {
  const initial = createWorkspace();
  const deleted = moveArtifactToTrash(initial, "document", initial.activeDocumentId);
  const changed = vi.fn();
  function Harness() {
    const [workspace, setWorkspace] = useState(deleted);
    return <WorkspaceSettings credentials={{ apiKey: "", agentId: "" }} onCredentialsChange={vi.fn()} workspace={workspace} onChange={next => { changed(next); setWorkspace(next); }} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Clear trash" }));
  const confirmation = screen.getByRole("group", { name: "Empty Trash?" });
  expect(confirmation).toHaveAccessibleDescription("1 deleted file will be permanently removed. This cannot be undone.");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
  expect(screen.queryByRole("group", { name: "Empty Trash?" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear trash" })).toHaveFocus();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear trash" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove permanently" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith({ ...deleted, trash: [] });
  expect(screen.getByText("Trash is empty.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Clear trash" })).toBeDisabled();
});

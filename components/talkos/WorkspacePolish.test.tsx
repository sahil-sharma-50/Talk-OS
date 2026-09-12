import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createPlanner, createSheet, createWorkspace } from "@/features/workspace/workspace-model";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { PlannerWorkspace } from "./PlannerWorkspace";
import { SheetsWorkspace } from "./SheetsWorkspace";

describe("workspace polish", () => {
  it("formats the selected document text as Markdown", async () => {
    const user = userEvent.setup();
    render(<DocumentWorkspace workspace={createWorkspace()} onChange={vi.fn()} />);
    const editor = screen.getByRole("textbox", { name: /document content/i }) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(0, 4);

    await user.click(screen.getByRole("button", { name: /bold/i }));

    expect(editor.value).toMatch(/^\*\*Drop\*\*/);
  });

  it("renders formatted Markdown in document preview", async () => {
    const user = userEvent.setup();
    render(<DocumentWorkspace workspace={createWorkspace()} onChange={vi.fn()} />);
    const editor = screen.getByRole("textbox", { name: /document content/i });
    fireEvent.change(editor, { target: { value: "# Launch\n\n**Ready** and _clear_." } });

    await user.click(screen.getByRole("button", { name: /preview document/i }));

    const preview = screen.getByRole("region", { name: /document preview/i });
    expect(within(preview).getByRole("heading", { name: "Launch" })).toBeVisible();
    expect(within(preview).getByText("Ready").tagName).toBe("STRONG");
  });

  it("exposes active formatting and toggles it off", async () => {
    const user = userEvent.setup();
    render(<DocumentWorkspace workspace={createWorkspace()} onChange={vi.fn()} />);
    const editor = screen.getByRole("textbox", { name: /document content/i }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "**Drop** the details here." } });
    editor.focus();
    editor.setSelectionRange(2, 6);
    fireEvent.select(editor);

    const bold = screen.getByRole("button", { name: /bold/i });
    expect(bold).toHaveAttribute("aria-pressed", "true");
    await user.click(bold);

    expect(editor.value).toBe("Drop the details here.");
  });

  it("provides a keyboard-accessible canvas resize handle", () => {
    render(<DocumentWorkspace workspace={createWorkspace()} onChange={vi.fn()} />);
    const handle = screen.getByRole("button", { name: /resize workspace canvas/i });
    const surface = handle.parentElement as HTMLElement;
    Object.defineProperty(surface, "getBoundingClientRect", {
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(surface.style.width).toBe("776px");
  });

  it("keeps Sheet actions below the heading and removes redundant cell controls", () => {
    const workspace = createSheet(createWorkspace(), "Budget");
    render(<SheetsWorkspace workspace={workspace} onChange={vi.fn()} />);

    const heading = screen.getByText("Sheets").parentElement;
    expect(heading).not.toBeNull();
    expect(within(heading!).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /formula bar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /cell format/i })).not.toBeInTheDocument();
  });

  it("keeps Plan actions below the heading and removes the empty Schedule column", () => {
    const workspace = createPlanner(createWorkspace(), "Launch plan");
    render(<PlannerWorkspace workspace={workspace} onChange={vi.fn()} />);

    const heading = screen.getByText("Plans").parentElement;
    expect(heading).not.toBeNull();
    expect(within(heading!).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Schedule" })).not.toBeInTheDocument();
  });
});

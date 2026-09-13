import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDashboard, createPlanner, createSheet, createWorkspace } from "@/features/workspace/workspace-model";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { DashboardWorkspace } from "./DashboardWorkspace";
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

  it("renames a document when its title loses focus", () => {
    const onChange = vi.fn();
    render(<DocumentWorkspace workspace={createWorkspace()} onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Document title" }), { target: { value: "Launch brief" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Document title" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      documents: expect.arrayContaining([expect.objectContaining({ title: "Launch brief" })]),
    }));
  });

  it("renames sheets on blur and moves between cells with arrow keys", () => {
    const workspace = createSheet(createWorkspace(), "Budget");
    const onChange = vi.fn();
    render(<SheetsWorkspace workspace={workspace} onChange={onChange} />);

    const title = screen.getByRole("textbox", { name: "Sheet title" });
    fireEvent.change(title, { target: { value: "Launch budget" } });
    fireEvent.blur(title);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      sheets: expect.arrayContaining([expect.objectContaining({ title: "Launch budget" })]),
    }));

    const a1 = screen.getByRole("textbox", { name: "A1" });
    a1.focus();
    fireEvent.keyDown(a1, { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: "B1" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "B1" }), { key: "ArrowDown" });
    expect(screen.getByRole("textbox", { name: "B2" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "B2" }), { key: "ArrowLeft" });
    expect(screen.getByRole("textbox", { name: "A2" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "A2" }), { key: "ArrowUp" });
    expect(a1).toHaveFocus();
  });

  it("renames plans on blur and omits task scheduling controls", () => {
    const workspace = createPlanner(createWorkspace(), "Launch plan", [{
      id: "task-1", title: "Ship", completed: false, dueDate: "2026-09-20", startsAt: "2026-09-20T08:00:00.000Z", endsAt: "2026-09-20T09:00:00.000Z", blockedReason: "Waiting", riskLevel: "high",
    }]);
    const onChange = vi.fn();
    render(<PlannerWorkspace workspace={workspace} onChange={onChange} />);

    const title = screen.getByRole("textbox", { name: "Plan title" });
    fireEvent.change(title, { target: { value: "Release plan" } });
    fireEvent.blur(title);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      planners: expect.arrayContaining([expect.objectContaining({ title: "Release plan" })]),
    }));
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk & blockers")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
  });

  it("explains how dashboards use selected workspace sources", () => {
    const workspace = createDashboard(createWorkspace(), "Launch dashboard");
    render(<DashboardWorkspace workspace={workspace} onChange={vi.fn()} onOpenSource={vi.fn()} />);

    expect(screen.getByRole("note", { name: "How Dashboard works" })).toHaveTextContent(/select the documents, sheets, planners, and research/i);
    expect(screen.getByRole("note", { name: "How Dashboard works" })).toHaveTextContent(/updates automatically/i);
    expect(screen.getByRole("note", { name: "How Dashboard works" })).toHaveTextContent(/voice/i);
  });

  it("explains dashboard setup before the first dashboard exists", () => {
    render(<DashboardWorkspace workspace={createWorkspace()} onChange={vi.fn()} onOpenSource={vi.fn()} />);

    expect(screen.getByText(/select the Documents, Sheets, Planners, and Research/i)).toHaveTextContent(/update automatically/i);
    expect(screen.getByText(/select the Documents, Sheets, Planners, and Research/i)).toHaveTextContent(/voice/i);
  });
});

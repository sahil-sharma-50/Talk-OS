import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileActionMenu } from "./FileActionMenu";
import { ResearchActionMenu } from "./ResearchActionMenu";

const actions = () => ({
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onExport: vi.fn(),
  onTrash: vi.fn(),
});

describe("dismissible action menus", () => {
  it("closes file menus when focus moves outside or Escape is pressed", () => {
    const { container } = render(<FileActionMenu name="Launch brief" {...actions()} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();

    details!.open = true;
    fireEvent.pointerDown(document.body);
    expect(details).not.toHaveAttribute("open");

    details!.open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details).not.toHaveAttribute("open");
  });

  it("uses the same outside-click behavior for research menus", () => {
    const { container } = render(<ResearchActionMenu label="Launch research" kind="saved search" onDownload={vi.fn()} onDelete={vi.fn()} />);
    const details = container.querySelector("details");
    details!.open = true;

    fireEvent.pointerDown(document.body);

    expect(details).not.toHaveAttribute("open");
  });

  it("presents rename as a focused form with cancel and a trimmed save", () => {
    const callbacks = actions();
    const { container } = render(<FileActionMenu name="Launch brief" kind="document" {...callbacks} />);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(screen.getByRole("heading", { name: "Rename document" })).toBeVisible();
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveValue("Launch brief");
    expect(screen.getByRole("button", { name: "Save name" })).toBeEnabled();

    fireEvent.change(input, { target: { value: "  Project brief  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(callbacks.onRename).toHaveBeenCalledWith("Project brief");
    expect(details).not.toHaveAttribute("open");
  });
});

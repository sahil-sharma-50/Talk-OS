import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlannerTaskRow } from "./PlannerTaskRow";
import type { PlannerTask } from "@/features/workspace/workspace.types";

const task: PlannerTask = { id: "task", title: "Buy fruit", completed: false, notes: "Apples" };
const props = { timezone: "Europe/Berlin", index: 0, count: 1, onToggle: vi.fn(), onDelete: vi.fn(), onMove: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(), onDrop: vi.fn() };

it("cancels a draft and saves only changed fields in one update", () => {
  const save = vi.fn(() => true);
  render(<PlannerTaskRow {...props} task={task} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Buy fruit" }));
  fireEvent.change(screen.getByLabelText("Description for Buy fruit"), { target: { value: "Discard this" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit Buy fruit" }));
  expect(screen.getByLabelText("Description for Buy fruit")).toHaveValue("Apples");
  fireEvent.change(screen.getByLabelText("Title for Buy fruit"), { target: { value: "Buy apples" } });
  fireEvent.change(screen.getByLabelText("Description for Buy fruit"), { target: { value: "Four green apples" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Buy apples", notes: "Four green apples" });
});

it("keeps the draft open when a simultaneous update conflicts with its edits", () => {
  const save = vi.fn(() => true);
  const view = render(<PlannerTaskRow {...props} task={task} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Buy fruit" }));
  fireEvent.change(screen.getByLabelText("Description for Buy fruit"), { target: { value: "Bananas" } });
  view.rerender(<PlannerTaskRow {...props} task={{ ...task, notes: "Oranges from voice" }} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert")).toHaveTextContent("This task changed while you were editing");
  expect(save).not.toHaveBeenCalled();
});

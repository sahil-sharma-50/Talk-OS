import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SheetsWorkspace } from "./SheetsWorkspace";
import { PlannerWorkspace } from "./PlannerWorkspace";
import { createPlanner, createSheet, createWorkspace } from "@/features/workspace/workspace-model";

describe("user audit editing regressions", () => {
  it("keeps horizontal arrows within cell text until the caret reaches a boundary", () => {
    function Harness() {
      const [workspace, setWorkspace] = useState(() => createSheet(createWorkspace(), "Budget", { B1: { value: "banana" } }));
      return <SheetsWorkspace workspace={workspace} onChange={setWorkspace} />;
    }
    render(<Harness />);
    const cell = screen.getByRole("textbox", { name: "B1" }) as HTMLInputElement;
    act(() => cell.focus()); cell.setSelectionRange(3, 3);
    fireEvent.keyDown(cell, { key: "ArrowLeft" });
    expect(cell).toHaveFocus();
    cell.setSelectionRange(0, 0);
    fireEvent.keyDown(cell, { key: "ArrowLeft" });
    expect(screen.getByRole("textbox", { name: "A1" })).toHaveFocus();
    act(() => cell.focus()); cell.setSelectionRange(6, 6);
    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: "C1" })).toHaveFocus();
  }, 10_000);

  it("edits descriptions and reorders tasks without losing task data", () => {
    function Harness() {
      const [workspace, setWorkspace] = useState(() => createPlanner(createWorkspace(), "Plan", [
        { id: "a", title: "Research", completed: false }, { id: "b", title: "Build", completed: false },
      ]));
      return <><PlannerWorkspace workspace={workspace} onChange={setWorkspace} /><output data-testid="task-data">{JSON.stringify(workspace.planners[0].tasks)}</output></>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Build" }));
    fireEvent.change(screen.getByLabelText("Description for Build"), { target: { value: "Use the research notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Build up" }));
    const tasks = JSON.parse(screen.getByTestId("task-data").textContent!);
    expect(tasks.map((task: { id: string }) => task.id)).toEqual(["b", "a"]);
    expect(tasks[0].notes).toBe("Use the research notes");
  });
});

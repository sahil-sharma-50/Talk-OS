import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { createCanvas } from "@/features/canvas/canvas-scene";
import { CanvasWorkspace } from "./CanvasWorkspace";

vi.mock("./CanvasEditor", () => ({ CanvasEditor: () => <div>Drawing surface</div> }));

it("spawns a sticky immediately but waits for a drawing gesture for shapes and arrows", () => {
  function Harness() {
    const [workspace, setWorkspace] = useState(() => {
      const result = createCanvas(createWorkspace(), "Sketch", [], "user");
      if (!result.ok) throw new Error("fixture failed");
      return result.workspace;
    });
    return <><CanvasWorkspace workspace={workspace} onChange={setWorkspace} /><output data-testid="elements">{JSON.stringify(workspace.canvases[0].elements)}</output></>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Sticky" }));
  expect(JSON.parse(screen.getByTestId("elements").textContent!)).toEqual([expect.objectContaining({ type: "sticky", text: "Sticky note" })]);
  for (const name of ["Process", "Decision", "Rectangle", "Ellipse", "Line", "Arrow"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(screen.getByTestId("elements").textContent!)).toHaveLength(1);
  }
});

it("clears only the active canvas and restores its shapes and connectors with Undo", () => {
  function Harness() {
    const [workspace, setWorkspace] = useState(() => {
      const first = createCanvas(createWorkspace(), "Keep", [{ id: "keep", type: "text", text: "Keep me", x: 0, y: 0, width: 100, height: 40 }], "user");
      if (!first.ok) throw new Error("fixture failed");
      const second = createCanvas(first.workspace, "Clear me", [
        { id: "one", type: "process", text: "One", x: 0, y: 0, width: 100, height: 60 },
        { id: "two", type: "process", text: "Two", x: 200, y: 0, width: 100, height: 60 },
        { id: "link", type: "arrow", sourceId: "one", targetId: "two", x: 0, y: 0, width: 0, height: 0 },
      ], "user");
      if (!second.ok) throw new Error("fixture failed");
      return second.workspace;
    });
    return <><CanvasWorkspace workspace={workspace} onChange={setWorkspace} /><output data-testid="boards">{JSON.stringify(workspace.canvases)}</output></>;
  }
  render(<Harness />);
  const original = JSON.parse(screen.getByTestId("boards").textContent!);
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  const cleared = JSON.parse(screen.getByTestId("boards").textContent!);
  expect(cleared[0]).toEqual(original[0]);
  expect(cleared[1].elements).toEqual([]);
  expect(cleared[1].id).toBe(original[1].id);
  expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(JSON.parse(screen.getByTestId("boards").textContent!)[1].elements).toEqual(original[1].elements);
});

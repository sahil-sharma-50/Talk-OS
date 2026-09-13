import { describe, expect, it } from "vitest";
import { createWorkspace, redoWorkspaceChange, undoLastWorkspaceChange } from "@/features/workspace/workspace-model";
import { applyCanvasOperations, createCanvas } from "./canvas-scene";
import type { CanvasElement } from "./canvas.types";

describe("Canvas scene", () => {
  it("accepts a freely drawn arrow without weakening linked connector validation", () => {
    const result = createCanvas(createWorkspace(), "Sketch", [{ id: "free-arrow", type: "arrow", x: 100, y: 100, width: 180, height: 0, rotation: -135 }]);
    expect(result.ok).toBe(true);
    const invalid = createCanvas(createWorkspace(), "Broken edge", [{ id: "bad", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "missing", targetId: "" }]);
    expect(invalid.ok).toBe(false);
  });
  it("creates an undoable board and restores it with redo", () => {
    const created = createCanvas(createWorkspace(), "TalkOS flow");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const canvasId = created.workspace.activeCanvasId;
    expect(created.workspace.canvases).toHaveLength(1);
    expect(created.change.afterRevisions[canvasId!]).toBe(1);

    const undone = undoLastWorkspaceChange(created.workspace, created.change.id);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.workspace.canvases).toEqual([]);

    const redone = redoWorkspaceChange(undone.workspace, created.change.id);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.workspace.canvases[0]).toMatchObject({ id: canvasId, title: "TalkOS flow", revision: 3 });
  });

  it("rewires a user flow without changing nearby drawing content", () => {
    const elements: CanvasElement[] = [
      { id: "start", type: "process", x: 0, y: 0, width: 180, height: 80, text: "Start" },
      { id: "onboarding", type: "process", x: 260, y: 0, width: 180, height: 80, text: "Onboarding" },
      { id: "auth", type: "process", x: 520, y: 0, width: 180, height: 80, text: "Authentication" },
      { id: "home", type: "process", x: 780, y: 0, width: 180, height: 80, text: "Home" },
      { id: "e1", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "start", targetId: "onboarding" },
      { id: "e2", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "onboarding", targetId: "auth" },
      { id: "e3", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "auth", targetId: "home" },
      { id: "sketch", type: "freehand", x: 30, y: 180, width: 90, height: 45, points: [[0, 0], [40, 45], [90, 5]] },
    ];
    const board = { id: "canvas-1", title: "Flow", revision: 2, updatedAt: "2026-09-13T00:00:00.000Z", elements };

    const result = applyCanvasOperations(board, 2, [
      { op: "remove", ids: ["e1", "e2", "e3"] },
      { op: "connect", id: "e4", sourceId: "start", targetId: "auth", label: "" },
      { op: "connect", id: "e5", sourceId: "auth", targetId: "onboarding", label: "success" },
      { op: "connect", id: "e6", sourceId: "onboarding", targetId: "home", label: "continue" },
      { op: "add_node", id: "error", role: "process", text: "Login failed", x: 520, y: 160 },
      { op: "connect", id: "e7", sourceId: "auth", targetId: "error", label: "failure" },
      { op: "connect", id: "e8", sourceId: "error", targetId: "auth", label: "retry" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canvas.revision).toBe(3);
    expect(result.canvas.elements.find((item) => item.id === "sketch")).toEqual(elements.at(-1));
    expect(result.canvas.elements.filter((item) => item.type === "arrow").map(({ sourceId, targetId }) => `${sourceId}->${targetId}`)).toEqual([
      "start->auth", "auth->onboarding", "onboarding->home", "auth->error", "error->auth",
    ]);
  });

  it("rejects an operation batch atomically when an edge target is missing", () => {
    const board = { id: "canvas-1", title: "Flow", revision: 1, updatedAt: "2026-09-13T00:00:00.000Z", elements: [] as CanvasElement[] };
    const result = applyCanvasOperations(board, 1, [
      { op: "add_node", id: "start", role: "process", text: "Start", x: 0, y: 0 },
      { op: "connect", id: "bad", sourceId: "start", targetId: "missing", label: "" },
    ]);
    expect(result).toEqual({ ok: false, error: "invalid_canvas_scene", detail: "Connector bad references a missing element." });
    expect(board.elements).toEqual([]);
  });
});

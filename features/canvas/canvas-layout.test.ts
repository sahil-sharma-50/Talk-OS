import { describe, expect, it } from "vitest";
import { arrangeCanvas } from "./canvas-layout";
import type { WorkspaceCanvas } from "./canvas.types";

describe("Canvas layout", () => {
  it("arranges selected connected nodes left to right and leaves drawings alone", () => {
    const board: WorkspaceCanvas = { id: "canvas-1", title: "Flow", revision: 4, updatedAt: "2026-09-13T00:00:00.000Z", elements: [
      { id: "a", type: "process", text: "A", x: 400, y: 40, width: 180, height: 80 },
      { id: "b", type: "process", text: "B", x: 40, y: 40, width: 180, height: 80 },
      { id: "c", type: "process", text: "C", x: 200, y: 40, width: 180, height: 80 },
      { id: "ab", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "a", targetId: "b" },
      { id: "bc", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "b", targetId: "c" },
      { id: "drawing", type: "freehand", x: 33, y: 300, width: 90, height: 40, points: [[0, 0], [90, 40]] },
    ] };

    const result = arrangeCanvas(board, ["a", "b", "c"], "LR");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(result.canvas.elements.map((item) => [item.id, item]));
    expect(byId.get("a")!.x).toBeLessThan(byId.get("b")!.x);
    expect(byId.get("b")!.x).toBeLessThan(byId.get("c")!.x);
    expect(byId.get("drawing")).toEqual(board.elements.at(-1));
    expect(result.canvas.revision).toBe(5);
  });
});

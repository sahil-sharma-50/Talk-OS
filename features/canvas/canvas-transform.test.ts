import { describe, expect, it } from "vitest";
import type { CanvasElement } from "./canvas.types";
import { mergeCanvasTransform } from "./canvas-transform";

describe("mergeCanvasTransform", () => {
  it("scales freehand points along with their bounding box", () => {
    const elements: CanvasElement[] = [{ id: "stroke", type: "freehand", x: 0, y: 0, width: 100, height: 60, points: [[0, 0], [100, 60]] }];
    const changed = mergeCanvasTransform(elements, { id: "stroke", left: 10, top: 20, width: 100, height: 60, scaleX: 2, scaleY: 3, angle: 30 });
    expect(changed[0]).toMatchObject({ width: 200, height: 180, rotation: 30, points: [[0, 0], [200, 180]] });
  });
  it.each(["sticky", "text", "process", "decision", "rectangle", "ellipse", "image"] as const)("persists movement for %s objects", (type) => {
    const elements: CanvasElement[] = [{ id: "node-1", type, text: "Node", x: 10, y: 20, width: 100, height: 60 }];

    const moved = mergeCanvasTransform(elements, { id: "node-1", left: 85, top: 125, width: 100, height: 60, scaleX: 1, scaleY: 1, angle: 0 });

    expect(moved[0]).toMatchObject({ x: 85, y: 125 });
  });

  it("moves other items in the same logical group by the same delta", () => {
    const elements: CanvasElement[] = [
      { id: "one", type: "process", text: "One", x: 10, y: 20, width: 100, height: 60, groupId: "group-1" },
      { id: "two", type: "process", text: "Two", x: 160, y: 20, width: 100, height: 60, groupId: "group-1" },
    ];

    const moved = mergeCanvasTransform(elements, { id: "one", left: 40, top: 50, width: 100, height: 60, scaleX: 1, scaleY: 1, angle: 0 });

    expect(moved).toEqual([
      expect.objectContaining({ id: "one", x: 40, y: 50 }),
      expect.objectContaining({ id: "two", x: 190, y: 50 }),
    ]);
  });
});

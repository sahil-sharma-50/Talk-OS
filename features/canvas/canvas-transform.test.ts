import { describe, expect, it } from "vitest";
import type { CanvasElement } from "./canvas.types";
import { mergeCanvasTransform } from "./canvas-transform";

describe("mergeCanvasTransform", () => {
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

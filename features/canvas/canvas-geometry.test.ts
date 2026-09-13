import { expect, it } from "vitest";
import { canvasLabelSize, connectorEndpoints, shapeFromDrag } from "./canvas-geometry";

it("keeps connectors outside node labels", () => {
  const { from, to } = connectorEndpoints({ id: "a", type: "process", x: 0, y: 0, width: 200, height: 100 }, { id: "b", type: "process", x: 300, y: 0, width: 200, height: 100 });
  expect(from).toEqual({ x: 200, y: 50 }); expect(to).toEqual({ x: 300, y: 50 });
});
it("normalizes reverse drags and retains line direction", () => {
  expect(shapeFromDrag("rectangle", { x: 200, y: 180 }, { x: 60, y: 30 })).toMatchObject({ x: 60, y: 30, width: 140, height: 150 });
  expect(shapeFromDrag("line", { x: 100, y: 100 }, { x: 50, y: 50 }).rotation).toBe(-135);
  expect(shapeFromDrag("arrow", { x: 100, y: 100 }, { x: 50, y: 50 })).toMatchObject({ x: 100, y: 100, height: 0, rotation: -135 });
});
it("gives long labels enough vertical room", () => {
  expect(canvasLabelSize("process", "A long explanation ".repeat(20)).height).toBeGreaterThan(300);
});

import { describe, expect, it } from "vitest";
import { exportCanvasSvg } from "./canvas-export";

describe("canvas export", () => {
  it("exports editable shapes, connector arrowheads, labels, and drawings to SVG", () => {
    const svg = exportCanvasSvg({ id: "canvas", title: "Login <flow>", revision: 1, updatedAt: "", elements: [
      { id: "a", type: "process", text: "Log & in", x: 10, y: 10, width: 180, height: 80 },
      { id: "b", type: "decision", text: "Allowed?", x: 300, y: 10, width: 180, height: 80 },
      { id: "edge", type: "arrow", text: "submit", x: 0, y: 0, width: 0, height: 0, sourceId: "a", targetId: "b" },
      { id: "draw", type: "freehand", x: 20, y: 150, width: 30, height: 20, points: [[0, 0], [30, 20]] },
    ] }, {});
    expect(svg).toContain("<marker id=\"arrowhead\"");
    expect(svg).toContain("Log &amp; in");
    expect(svg).toContain("submit");
    expect(svg).toContain("<polyline");
  });
});

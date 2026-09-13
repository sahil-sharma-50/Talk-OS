import { describe, expect, it } from "vitest";
import { exportCanvasSvg } from "./canvas-export";

describe("canvas export", () => {
  it("exports only the actual drawing with transparency, even when freehand metadata includes board-sized bounds", () => {
    const svg = exportCanvasSvg({ id: "drawing", title: "Sketch", revision: 1, updatedAt: "", elements: [{ id: "stroke", type: "freehand", x: 400, y: 300, width: 1200, height: 760, points: [[0, 0], [60, 80], [90, 40]] }] }, {}, { fitToContent: true, background: "transparent" });
    const box = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
    expect(box[2]).toBeLessThan(170);
    expect(box[3]).toBeLessThan(160);
    expect(svg).not.toContain('fill="#f7f8fa"');
    expect(svg).toContain('points="400,300 460,380 490,340"');
  });
  it("fits document snapshots around real geometry without a large empty board or phantom connector origin", () => {
    const svg = exportCanvasSvg({ id: "canvas", title: "Flow", revision: 1, updatedAt: "", elements: [
      { id: "a", type: "process", text: "Start", x: 500, y: 400, width: 200, height: 80 },
      { id: "b", type: "process", text: "Finish", x: 800, y: 400, width: 200, height: 80 },
      { id: "edge", type: "arrow", x: 0, y: 0, width: 0, height: 0, sourceId: "a", targetId: "b" },
    ] }, {}, { fitToContent: true });
    const bounds = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
    expect(bounds[0]).toBeGreaterThan(400);
    expect(bounds[1]).toBeGreaterThan(300);
    expect(bounds[2]).toBeLessThan(600);
    expect(bounds[3]).toBeLessThan(200);
    expect(svg).toContain('marker-end="url(#arrowhead)"');
  });
  it("exports a free arrow in its drawn direction", () => {
    const svg = exportCanvasSvg({ id: "canvas", title: "Free arrow", revision: 1, updatedAt: "", elements: [{ id: "arrow", type: "arrow", x: 200, y: 150, width: 120, height: 0, rotation: -135 }] }, {});
    expect(svg).toContain('transform="rotate(-135 200 150)"');
    expect(svg).toContain('x1="200" y1="150" x2="320" y2="150"');
    expect(svg).toContain('marker-end="url(#arrowhead)"');
  });
  it("preserves rotation and includes content left of the canvas origin", () => {
    const svg = exportCanvasSvg({ id: "canvas", title: "Moved drawing", revision: 1, updatedAt: "", elements: [{ id: "draw", type: "freehand", x: -100, y: -80, width: 30, height: 20, points: [[0, 0], [30, 20]], rotation: 30 }] }, {});
    expect(svg).toContain('transform="rotate(30 -100 -80)"');
    const viewBox = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
    expect(viewBox[0]).toBeLessThan(-100);
    expect(viewBox[1]).toBeLessThan(-80);
  });
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

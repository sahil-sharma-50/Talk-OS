import { describe, expect, it } from "vitest";
import { drawingOnlySnapshot } from "./document-snapshot";
import { canvasSnapshotUrl, portableDocumentMarkdown } from "./document-embeds";
import { exportCanvasSvg } from "@/features/canvas/canvas-export";

describe("drawing-only saved snapshots", () => {
  it("crops an existing full-board snapshot without rereading or changing its source canvas", () => {
    const saved = exportCanvasSvg({ id: "canvas", title: "Robot", revision: 1, updatedAt: "", elements: [
      { id: "head", type: "ellipse", x: 60, y: 40, width: 60, height: 40 },
      { id: "body", type: "rectangle", x: 70, y: 90, width: 30, height: 40 },
      { id: "arm", type: "freehand", x: 50, y: 100, width: 1200, height: 760, points: [[0, 0], [30, 10]] },
    ] }, {});
    const svg = drawingOnlySnapshot(saved);
    const box = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
    expect(box[2]).toBeLessThan(150); expect(box[3]).toBeLessThan(160);
    expect(svg).not.toContain('fill="#f7f8fa"');
    expect(svg).toContain("ellipse"); expect(svg).toContain("polyline");
    expect(saved).toContain('fill="#f7f8fa"');
    const embeds = { robot: { id: "robot", kind: "canvas" as const, title: "Robot", sourceId: "canvas", sourceRevision: 1, createdAt: "", svg: saved } };
    expect(portableDocumentMarkdown("![Robot](talkos-embed:robot)", embeds)).toContain(canvasSnapshotUrl(saved));
    expect(embeds.robot.svg).toBe(saved);
  });

  it("retains rotated shapes, arrowheads and wrapped labels inside the crop", () => {
    const saved = exportCanvasSvg({ id: "canvas", title: "Flow", revision: 1, updatedAt: "", elements: [
      { id: "box", type: "process", text: "Keep label", x: -50, y: -40, width: 100, height: 80, rotation: 45 },
      { id: "arrow", type: "arrow", x: 100, y: 50, width: 160, height: 0, rotation: 30 },
    ] }, {});
    const svg = drawingOnlySnapshot(saved);
    const box = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
    expect(box[0]).toBeLessThan(-100); expect(box[1]).toBeLessThan(-40);
    expect(box[0] + box[2]).toBeGreaterThan(238);
    expect(box[1] + box[3]).toBeGreaterThan(130);
    expect(svg).toContain(">Keep</tspan>"); expect(svg).toContain(">label</tspan>"); expect(svg).toContain('marker-end="url(#arrowhead)"');
  });

  it("leaves unsupported or malformed imported SVG geometry untouched", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0C20 10 80 90 100 100"/></svg>';
    expect(drawingOnlySnapshot(svg)).toBe(svg);
    expect(drawingOnlySnapshot("not svg")).toBe("not svg");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const globalStyles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const rootLayout = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");
const canvasEditor = readFileSync(join(process.cwd(), "components", "talkos", "CanvasEditor.tsx"), "utf8");

it("defines a compact, legible semantic type scale", () => {
  expect(globalStyles).toContain("--type-meta: 10px");
  expect(globalStyles).toContain("--type-label: 12px");
  expect(globalStyles).toContain("--type-ui: 14px");
  expect(globalStyles).toContain("--type-title: 16px");
  expect(globalStyles).toContain("--type-section: 20px");
  expect(globalStyles).toContain("--type-reading: 15px");
});

it("gives long-form document content a dedicated reading face", () => {
  expect(globalStyles).toMatch(
    /\.document-editor\s*>\s*textarea\s*\{[^}]*font-family:\s*var\(--font-reading\)/,
  );
  expect(globalStyles).toMatch(/\.source-content\s*\{[^}]*font-family:\s*var\(--font-reading\)/);
});

it("prioritizes the native UI font on Windows displays", () => {
  expect(globalStyles).toMatch(/--font-ui:\s*"Segoe UI Variable Text",\s*"Segoe UI",\s*var\(--font-instrument-sans\)/);
  expect(globalStyles).toMatch(/--font-heading:\s*"Segoe UI Variable Display",\s*"Segoe UI",\s*var\(--font-instrument-sans\)/);
  expect(globalStyles).toMatch(/body\s*\{[^}]*text-rendering:\s*auto/);
  expect(globalStyles).not.toContain("text-rendering: optimizeLegibility");
  expect(rootLayout).toContain("Instrument_Sans");
  expect(rootLayout).toContain("Source_Serif_4");
  expect(rootLayout).toContain("instrumentSans.variable");
  expect(rootLayout).toContain("sourceSerif.variable");
});

it("renders whiteboard text with a supersampled responsive backing store", () => {
  expect(canvasEditor).toContain("getCanvasRenderMetrics(host.clientWidth, host.clientHeight, window.devicePixelRatio)");
  expect(canvasEditor).toContain("fabric.config.configure({ devicePixelRatio: renderMetrics.pixelRatio })");
  expect(canvasEditor).toMatch(/new fabric\.Canvas\([\s\S]*?enableRetinaScaling:\s*true/);
  expect(canvasEditor).toContain('const canvasFontFamily = \'"Segoe UI Variable Text", "Segoe UI", sans-serif\'');
  expect(canvasEditor).toContain("objectCaching: false");
  expect(canvasEditor).not.toContain('fontFamily: "Arial"');
});

it("prevents mobile browsers from zooming compact form controls", () => {
  expect(globalStyles).toMatch(
    /@media\s*\(max-width:\s*780px\)\s*and\s*\(pointer:\s*coarse\)[\s\S]*?\.talkos-shell select:not\(\[multiple\]\),[\s\S]*?\.talkos-shell textarea\s*\{\s*font-size:\s*var\(--type-title\)/,
  );
  expect(globalStyles.lastIndexOf("@media (max-width: 780px) and (pointer: coarse)"))
    .toBeGreaterThan(globalStyles.lastIndexOf(".sheet-editor > header input"));
});

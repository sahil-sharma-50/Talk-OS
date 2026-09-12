import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const globalStyles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const rootLayout = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");

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
  expect(globalStyles).toMatch(
    /\.document-editor\s*>\s*textarea\s*\{[^}]*calc\(\(100%\s*-\s*68ch\)\s*\/\s*2\)/,
  );
  expect(globalStyles).toMatch(/\.source-content\s*\{[^}]*font-family:\s*var\(--font-reading\)/);
});

it("wires both self-hosted font variables into the root layout", () => {
  expect(rootLayout).toContain("Instrument_Sans");
  expect(rootLayout).toContain("Source_Serif_4");
  expect(rootLayout).toContain("instrumentSans.variable");
  expect(rootLayout).toContain("sourceSerif.variable");
});

it("prevents mobile browsers from zooming compact form controls", () => {
  expect(globalStyles).toMatch(
    /@media\s*\(max-width:\s*780px\)\s*and\s*\(pointer:\s*coarse\)[\s\S]*?\.talkos-shell select:not\(\[multiple\]\),[\s\S]*?\.talkos-shell textarea\s*\{\s*font-size:\s*var\(--type-title\)/,
  );
  expect(globalStyles.lastIndexOf("@media (max-width: 780px) and (pointer: coarse)"))
    .toBeGreaterThan(globalStyles.lastIndexOf(".sheet-editor > header input"));
});

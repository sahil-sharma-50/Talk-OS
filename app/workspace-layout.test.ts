import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

describe("desktop workspace layout", () => {
  it("uses one navigation-rail width across every artifact workspace", () => {
    expect(styles).toContain("--artifact-navigator-width: 220px");
    expect(styles.match(/grid-template-columns: var\(--artifact-navigator-width\)/g)).toHaveLength(5);
  });

  it("fills the available panel inside one equal responsive inset", () => {
    expect(styles).toContain("--workspace-inset:");
    expect(styles).toMatch(/@media \(min-width: 781px\)[\s\S]*?\.workspace-canvas__scroll \{[^}]*padding: var\(--workspace-inset\);[^}]*overflow: auto;/);
    expect(styles).toMatch(/\.workspace-canvas__scroll > \.dashboard-workspace[^{]*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*min-height: 0;/);
  });
});

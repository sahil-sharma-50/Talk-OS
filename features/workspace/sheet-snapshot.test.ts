import { describe, expect, it } from "vitest";
import { createSheetSnapshot, sheetSnapshotMarkdown } from "./sheet-snapshot";
import type { SheetDocumentEmbed, WorkspaceSheet } from "./workspace.types";

const sheet: WorkspaceSheet = { id: "budget", title: "Budget", revision: 1, updatedAt: "", cells: { A1: { value: "Item" }, B1: { value: "Value" }, A2: { value: "Safe | <script>\n**literal**" }, B2: { value: .25, format: "percent", style: { italic: true } }, C10: { value: 6 }, B3: { value: "=C10*2" } } };

describe("document table snapshots", () => {
  it("uses outside-range formula dependencies and normalizes reverse absolute ranges", () => {
    const table = createSheetSnapshot(sheet, "$B$3:$A$1");
    expect(table).toMatchObject({ range: "A1:B3", sourceRange: "A1:B3", headerRow: true });
    if (!("rows" in table)) throw new Error("Expected a table");
    expect(table.rows[1][1].text).toBe("25%"); expect(table.rows[2][1].text).toBe("12");
    const snapshot: SheetDocumentEmbed = { ...table, id: "table", kind: "sheet", title: sheet.title, sourceId: sheet.id, sourceRevision: 1, createdAt: "" };
    const portable = sheetSnapshotMarkdown(snapshot);
    expect(portable).toContain("Safe \\| &lt;script&gt;<br>\\*\\*literal\\*\\*");
    expect(portable).toContain("_25%_"); expect(portable).not.toContain("=C10");
  });
  it("retains the first data row when no header is requested, including zero and formula errors", () => {
    const table = createSheetSnapshot({ ...sheet, cells: { A1: { value: 0 }, B1: { value: "=1/0" } } }, "A1:B1", false);
    expect(table).toMatchObject({ headerRow: false, rows: [[{ text: "0" }, { text: "#DIV/0!" }]] });
  });
});

import { describe, expect, it } from "vitest";
import { insertSheetRows, formatSheetValue, inferSheetColumns } from "./sheet-operations";
import { createSheet, createWorkspace } from "./workspace-model";

describe("sheet operations", () => {
  it("inserts rows while preserving cell styles and shifting absolute and relative formula references", () => {
    const cells = insertSheetRows({ A1: { value: "Header", style: { bold: true } }, A2: { value: 4 }, B3: { value: "=SUM($A$2:A3)" } }, 2, 1);
    expect(cells.A1.style?.bold).toBe(true);
    expect(cells.A3.value).toBe(4);
    expect(cells.B4.value).toBe("=SUM($A$3:A4)");
    expect(cells.A2).toBeUndefined();
  });
  it("does not discard data at the row limit", () => {
    expect(() => insertSheetRows({ A1000: { value: 7 } }, 2, 1)).toThrow(/limit/i);
  });
  it("detects named columns and actual data ranges after a title and blank row", () => {
    const sheet = createSheet(createWorkspace(), "Sales", {
      A1: { value: "Sales report" }, A3: { value: "Region" }, B3: { value: "Revenue" }, C3: { value: "Units" },
      A4: { value: "North" }, B4: { value: "120" }, C4: { value: 3 }, A5: { value: "South" }, B5: { value: "=B4*2" }, C5: { value: 6 },
    }).sheets[0];
    const columns = inferSheetColumns(sheet);
    expect(columns.find((column) => column.letter === "B")).toMatchObject({ label: "Revenue", range: "B4:B5", type: "number" });
    expect(columns.find((column) => column.letter === "A")).toMatchObject({ label: "Region", type: "text" });
  });
  it("formats visible values without changing stored formula inputs", () => {
    expect(formatSheetValue(0.25, "percent")).toBe("25%");
    expect(formatSheetValue("#REF!", "currency")).toBe("#REF!");
  });
  it("excludes a labeled formula total so dashboards do not count it twice", () => {
    const sheet = createSheet(createWorkspace(), "Sales", { A1: { value: "Region" }, B1: { value: "Revenue" }, A2: { value: "North" }, B2: { value: 100 }, A3: { value: "South" }, B3: { value: 200 }, A4: { value: "Grand total" }, B4: { value: "=SUM(B2:B3)" } }).sheets[0];
    expect(inferSheetColumns(sheet)[1]).toMatchObject({ label: "Revenue", range: "B2:B3", count: 2 });
  });
});

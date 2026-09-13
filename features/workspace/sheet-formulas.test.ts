import { describe, expect, it } from "vitest";
import { evaluateSheet } from "./sheet-formulas";

it("calculates nested functions, absolute references and formulas with multiple arguments", () => {
  expect(evaluateSheet({ A1: { value: 10 }, A2: { value: 20 }, B1: { value: "=SUM($A$1:A2,5)*2" }, B2: { value: "=ROUND(AVERAGE(A1:A2)/4,2)" } })).toMatchObject({ B1: 70, B2: 3.75 });
});

describe("sheet formulas", () => {
  it("bounds formula complexity instead of crashing on imported expressions", () => {
    expect(evaluateSheet({ A1: { value: `=${"-".repeat(20000)}1` } }).A1).toBe("#LIMIT!");
    const chain = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`A${index + 1}`, { value: index === 999 ? 1 : `=A${index + 2}` }]));
    expect(evaluateSheet(chain).A1).toBe("#LIMIT!");
  });
  it("reports numeric overflow", () => {
    expect(evaluateSheet({ A1: { value: 1e308 }, A2: { value: "=A1*A1" } }).A2).toBe("#NUM!");
  });
  it("includes literal cells in exports and derived metrics", () => {
    expect(evaluateSheet({ A1: { value: "Catering" }, B1: { value: "120" }, B2: { value: 80 } }))
      .toEqual({ A1: "Catering", B1: 120, B2: 80 });
  });

  it("ignores empty cells when counting and averaging a range", () => {
    expect(evaluateSheet({ A1: { value: 10 }, A3: { value: 20 }, B1: { value: "=AVERAGE(A1:A4)" }, B2: { value: "=COUNT(A1:A4)" }, B3: { value: "=MIN(A1:A4)" } }))
      .toMatchObject({ B1: 15, B2: 2, B3: 10 });
  });
  it("evaluates arithmetic, references, ranges, and supported functions", () => {
    const values = evaluateSheet({
      A1: { value: 10 },
      A2: { value: 20 },
      B1: { value: "=A1+A2*2" },
      B2: { value: "=SUM(A1:A2)" },
      B3: { value: "=AVERAGE(A1:A2)" },
    });

    expect(values).toMatchObject({ B1: 50, B2: 30, B3: 15 });
  });

  it("reports invalid references, division by zero, unsupported formulas, and cycles", () => {
    const values = evaluateSheet({
      A1: { value: "=B1" },
      B1: { value: "=A1" },
      C1: { value: "=1/0" },
      D1: { value: "=NOPE(1)" },
      E1: { value: "=ZZ1" },
    });

    expect(values).toMatchObject({ A1: "#CYCLE!", B1: "#CYCLE!", C1: "#DIV/0!", D1: "#NAME?", E1: "#REF!" });
  });
});

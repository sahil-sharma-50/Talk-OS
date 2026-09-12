import { describe, expect, it } from "vitest";
import { evaluateSheet } from "./sheet-formulas";

describe("sheet formulas", () => {
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

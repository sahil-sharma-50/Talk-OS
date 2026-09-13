import { describe, expect, it } from "vitest";
import { getCanvasRenderMetrics } from "./canvas-rendering";

describe("getCanvasRenderMetrics", () => {
  it("rounds fractional layout dimensions and supersamples text on low-density displays", () => {
    expect(getCanvasRenderMetrics(608.95, 545.95, 1.25)).toEqual({
      width: 609,
      height: 546,
      pixelRatio: 2,
    });
  });

  it("preserves higher native pixel densities", () => {
    expect(getCanvasRenderMetrics(800, 600, 2.5)).toEqual({
      width: 800,
      height: 600,
      pixelRatio: 2.5,
    });
  });
});

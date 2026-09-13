import { expect, it } from "vitest";
import { defaultDashboardLayouts, placeDashboardWidget } from "./dashboard-layout";
import type { DashboardWidget } from "./dashboard.types";
const widgets: DashboardWidget[] = [0, 1, 2].map((order) => ({ id: String(order), title: "Metric", type: "metric", size: order === 2 ? "wide" : "compact", order, binding: { kind: "sheet_sum", sheetId: "sheet", range: "A1:A2" } }));
it("moves intersecting widgets down after a resize, retaining other columns", () => {
  const next = placeDashboardWidget(widgets, "0", { x: 0, y: 20, width: 50, height: 250 });
  expect(next[0].layout?.y).toBe(20); expect(next[1].layout?.y).toBe(0); expect(next[2].layout?.y).toBe(284);
});
it("places new widgets below saved layouts", () => {
  const layouts = defaultDashboardLayouts([{ ...widgets[0], layout: { x: 20, y: 500, width: 50, height: 250 } }, widgets[1]]);
  expect(layouts["1"].y).toBe(764);
});

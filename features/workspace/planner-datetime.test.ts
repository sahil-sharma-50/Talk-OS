import { describe, expect, it } from "vitest";
import { fromPlannerDateTime, toPlannerDateTime } from "./planner-datetime";

describe("planner wall-clock conversions", () => {
  it("shows stored instants in the planner timezone", () => {
    expect(toPlannerDateTime("2026-09-13T08:00:00.000Z", "Europe/Berlin")).toBe("2026-09-13T10:00");
  });

  it("stores planner wall-clock input as the matching instant", () => {
    expect(fromPlannerDateTime("2026-09-13T10:00", "Europe/Berlin")).toBe("2026-09-13T08:00:00.000Z");
  });

  it("normalizes a nonexistent spring-forward time to the next matching wall time", () => {
    const instant = fromPlannerDateTime("2026-03-29T02:30", "Europe/Berlin");

    expect(instant).toBe("2026-03-29T01:30:00.000Z");
    expect(toPlannerDateTime(instant, "Europe/Berlin")).toBe("2026-03-29T03:30");
  });

  it("chooses the earlier occurrence of a repeated fall-back time", () => {
    expect(fromPlannerDateTime("2026-10-25T02:30", "Europe/Berlin")).toBe("2026-10-25T00:30:00.000Z");
  });
});

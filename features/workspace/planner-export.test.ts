import { describe, expect, it } from "vitest";
import { exportPlannerIcs, findPlannerConflicts } from "./planner-export";

describe("planner helpers", () => {
  const tasks = [
    { id: "a", title: "Venue walkthrough", completed: false, startsAt: "2026-10-25T01:30:00+02:00", endsAt: "2026-10-25T02:30:00+02:00" },
    { id: "b", title: "Catering call", completed: false, startsAt: "2026-10-25T02:00:00+02:00", endsAt: "2026-10-25T03:00:00+02:00" },
  ];

  it("finds overlapping scheduled tasks", () => {
    expect(findPlannerConflicts(tasks)).toEqual([["a", "b"]]);
  });

  it("exports scheduled tasks as a valid calendar without unscheduled tasks", () => {
    const ics = exportPlannerIcs([{ ...tasks[0], notes: "Bring notes", blockedReason: "Legal; review", riskLevel: "high" }, tasks[1], { id: "c", title: "Buy flowers", completed: false }], "Europe/Berlin");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Venue walkthrough");
    expect(ics).not.toContain("Buy flowers");
    expect(ics).toContain("Blocked: Legal\\; review");
    expect(ics).toContain("Risk: high");
  });
});

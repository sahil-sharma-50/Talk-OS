import { describe, expect, it, vi } from "vitest";
import { createDemoController } from "./demo-controller";
import type { SessionEvent } from "@/features/session/session.types";

describe("createDemoController", () => {
  it("emits a revised plan after interruption and never completes the cancelled action", () => {
    vi.useFakeTimers();
    const events: SessionEvent[] = [];
    const controller = createDemoController((event) => events.push(event));

    controller.start();
    vi.advanceTimersByTime(2600);
    controller.interrupt("Use official sources. Prioritize compliance and pricing under $100.");
    vi.runAllTimers();

    expect(events.some((event) => event.type === "PLAN_SET" && event.revised)).toBe(true);
    expect(
      events.some(
        (event) => event.type === "ACTION_COMPLETED" && event.actionId === "search-initial",
      ),
    ).toBe(false);
    expect(events.some((event) => event.type === "BRIEF_WRITTEN")).toBe(true);
    controller.dispose();
    vi.useRealTimers();
  });

  it("cancels all future events when disposed", () => {
    vi.useFakeTimers();
    const emit = vi.fn<(event: SessionEvent) => void>();
    const controller = createDemoController(emit);

    controller.start();
    const countBeforeDispose = emit.mock.calls.length;
    controller.dispose();
    vi.runAllTimers();

    expect(emit).toHaveBeenCalledTimes(countBeforeDispose);
    vi.useRealTimers();
  });

  it("can complete the revised research immediately for presentation recovery", () => {
    const events: SessionEvent[] = [];
    const controller = createDemoController((event) => events.push(event));

    controller.finish();

    expect(events.filter((event) => event.type === "EVIDENCE_ADDED")).toHaveLength(4);
    expect(events.at(-1)?.type).toBe("VOICE_STATE_CHANGED");
    expect(events.some((event) => event.type === "BRIEF_WRITTEN")).toBe(true);
  });
});

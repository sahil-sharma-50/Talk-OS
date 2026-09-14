import { describe, expect, it } from "vitest";
import { SpokenRequest } from "./spoken-request";

describe("spoken request continuity", () => {
  it.each(["Thanks.", "Thank you very much!", "Okay, cool. Looks really nice. Thanks."])("starts a fresh acknowledgment after a visible action: %s", text => {
    const request = new SpokenRequest();
    const original = request.accept("Move my sheet into the PRD.", "action", true)!;
    request.actionResponded();
    const acknowledgment = request.accept(text, "thanks", true)!;
    expect(acknowledgment.text).toBe(text);
    expect(acknowledgment.turnId).not.toBe(original.turnId);
  });
  it.each(["and add milk", "plan", "thanks, but change the date"])("retains continued instructions after a tool result: %s", tail => {
    const request = new SpokenRequest();
    const original = request.accept("Open my planner", "one", true)!;
    request.actionResponded();
    expect(request.accept(tail, "two", true)).toMatchObject({ text: `Open my planner ${tail}`, turnId: original.turnId });
  });
  it("keeps finalized phrases and the next partial together until a spoken response", () => {
    const request = new SpokenRequest();
    const first = request.accept("Open my planner", "one", true)!;
    expect(request.accept("and create", "two", false)?.text).toBe("Open my planner and create");
    expect(request.accept("and create a shopping list.", "two", true)).toMatchObject({ turnId: first.turnId, text: "Open my planner and create a shopping list." });
    expect(request.text).toBe("Open my planner and create a shopping list.");
  });
  it("updates cumulative text by item identity and ignores duplicate/stale finals", () => {
    const request = new SpokenRequest();
    request.accept("Open my plan", "one", false);
    request.accept("Open my planner", "one", false);
    request.accept("Open my planner.", "one", true);
    expect(request.accept("Open my planner.", "one", true)).toBeNull();
    request.responseStarted();
    expect(request.accept("Actually use Sheets.", "two", true)?.text).toBe("Actually use Sheets.");
    expect(request.accept("Open my planner.", "one", true)).toBeNull();
    expect(request.text).toBe("Actually use Sheets.");
  });
  it("accepts separate final phrases even when the provider omits item ids", () => {
    const request = new SpokenRequest();
    request.accept("Open my planner.", undefined, true);
    expect(request.accept("Create a shopping list.", undefined, true)?.text).toBe("Open my planner. Create a shopping list.");
  });
  it("reconciles an anonymous live partial with the provider's identified final without duplicating words", () => {
    const request = new SpokenRequest();
    const partial = request.accept("Create an Android", undefined, false)!;
    expect(request.accept("Create an Android app", undefined, false)?.text).toBe("Create an Android app");
    expect(request.accept("Create an Android app.", "final-id", true)).toMatchObject({ text: "Create an Android app.", turnId: partial.turnId });
    expect(request.accept("And research the audience.", "next-id", true)?.text).toBe("Create an Android app. And research the audience.");
  });
});

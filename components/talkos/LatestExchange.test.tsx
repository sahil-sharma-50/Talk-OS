import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LatestExchange } from "./LatestExchange";

it("shows only audible words even when the complete reply is already saved", () => {
  const props = { partialTranscript: null, turns: [{ id: "agent-one", speaker: "agent" as const, text: "Hello there. What are we building?", at: "" }] };
  const view = render(<LatestExchange {...props} voiceState="speaking" speechCaption={{ turnId: "agent-one", text: "Hello there.", activeStart: 6, activeEnd: 12 }} />);
  expect(screen.getByLabelText("TalkOS").textContent).toBe("Hello there.");
  expect(screen.getByLabelText("TalkOS").querySelector("mark")?.textContent).toBe("there.");
  view.rerender(<LatestExchange {...props} voiceState="listening" speechCaption={null} />);
  expect(screen.getByLabelText("TalkOS").textContent).toBe(props.turns[0].text);
  expect(screen.getByLabelText("TalkOS").querySelector("mark")).toBeNull();
});

it("lets the reader scroll back without being pulled away, then resume following", () => {
  const caption = { turnId: "agent-one", text: "A long spoken reply", activeStart: 14, activeEnd: 18 };
  const view = render(<LatestExchange partialTranscript={null} turns={[]} voiceState="speaking" speechCaption={caption} />);
  const reply = screen.getByLabelText("TalkOS");
  Object.defineProperties(reply, { scrollHeight: { value: 900 }, clientHeight: { value: 100 }, scrollTop: { value: 800, writable: true } });
  const scroll = vi.fn(); reply.scrollTo = scroll;
  fireEvent.wheel(reply, { deltaY: -100 });
  reply.scrollTop = 500;
  scroll.mockClear();
  view.rerender(<LatestExchange partialTranscript={null} turns={[]} voiceState="speaking" speechCaption={{ ...caption, text: `${caption.text} continues.` }} />);
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Follow voice" }));
  expect(scroll).toHaveBeenCalledWith({ top: 900, behavior: "instant" });
  expect(screen.queryByRole("button", { name: "Follow voice" })).toBeNull();
});

it("immediately shows an interruption instead of stale playback captions", () => {
  render(<LatestExchange turns={[]} partialTranscript={{ speaker: "user", text: "Wait, use the other file" }} speechCaption={{ turnId: "old", text: "Old response", activeStart: 0, activeEnd: 3 }} voiceState="interrupted" />);
  expect(screen.getByLabelText("You")).toHaveTextContent("Wait, use the other file");
  expect(screen.queryByLabelText("TalkOS")).toBeNull();
});

it("shows consecutive saved user phrases as one request", () => {
  render(<LatestExchange partialTranscript={null} turns={[
    { id: "one", speaker: "user", text: "Open my planner", at: "" },
    { id: "two", speaker: "user", text: "and create a shopping list.", at: "" },
    { id: "agent", speaker: "agent", text: "Creating your list.", at: "" },
  ]} />);
  expect(screen.getByLabelText("You")).toHaveTextContent("Open my planner and create a shopping list.");
});

it("replaces a same-request partial without repeating the finalized prefix", () => {
  render(<LatestExchange partialTranscript={{ speaker: "user", text: "Open my planner and create a list", turnId: "request" }} turns={[{ id: "request", speaker: "user", text: "Open my planner", at: "" }]} />);
  expect(screen.getByLabelText("You").textContent).toBe("Open my planner and create a list");
});

it("does not combine separate requests when an interrupted reply has no final transcript", () => {
  render(<LatestExchange partialTranscript={null} turns={[
    { id: "request-one", speaker: "user", text: "Open my planner.", at: "" },
    { id: "request-two", speaker: "user", text: "Actually use Sheets.", at: "" },
  ]} />);
  expect(screen.getByLabelText("You").textContent).toBe("Actually use Sheets.");
});

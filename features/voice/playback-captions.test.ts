import { expect, it } from "vitest";
import { TimedReplyCaptions } from "./playback-captions";

it("reveals timed words against played audio, not the arrival of a sentence", () => {
  const reply = new TimedReplyCaptions("agent-one");
  reply.addWord("Hi,", 0, 300);
  reply.addWord("Talk", 500, 800);
  reply.addWord("OS.", 800, 1100);
  reply.addAudio(10, 2);
  expect(reply.sample(9)?.text).toBe("");
  expect(reply.sample(10.1)).toMatchObject({ text: "Hi,", activeStart: 0, activeEnd: 3 });
  expect(reply.sample(10.4)).toMatchObject({ text: "Hi,", activeStart: 3, activeEnd: 3 });
  expect(reply.sample(10.6)).toMatchObject({ text: "Hi, Talk", activeStart: 4, activeEnd: 8 });
  reply.finish();
  expect(reply.finished(10.8)).toBe(false);
  expect(reply.sample(10.9)?.text).toBe("Hi, Talk OS.");
  expect(reply.finished(12)).toBe(true);
});

it("freezes during a playback gap and resumes from the same PCM position", () => {
  const reply = new TimedReplyCaptions("gap");
  reply.addWord("First", 0, 300);
  reply.addWord("second", 600, 900);
  reply.addAudio(0, .5);
  reply.addAudio(3, .5);
  expect(reply.sample(2)?.text).toBe("First");
  expect(reply.sample(3.2)?.text).toBe("First second");
});

it("deduplicates timing events, orders delayed words and preserves punctuation", () => {
  const reply = new TimedReplyCaptions("delayed");
  reply.addWord("What", 500, 750);
  reply.addWord("Hi.", 0, 200);
  reply.addWord("What", 500, 750);
  reply.addWord("next?", 750, 1000);
  reply.addAudio(1, 2);
  expect(reply.sample(2)?.text).toBe("Hi. What next?");
});

it("does not invent captions for missing or invalid timing data", () => {
  const reply = new TimedReplyCaptions("untimed");
  reply.addWord("Missing", undefined, undefined);
  reply.addWord("Invalid", -1, 2);
  reply.addWord("Reversed", 8, 3);
  reply.addWord("Infinite", 0, Infinity);
  reply.addAudio(0, 1);
  expect(reply.sample(.5)).toBeNull();
});

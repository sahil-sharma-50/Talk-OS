import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

function processor(rate: number) {
  const messages: ArrayBuffer[] = [];
  let Processor: new (options: unknown) => { process(inputs: Float32Array[][]): void };
  runInNewContext(readFileSync("public/pcm-processor.js", "utf8"), {
    AudioWorkletProcessor: class { port = { postMessage: (buffer: ArrayBuffer) => messages.push(buffer) }; },
    sampleRate: rate,
    registerProcessor: (_: string, type: typeof Processor) => { Processor = type; },
  });
  return { instance: new Processor!({ processorOptions: { inputSampleRate: rate, targetSampleRate: 24000 } }), messages };
}

it.each([44100, 48000])( "streams bounded 20 ms mic frames without dropping fractional resampling positions at %i Hz", rate => {
  const { instance, messages } = processor(rate);
  const blocks = Math.ceil(rate * 2 / 128);
  for (let i = 0; i < blocks; i++) instance.process([[new Float32Array(128).fill(.25)]]);
  expect(messages.length).toBeGreaterThanOrEqual(99);
  expect(messages.length).toBeLessThanOrEqual(101);
  expect(messages.every(buffer => buffer.byteLength === 960)).toBe(true);
  const samples = messages.reduce((sum, buffer) => sum + buffer.byteLength / 2, 0);
  const expected = blocks * 128 / rate * 24000;
  expect(expected - samples).toBeGreaterThanOrEqual(-1);
  expect(expected - samples).toBeLessThan(480);
  expect(new Int16Array(messages[0])[0]).toBe(8192);
});

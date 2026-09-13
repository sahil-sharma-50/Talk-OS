import type { SpeechCaption } from "@/features/session/session.types";

interface Word { text: string; start: number; end: number; from: number; to: number }
interface AudioChunk { at: number; duration: number; offset: number }

/** Provider word times are offsets into PCM, not wall time. Network gaps must
 * not advance the caption, and network completion does not mean playback ended. */
export class TimedReplyCaptions {
  private words: Word[] = [];
  private chunks: AudioChunk[] = [];
  private text = "";
  private duration = 0;
  private done = false;

  constructor(readonly turnId: string) {}

  addWord(text: string, start: unknown, end: unknown) {
    if (!text.trim() || typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return;
    if (this.words.some(word => word.start === start && word.end === end && word.text === text.trim())) return;
    this.words.push({ text: text.trim(), start, end, from: 0, to: 0 });
    this.words.sort((a, b) => a.start - b.start);
    this.text = "";
    for (const word of this.words) {
      if (this.text && !/^[.,!?;:%)\]}’”]/.test(word.text)) this.text += " ";
      word.from = this.text.length;
      this.text += word.text;
      word.to = this.text.length;
    }
  }

  addAudio(at: number, duration: number) {
    this.chunks.push({ at, duration, offset: this.duration });
    this.duration += duration;
  }

  finish() { this.done = true; }

  finished(now: number) {
    const last = this.chunks.at(-1);
    return this.done && (!last || now >= last.at + last.duration);
  }

  sample(now: number): SpeechCaption | null {
    if (!this.words.length) return null;
    const chunk = this.chunks.findLast(item => now >= item.at);
    // No reveal until this reply's audio actually reaches the output device.
    const playedMs = chunk ? (chunk.offset + Math.min(now - chunk.at, chunk.duration)) * 1000 : -1;
    const word = this.words.findLast(item => item.start <= playedMs);
    const text = word ? this.text.slice(0, word.to) : "";
    const active = word && playedMs < word.end;
    return { turnId: this.turnId, text, activeStart: active ? word.from : text.length, activeEnd: text.length };
  }
}

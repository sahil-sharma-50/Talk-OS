import type { SpeechCaption } from "@/features/session/session.types";

interface Word { text: string; start: number; end: number; from: number; to: number }
interface AudioChunk { at: number; duration: number; offset: number }

/** Provider word times are offsets into PCM, not wall time. Network gaps must
 * not advance the caption, and network completion does not mean playback ended. */
export class TimedReplyCaptions {
  private words: Word[] = [];
  private chunks: AudioChunk[] = [];
  private text = "";
  private transcript = "";
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

  /** The public Voice Agent protocol guarantees a final transcript but does
   * not guarantee word timestamps. Pace that text over the PCM duration so a
   * buffered response never appears on screen before it is heard. */
  setText(text: string) {
    this.transcript = text.trim();
  }

  finish() { this.done = true; }

  finished(now: number) {
    const last = this.chunks.at(-1);
    return this.done && (!last || now >= last.at + last.duration);
  }

  sample(now: number): SpeechCaption | null {
    const words = this.words.length ? this.words : this.fallbackWords();
    const fullText = this.words.length ? this.text : this.transcript;
    if (!words.length) return null;
    const chunk = this.chunks.findLast(item => now >= item.at);
    // No reveal until this reply's audio actually reaches the output device.
    const playedMs = chunk ? (chunk.offset + Math.min(now - chunk.at, chunk.duration)) * 1000 : -1;
    const word = words.findLast(item => item.start <= playedMs);
    const text = word ? fullText.slice(0, word.to) : "";
    const active = word && playedMs < word.end;
    return { turnId: this.turnId, text, activeStart: active ? word.from : text.length, activeEnd: text.length };
  }

  private fallbackWords(): Word[] {
    if (!this.transcript || this.duration <= 0) return [];
    const matches = [...this.transcript.matchAll(/\S+/g)];
    const totalWeight = matches.reduce((sum, match) => sum + match[0].length + 1, 0);
    const durationMs = this.duration * 1000;
    let elapsedWeight = 0;
    return matches.map((match) => {
      const weight = match[0].length + 1;
      const start = durationMs * elapsedWeight / totalWeight;
      elapsedWeight += weight;
      return {
        text: match[0],
        start,
        end: durationMs * elapsedWeight / totalWeight,
        from: match.index,
        to: match.index + match[0].length,
      };
    });
  }
}

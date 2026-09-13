interface Phrase { id: string; text: string; final: boolean }

export class SpokenRequest {
  private phrases: Phrase[] = [];
  private retired = new Set<string>();
  private turnId = `request-${crypto.randomUUID()}`;
  private nextRequest = false;
  private actionResponse = false;
  private anonymousId: string | undefined;
  get text() { return this.phrases.map(phrase => phrase.text).join(" "); }
  responseStarted() { this.nextRequest = true; }
  actionResponded() { this.actionResponse = true; }
  accept(text: string, itemId: string | undefined, final: boolean): { text: string; turnId: string } | null {
    const value = text.trim(); if (!value || itemId && this.retired.has(itemId)) return null;
    const id = itemId ?? this.anonymousId ?? `phrase-${crypto.randomUUID()}`;
    let existing = this.phrases.find(phrase => phrase.id === id);
    if (existing?.final && (!final || existing.text === value)) return null;
    // A brief acknowledgment after a visible action starts a new exchange even
    // before its audio arrives. Continued instructions (including short tails)
    // still join the original request.
    const acknowledgment = /^(?:(?:ok(?:ay)?|cool|great|nice|perfect|thanks(?: a lot)?|thank you(?: very much)?|looks? (?:really |very )?(?:good|nice|great)|that(?:'s| is) (?:good|great|nice|perfect))(?:\s+|$))+$/i.test(value.replace(/[.!?,]/g, " ").trim().replace(/\s+/g, " "));
    if ((this.nextRequest || this.actionResponse && acknowledgment) && !existing) {
      this.phrases.forEach(phrase => this.retired.add(phrase.id));
      while (this.retired.size > 256) this.retired.delete(this.retired.values().next().value!);
      this.phrases = []; this.turnId = `request-${crypto.randomUUID()}`; this.nextRequest = false; this.actionResponse = false;
      existing = undefined;
    }
    if (existing) { existing.text = value; existing.final = final; }
    else this.phrases.push({ id, text: value, final });
    this.anonymousId = !itemId && !final ? id : undefined;
    return { text: this.text, turnId: this.turnId };
  }
}

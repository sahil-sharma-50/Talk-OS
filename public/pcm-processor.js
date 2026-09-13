class TalkOSPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.ratio = (config.inputSampleRate || sampleRate) / (config.targetSampleRate || 24000);
    this.position = 0;
    this.frame = new Int16Array(480);
    this.used = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    while (this.position < input.length) {
      const sample = input[Math.floor(this.position)] || 0;
      this.frame[this.used++] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      this.position += this.ratio;
      if (this.used === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(480);
        this.used = 0;
      }
    }
    // Preserve the fractional sample position across worklet blocks, especially
    // at 44.1 kHz. Emit 20 ms packets rather than hundreds of tiny messages/sec.
    this.position -= input.length;
    return true;
  }
}

registerProcessor("talkos-pcm-processor", TalkOSPcmProcessor);

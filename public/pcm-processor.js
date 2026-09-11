class TalkOSPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.ratio = (config.inputSampleRate || sampleRate) / (config.targetSampleRate || 24000);
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    const length = Math.max(1, Math.floor(input.length / this.ratio));
    const pcm16 = new Int16Array(length);
    for (let index = 0; index < length; index += 1) {
      const sample = input[Math.floor(index * this.ratio)] || 0;
      pcm16[index] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("talkos-pcm-processor", TalkOSPcmProcessor);

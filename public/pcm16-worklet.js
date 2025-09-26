class Pcm16Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetSampleRate = opts.targetSampleRate || 16000;
    this._resampleBuffer = [];
    this._lastSample = 0;
  }

  static get parameterDescriptors() { return []; }

  downsampleFloat32ToInt16(input, inSampleRate, outSampleRate) {
    if (outSampleRate === inSampleRate) {
      // direct convert float32 [-1,1] to int16 LE
      const out = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return out;
    }
    const ratio = inSampleRate / outSampleRate;
    const outLength = Math.floor(input.length / ratio);
    const out = new Int16Array(outLength);
    let pos = 0;
    for (let i = 0; i < outLength; i++) {
      const idx = i * ratio;
      const i0 = Math.floor(idx);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const t = idx - i0;
      const s = input[i0] * (1 - t) + input[i1] * t; // linear interpolation
      let v = Math.max(-1, Math.min(1, s));
      out[pos++] = v < 0 ? v * 0x8000 : v * 0x7FFF;
    }
    return out;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    // mono: take channel 0
    const ch0 = input[0];
    if (!ch0) return true;

    const inSr = sampleRate; // AudioWorklet global
    const int16 = this.downsampleFloat32ToInt16(ch0, inSr, this.targetSampleRate);
    // send transferable ArrayBuffer to main thread
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor('pcm16-processor', Pcm16Processor);

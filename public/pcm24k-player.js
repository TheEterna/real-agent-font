class PCM24kPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.srcRate = 24000;
    this.dstRate = sampleRate; // AudioContext output rate
    this.src = new Float32Array(0);
    this.srcPos = 0; // fractional read index in src buffer
    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'push') {
        const ab = msg.pcm16;
        if (ab && ab.byteLength) {
          const view = new Int16Array(ab);
          const f32 = new Float32Array(view.length);
          for (let i = 0; i < view.length; i++) {
            f32[i] = Math.max(-1, Math.min(1, view[i] / 32768));
          }
          // append to src
          const merged = new Float32Array(this.src.length + f32.length);
          merged.set(this.src, 0);
          merged.set(f32, this.src.length);
          this.src = merged;
        }
      } else if (msg.type === 'done') {
        // Optionally mark end; we just let buffer drain
        this.done = true;
      } else if (msg.type === 'setSrcRate') {
        const v = Number(msg.value);
        if (v && isFinite(v) && v > 0) this.srcRate = v;
      } else if (msg.type === 'reset') {
        this.src = new Float32Array(0);
        this.srcPos = 0;
      } else if (msg.type === 'stop') {
        // 立即清空缓冲区，停止播放
        this.src = new Float32Array(0);
        this.srcPos = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const ch0 = output[0];
    const frames = ch0.length;

    const ratio = this.srcRate / this.dstRate; // how many source frames per 1 output frame

    let needMaxIndex = Math.ceil(this.srcPos + frames * ratio) + 1;
    if (this.src.length < needMaxIndex) {
      // Not enough data; fill zeros for missing part
      // We'll still output what we can to avoid blocking the graph
    }

    for (let i = 0; i < frames; i++) {
      const srcIndex = this.srcPos;
      const i0 = Math.floor(srcIndex);
      const frac = srcIndex - i0;
      let s0 = 0, s1 = 0;
      if (i0 < this.src.length) s0 = this.src[i0];
      if (i0 + 1 < this.src.length) s1 = this.src[i0 + 1];
      const sample = s0 + (s1 - s0) * frac;
      ch0[i] = sample;
      // mono to stereo if needed
      for (let ch = 1; ch < output.length; ch++) {
        output[ch][i] = sample;
      }
      this.srcPos += ratio;
    }

    // Drop consumed source samples to keep buffer small
    const drop = Math.floor(this.srcPos) - 1; // keep 1 sample for interpolation
    if (drop > 0 && drop < this.src.length) {
      this.src = this.src.slice(drop);
      this.srcPos -= drop;
      if (this.srcPos < 0) this.srcPos = 0;
    }

    return true;
  }
}

registerProcessor('pcm24k-player', PCM24kPlayerProcessor);

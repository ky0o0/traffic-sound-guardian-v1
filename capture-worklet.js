import { AudioWindowBuffer } from './audio-window.js';
class GuardianCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = new AudioWindowBuffer(sampleRate, frame => {
      // Bound messages if the page thread stalls: don't accumulate audio.
      if (this.waiting) return;
      this.waiting = true;
      this.port.postMessage({ type: 'window', ...frame, endTime: currentTime }, [frame.samples.buffer]);
    });
    this.waiting = false;
    this.port.onmessage = () => { this.waiting = false; };
  }
  process(inputs, outputs) {
    this.frames.push(inputs[0] || []);
    for (const output of outputs) for (const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('guardian-capture', GuardianCapture);

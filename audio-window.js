// Keep samples at the ACTUAL AudioContext sample rate.
// Do not label native 44.1/48 kHz samples as 16 kHz; the Worker converts them.
export class AudioWindowBuffer {
  constructor(sampleRate, onWindow) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new Error('Invalid sample rate');
    this.sampleRate = sampleRate;
    // The Worker produces exactly 15,600 samples from this native-rate window.
    // Floor differs from 0.975 s by less than one source sample.
    this.size = Math.floor(sampleRate * 15600 / 16000);
    this.hop = Math.round(sampleRate * 0.480);
    this.ring = new Float32Array(this.size);
    this.write = 0;
    this.total = 0;
    this.next = this.size;
    this.sequence = 0;
    this.onWindow = onWindow;
  }
  push(channels) {
    if (!channels.length || !channels[0]?.length) return;
    const length = channels[0].length;
    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      this.ring[this.write] = sample / channels.length;
      this.write = (this.write + 1) % this.size;
      this.total++;
      if (this.total === this.next) {
        const samples = new Float32Array(this.size);
        const tail = this.size - this.write;
        samples.set(this.ring.subarray(this.write));
        samples.set(this.ring.subarray(0, this.write), tail);
        this.onWindow({ samples, sequence: ++this.sequence, endSample: this.total });
        this.next += this.hop;
      }
    }
  }
}

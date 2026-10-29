import {
  AudioWindowBuffer
} from './audio-window.js';
import {
  NAMES
} from './ai-test-analysis.js?v=1.5.2';
export const LIMITS = Object.freeze({
  files: 50,
  fileBytes: 20 * 1024 * 1024,
  seconds: 120,
  decodedBytes: 96 * 1024 * 1024
});
export class TestError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function checkFile(file) {
  if (file.size > LIMITS.fileBytes) throw new TestError('fileLarge');
  if (!file.size) throw new TestError('decodeError');
}
export function checkAudio(audio) {
  if (!Number.isFinite(audio.duration) || !Number.isFinite(audio.sampleRate) || !Number.isInteger(audio
      .length) || !Number.isInteger(audio.numberOfChannels) || audio.length <= 0 || audio.numberOfChannels <=
    0) throw new TestError('decodeError');
  if (audio.duration > LIMITS.seconds || audio.length * audio.numberOfChannels * 4 > LIMITS.decodedBytes)
    throw new TestError('audioLarge');
  if (audio.sampleRate < 8000 || audio.sampleRate > 192000) throw new TestError('sampleRate');
  if (audio.length < Math.floor(audio.sampleRate * .975)) throw new TestError('tooShort');
}
export function* windowsOf(audio) {
  const queue = [],
    buffer = new AudioWindowBuffer(audio.sampleRate, w => queue.push(w));
  const channels = Array.from({
    length: audio.numberOfChannels
  }, (_, i) => audio.getChannelData(i));
  for (let start = 0; start < audio.length; start += 4096) {
    buffer.push(channels.map(c => c.subarray(start, Math.min(start + 4096, audio.length))));
    while (queue.length) {
      const w = queue.shift();
      yield {
        ...w,
        start: (w.endSample - buffer.size) / audio.sampleRate,
        end: w.endSample / audio.sampleRate
      };
    }
  }
}
export class ModelClient {
  constructor() {
    this.worker = null;
    this.pending = null;
  }
  request(message, transfer = [], timeout = 90000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new TestError('modelTimeout'));
        this.close();
      }, timeout);
      this.pending = {
        resolve: x => {
          clearTimeout(timer);
          this.pending = null;
          resolve(x);
        },
        reject: e => {
          clearTimeout(timer);
          this.pending = null;
          reject(e);
        }
      };
      try {
        this.worker.postMessage(message, transfer);
      } catch {
        this.pending.reject(new TestError('modelError'));
      }
    });
  }
  async init() {
    this.worker = new Worker(new URL('./classifier-worker.js?v=1.5.2', import.meta.url));
    this.worker.onmessage = ({
      data
    }) => {
      if (data.type === 'error') this.pending?.reject(new TestError('modelError'));
      else this.pending?.resolve(data);
    };
    this.worker.onerror = () => this.pending?.reject(new TestError('modelError'));
    const response = await this.request({
      type: 'init'
    });
    if (response.type !== 'ready') throw new TestError('modelError');
  }
  async classify(frame, sampleRate) {
    const began = performance.now();
    const data = await this.request({
      type: 'classify',
      sequence: frame.sequence,
      samples: frame.samples,
      sampleRate,
      debug: false
    }, [frame.samples.buffer], 30000);
    if (data.type !== 'result' || data.sequence !== frame.sequence || !Number.isFinite(data.inferenceMs) ||
      data.inferenceMs < 0 ||
      NAMES.some(n => !Number.isFinite(data.trafficScores?.[n]) || data.trafficScores[n] < 0 || data
        .trafficScores[n] > 1)) throw new TestError('modelError');
    return {
      scores: data.trafficScores,
      inferenceMs: data.inferenceMs,
      roundTripMs: performance.now() - began
    };
  }
  close() {
    this.pending?.reject(new TestError('cancelled'));
    this.worker?.terminate();
    this.worker = null;
  }
}
// Read metadata BEFORE decode: compressed file size alone cannot bound decoded PCM.
export async function metadata(file, signal) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio'),
      url = URL.createObjectURL(file);
    const clean = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      audio.onloadedmetadata = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };
    const done = (error, value) => {
      clean();
      error ? reject(error) : resolve(value);
    };
    const abort = () => done(new TestError('cancelled'));
    const timer = setTimeout(() => done(new TestError('decodeError')), 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => Number.isFinite(audio.duration) && audio.duration <= LIMITS.seconds ?
      done(null, audio.duration) : done(new TestError('audioLarge'));
    audio.onerror = () => done(new TestError('decodeError'));
    signal?.addEventListener('abort', abort, {
      once: true
    });
    if (signal?.aborted) abort();
    else audio.src = url;
  });
}
export async function decodeFile(file, signal, onDuration) {
  checkFile(file);
  onDuration(await metadata(file, signal));
  if (signal.aborted) throw new TestError('cancelled');
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new TestError('unsupported');
  const context = new Context();
  try {
    const bytes = await file.arrayBuffer();
    if (signal.aborted) throw new TestError('cancelled');
    // decodeAudioData is not abortable. Keep the batch locked until it settles;
    // a cancelled decode is discarded before any inference or next-file allocation.
    const audio = await context.decodeAudioData(bytes);
    if (signal.aborted) throw new TestError('cancelled');
    checkAudio(audio);
    return audio;
  } catch (error) {
    if (error instanceof TestError) throw error;
    throw new TestError('decodeError');
  } finally {
    await context.close().catch(() => {});
  }
}
export class BatchRunner {
  constructor({
    decode = decodeFile,
    clientFactory = () => new ModelClient(),
    now = () => performance.now(),
    yieldFrame = () => new Promise(r => setTimeout(r, 0))
  } = {}) {
    Object.assign(this, {
      decode,
      clientFactory,
      now,
      yieldFrame
    });
    this.running = false;
  }
  cancel() {
    this.controller?.abort();
    this.client?.close();
  }
  async run(clips, thresholds, onUpdate = () => {}) {
    if (this.running) throw new TestError('busy');
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const config = {
      ...thresholds
    };
    let completed = 0;
    try {
      this.client = this.clientFactory();
      await this.client.init();
      for (const clip of clips) {
        if (signal.aborted) break;
        clip.result = null;
        clip.error = null;
        clip.progress = 0;
        clip.status = 'decoding';
        onUpdate(completed, clips.length, clip);
        const began = this.now();
        let audio = null;
        try {
          audio = await this.decode(clip.file, signal, d => {
            clip.duration = d;
            onUpdate(completed, clips.length, clip);
          });
          checkAudio(audio);
          if (signal.aborted) throw new TestError('cancelled');
          clip.duration = audio.duration;
          clip.status = 'testing';
          const total = 1 + Math.floor((audio.length - Math.floor(audio.sampleRate * .975)) / Math.round(
              audio.sampleRate * .48)),
            windows = [];
          for (const frame of windowsOf(audio)) {
            if (signal.aborted) throw new TestError('cancelled');
            const result = await this.client.classify(frame, audio.sampleRate);
            if (signal.aborted) throw new TestError('cancelled');
            windows.push({
              start: frame.start,
              end: frame.end,
              ...result
            });
            clip.progress = windows.length / total;
            onUpdate(completed, clips.length, clip);
            await this.yieldFrame();
          }
          clip.result = {
            windows,
            sampleRate: audio.sampleRate,
            channels: audio.numberOfChannels,
            thresholds: config,
            offlineMs: this.now() - began,
            coveredUntil: windows.at(-1).end,
            tailSeconds: Math.max(0, audio.duration - windows.at(-1).end)
          };
          clip.status = 'done';
        } catch (error) {
          clip.result = null;
          clip.status = signal.aborted ? 'cancelled' : 'failed';
          clip.error = error.code ?? 'decodeError';
        } finally {
          audio = null;
          completed++;
          onUpdate(completed, clips.length, clip);
        }
        // A model crash may have terminated its worker. Reinitialize for the next file.
        if (!signal.aborted && clip.error?.startsWith('model')) {
          this.client.close();
          this.client = this.clientFactory();
          await this.client.init();
        }
      }
    } catch (error) {
      for (const c of clips.filter(c => !['done', 'failed'].includes(c.status))) {
        c.status = signal.aborted ? 'cancelled' : 'failed';
        c.error = error.code ?? 'modelError';
        c.result = null;
      }
    } finally {
      if (signal.aborted)
        for (const c of clips.filter(c => ['queued', 'decoding', 'testing'].includes(c.status))) {
          c.status = 'cancelled';
          c.result = null;
        }
      this.client?.close();
      this.client = null;
      this.running = false;
      onUpdate(completed, clips.length, null);
    }
  }
}

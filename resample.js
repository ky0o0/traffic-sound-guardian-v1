// Explicit, deterministic 16 kHz conversion before MediaPipe. A finite
// windowed-sinc low-pass suppresses aliasing (not just dropping samples).
// Processing happens in the classification Worker, never the audio callback.
const OUTPUT_RATE = 16000;
const OUTPUT_SAMPLES = 15600;
const TAPS = 96;
const PHASES = 1024;
let cachedRate = 0;
let cachedKernels;
function kernelsFor(rate) {
  if (cachedRate === rate) return cachedKernels;
  const cutoff = 0.45 * Math.min(1, OUTPUT_RATE / rate);
  const kernels = new Float64Array(PHASES * TAPS);
  for (let p = 0; p < PHASES; p++) {
    let total = 0;
    for (let j = 0; j < TAPS; j++) {
      const x = j - (TAPS / 2 - 1) - p / PHASES;
      const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
      const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * j / (TAPS - 1)) + 0.08 * Math.cos(4 * Math.PI * j / (TAPS - 1));
      const weight = sinc * window;
      kernels[p * TAPS + j] = weight;
      total += weight;
    }
    for (let j = 0; j < TAPS; j++) kernels[p * TAPS + j] /= total;
  }
  cachedRate = rate;
  cachedKernels = kernels;
  return kernels;
}
export function toModelAudio(input, inputRate) {
  if (!(input instanceof Float32Array) || !Number.isFinite(inputRate) || inputRate < 8000 || inputRate > 192000 ||
      Math.abs(input.length - inputRate * 0.975) > 1) throw new Error('Invalid PCM window or sample rate');
  if (inputRate === OUTPUT_RATE && input.length === OUTPUT_SAMPLES) return input;
  const output = new Float32Array(OUTPUT_SAMPLES);
  const kernels = kernelsFor(inputRate);
  const ratio = inputRate / OUTPUT_RATE;
  for (let i = 0; i < OUTPUT_SAMPLES; i++) {
    const position = i * ratio;
    const integer = Math.floor(position);
    const phase = Math.min(PHASES - 1, Math.floor((position - integer) * PHASES));
    const start = integer - (TAPS / 2 - 1);
    let value = 0;
    for (let j = 0; j < TAPS; j++) {
      // Edge extension is bounded to half a filter width at the window ends.
      value += input[Math.max(0, Math.min(input.length - 1, start + j))] * kernels[phase * TAPS + j];
    }
    output[i] = Math.max(-1, Math.min(1, value));
  }
  return output;
}

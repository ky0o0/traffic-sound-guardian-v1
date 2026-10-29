/* Classic Worker intentionally: MediaPipe 0.10.21 loads its WASM glue using
   importScripts(), which is unavailable in a module-type Worker. Dynamic import
   loads the official, unmodified ESM package inside this classic Worker. */
let classifier;
let initializing;
let selectTarget;
let selectTrafficScores;
let resample;
let summarizeDebug;
self.onmessage = async ({ data }) => {
  let inferenceStarted;
  let inferenceMs = null;
  try {
    if (data.type === 'init') {
      initializing ??= (async () => {
        const [{ AudioClassifier, FilesetResolver }, { bestTarget, targetScores }, { toModelAudio }, debug] = await Promise.all([
          import('./audio_bundle.mjs'), import('./detection.js?v=1.5.3'), import('./resample.js'), import('./debug.js')
        ]);
        selectTarget = bestTarget;
        selectTrafficScores = targetScores;
        resample = toModelAudio;
        summarizeDebug = debug.summarizeDebug;
        const files = await FilesetResolver.forAudioTasks(new URL('./', self.location.href).href.replace(/\/$/, ''));
        classifier = await AudioClassifier.createFromOptions(files, {
          baseOptions: { modelAssetPath: new URL('./yamnet.tflite', self.location.href).href },
          maxResults: -1,
          scoreThreshold: 0
        });
        self.postMessage({ type: 'ready' });
      })();
      await initializing;
    } else if (data.type === 'classify') {
      if (!classifier) throw new Error('Model is not ready');
      const audio = resample(data.samples, data.sampleRate);
      inferenceStarted = performance.now();
      const results = classifier.classify(audio, 16000);
      inferenceMs = performance.now() - inferenceStarted;
      const count = results.reduce((n, r) => n + r.classifications.reduce((m, h) => m + h.categories.length, 0), 0);
      if (count !== 521 || results.length !== 1) throw new Error('Incomplete YAMNet classification output');
      // Send only real model results. No audio, history or scores are persisted.
      self.postMessage({ type: 'result', sequence: data.sequence, target: selectTarget(results), trafficScores: selectTrafficScores(results),
        inferenceMs, categoryCount: count, frameCount: results.length,
        debug: data.debug ? summarizeDebug(results) : undefined });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error), operation: data.type,
      sequence: data.sequence, inferenceMs: inferenceMs ?? (inferenceStarted == null ? null : performance.now() - inferenceStarted) });
  }
};

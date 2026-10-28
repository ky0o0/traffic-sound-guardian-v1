/* Classic Worker intentionally: MediaPipe 0.10.21 loads its WASM glue using
   importScripts(), which is unavailable in a module-type Worker. Dynamic import
   loads the official, unmodified ESM package inside this classic Worker. */
let classifier;
let initializing;
let selectTarget;
let resample;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      initializing ??= (async () => {
        const [{ AudioClassifier, FilesetResolver }, { bestTarget }, { toModelAudio }] = await Promise.all([
          import('./audio_bundle.mjs'), import('./detection.js'), import('./resample.js')
        ]);
        selectTarget = bestTarget;
        resample = toModelAudio;
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
      const started = performance.now();
      const results = classifier.classify(resample(data.samples, data.sampleRate), 16000);
      const count = results.reduce((n, r) => n + r.classifications.reduce((m, h) => m + h.categories.length, 0), 0);
      if (count !== 521 || results.length !== 1) throw new Error('Incomplete YAMNet classification output');
      // Send only real model results. No audio, history or scores are persisted.
      self.postMessage({ type: 'result', sequence: data.sequence, target: selectTarget(results),
        inferenceMs: performance.now() - started, categoryCount: count, frameCount: results.length });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};

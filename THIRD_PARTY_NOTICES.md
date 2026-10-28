# Third-party assets

## MediaPipe Tasks Audio

- Package: `@mediapipe/tasks-audio`, version **0.10.21**.
- Copyright The MediaPipe Authors / Google.
- License: Apache License 2.0; included as `APACHE-2.0.txt`.
- Unmodified distributed files: `audio_bundle.mjs`, `audio_wasm_internal.js`, `audio_wasm_internal.wasm`, `audio_wasm_nosimd_internal.js`, `audio_wasm_nosimd_internal.wasm`.
- Package source: https://www.npmjs.com/package/@mediapipe/tasks-audio/v/0.10.21
- Repository: https://github.com/google-ai-edge/mediapipe

## YAMNet

- Official MediaPipe-compatible YAMNet model, version **1**.
- Copyright The TensorFlow Authors / Google; Apache License 2.0.
- `yamnet.tflite` is unmodified and includes its label metadata.
- Model: https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite
- Model documentation: https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier
- Model source and class map: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet
- `yamnet_class_map.csv` is the unmodified official 521-class table.

All asset URLs and SHA-256 checksums are in `dependency-lock.json`.
The app's own code, labels, layout, buffering, resampling and threshold logic are separate from these upstream files.

Development-only recorded audio from TensorFlow's sample collection and ESC-50 was used for testing. Those recordings are NOT distributed in this project and are NOT loaded by the production application. See `TEST_REPORT.md` for test provenance.

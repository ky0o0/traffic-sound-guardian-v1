# Semantic Hearing × Traffic Sound Guardian: repeatable pilot

**Status (2026-10-29):** Official authors' `39.pt` ran successfully in GitHub Actions with a 1-second *synthetic stereo* audio sample. [Successful run](https://github.com/ky0o0/traffic-sound-guardian-v1/actions/runs/40895746278). This confirms basic compatibility and WAV output shape, **not** improved traffic-warning detection.

## What this branch contains
- `research/semantic_hearing/extract.py` — invokes the **unmodified upstream network and pretrained weights** for offline `car_horn` or `siren` target separation; verifies checkpoint SHA-256 before deserialization.
- `research/semantic_hearing/compare_exports.py` — compares two AI Test Mode JSON exports on the **same original recording group IDs** at an identical threshold, calculating paired clip-level counts and Precision, Recall and F1.
- `.github/workflows/research-semantic-hearing.yml` — automatic contract tests and one author-model smoke run on the trusted experimental branch.
- The original live YAMNet detection and website files are **unchanged**.

## Repeatable comparison

1. Capture or obtain licensed **genuine stereo, 44,100-Hz WAV** originals in quiet and noisy conditions. Keep complete, human-confirmed labels for target/no-target clips and preserve the original recording group IDs. Do not duplicate a Bluetooth mono stream into fake binaural.
2. Clone [the official Semantic Hearing repository](https://github.com/vb000/SemanticHearing) and check out `07e9786c7a741f0a7c722dcde66a2679ca068c50`. Use a compatible Python environment; [original instructions](https://github.com/vb000/SemanticHearing#evaluation). Obtain original author-hosted `39.pt`; expected SHA-256: `f0328655691378a65516ec08add170bcf474ba41bb2d475af7a7c63bf2478a21`. Don't commit any checkpoint or source audio to this public repo.
3. Run the local offline adapter, for example:

```sh
python research/semantic_hearing/extract.py \
  --semantic-repo /path/to/SemanticHearing \
  --checkpoint /path/to/39.pt \
  --input /path/to/stereo_original.wav \
  --output /path/to/stereo_car_horn.wav \
  --target car_horn \
  --group-id recording-001
```

4. In the **existing V1.5.4 AI Test Mode**, run the raw files as one batch and export JSON. Then run the extracted files as a separate batch with the **same real labels and source group IDs**, same threshold settings, and export JSON. Verify that extraction has not shifted or suppressed the target truth itself; do not invent ground truth based on model predictions.
5. Compare the exports:

```sh
python research/semantic_hearing/compare_exports.py \
  --raw original.json \
  --processed extracted.json \
  --label horn \
  --output paired-comparison.json
```

For generic sirens use `--label siren` and `--target siren`. Siren subtype scores are separate classes in YAMNet, so specify and report which definition is under evaluation.

**Interpretation:** Record more independent *original* groups than the exploratory minimum, include negative/background controls, predefine the threshold/labels, preserve original/processed pair membership across dataset splits, and reserve independent groups for the final test. The existing UI's automated group split must be checked because the two exports are generated in separate batches. A retrospective `compare_exports.py` report is **not** itself a blinded held-out study.

## What remains open
- Actual traffic sound benefit (Precision / Recall / F1; no real paired study has run).
- End-to-end latency including extraction, microphone and Bluetooth.
- Whether a phone/browser makes truly binaural earbud audio accessible.
- PAWS independent hardware-dependent vehicle localization.
- Controlled, non-road, real-device verification and subsequent production feasibility.

The model is **not** validated as a safety device. Keep PR #14 in draft until the actual traffic-sound benchmark is reviewed.

## Follow-up: recovered real-recording experiment (2026-10-30)

The earlier status above is historical. The independent recovery branch adds an SH-only recorded-audio study: [protocol and reproduction](semantic_hearing/REAL_AUDIO_README.md), [results](semantic_hearing/REAL_AUDIO_REPORT.md). It does not run the YAMNet paired-comparison procedure described above.

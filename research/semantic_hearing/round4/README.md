# TSG / Semantic Hearing Round 4 — fixed multi-label extraction gate

This is a **real-pretrained-model experiment** using the official pinned `39.pt` weights and already archived real-world source recordings, not an implementation of automatic sound classification.

## Exact question

Can official SH, when **preconfigured** with `car_horn` AND `siren` simultaneously, preserve both target signals on the same continuous input, without requiring the user to select one of them? A 20-dimensional multi-hot label is possible by the input tensor shape, but was not demonstrated as a supported training task. Its actual audio must be tested.

A favorable result means pre-configured *extraction*, **not** autonomous sound identification, detection accuracy, guaranteed audibility, traffic safety, or zero false alarms. `YAMNet` cannot be declared replaced solely by a successful audio-extraction pilot.

## Recorded sources / conditions

Use R3's verified `round2/evidence/listening-selection.zip` and `round2/evidence/boundary/boundary-listening.zip`, with the R3 `components` integrity checks. The source files themselves are real existing recordings, but every 7-second test is a constructed, controlled stereo mixture. Rain and road recordings are looped with an artificial 4.9995-second seam. No physical binaural capture has been established.

For each case keep separate reference tracks for `car_horn`, `siren` and `background`. Cases: horn alone, siren alone, overlap, horn then siren, siren then horn and no target. Start sounds after some background so historical state is already populated. R3's source recordings: horn 0260 / 0257, siren IUSB 014, rain 0124, IUSB road.

All conditions run the **same model** with the **same actual waveform** and continuous-state adapter:

1. Fixed `car_horn` one-hot.
2. Fixed `siren` one-hot.
3. Fixed `car_horn+siren` multi-hot (single inference stream).
4. Two independent continuous one-hot runs, summed off-line, with raw and amplitude-limited sum variants.

Each source's neural state remains independent; there is no switching or resetting when the sound changes.

## Readouts and caveats

Per-source simultaneous projection coefficients, onset 100ms and whole-event coefficients, overall combined-target SI-SDR improvement where target energy exists, no-target residual RMS, clipping risk/attenuation, CPU latency distributions, sample timing and per-stream RTF. Multiclass may retain one target but erase the other. Examine per-target gains rather than only a combined scalar. Dual-model timings are **actual serial invocation timings** and a purely theoretical parallel lower bound; no hardware concurrency is measured.

No classification labels, false-positive rates, false-negative rates, certainty of audibility, real microphone hardware, Bluetooth latency or mobile RAM/energy are measured.

## Reproduce

Use pinned upstream commit `07e9786c7a741f0a7c722dcde66a2679ca068c50` and strictly verified official weight SHA `f0328655691378a65516ec08add170bcf474ba41bb2d475af7a7c63bf2478a21`.

```bash
python -m unittest discover -s research/semantic_hearing/round4 -p 'test_*.py' -v
python research/semantic_hearing/round4/pilot.py --semantic-repo /tmp/SemanticHearing --checkpoint /tmp/39.pt --phase gate --output /tmp/sh-r4-gate
python research/semantic_hearing/round4/pilot.py --semantic-repo /tmp/SemanticHearing --checkpoint /tmp/39.pt --phase study --output /tmp/sh-r4-study
```

GitHub Actions first runs `gate` using the real model. It will only run the larger `study` if multi-hot inference is numerically valid and baseline checks pass. No threshold on sound quality is used to select favorable results; bad outputs are evidence.

This branch / Draft PR is experimental. Do not merge into `main` or modify the existing website. SH's separate architecture may make it useful even if this multi-label scheme fails.

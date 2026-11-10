# Threshold Research Decision Memo — 2026-10-31

## Decision Status

This is a **research memorandum**, not a verified optimal threshold for road safety and not a change to production settings. The project owner decided to **record the findings for now** and prioritize developing the two-tone earphone alert. The six factory-default thresholds in V1.6.1 remain **0.10**.

| Class | Exploratory recommendation | V1.6.1 production default | Evidence and limitations |
|---|---:|---:|---|
| Bicycle bell | 0.05 (requires further validation) | 0.10 | 100 original recordings; held-out detection was 30/30 at 0.05 versus 29/30 at 0.10. Dataset labels were not manually checked clip by clip. |
| Vehicle horn, car horn, honking | 0.10 (retain provisionally) | 0.10 | 100 original recordings; 0.05 increased held-out horn detections from 20/30 to 21/30 but also doubled false triggers on other sounds from 4 to 8; F1 fell. |
| Siren | 0.10 (retain provisionally for the traffic-safety objective) | 0.10 | 100 original recordings; 0.14 versus 0.10 reduced held-out siren detections from 26/31 to 25/31 and potential false positives from 7 to 4. Miss costs and audio annotations require review. |
| Police car (siren) | 0.10 (baseline only; not optimized) | 0.10 | Too few independent Japanese police-siren recordings. One Tokyo source recording split into eight clips is not eight independent samples. |
| Ambulance (siren) | 0.10 (baseline only; not optimized) | 0.10 | Very few Japanese ambulance reference sounds; no independently human-audited subtype accuracy estimate. |
| Fire engine, fire truck (siren) | 0.10 (baseline only; not optimized) | 0.10 | Very few Japanese fire-engine reference sounds; predictions may compete with general Siren and police-car labels. |

## Reproducibility and Data Sources

- [420 independent source recordings, raw scores for 8,302 windows, and held-out evaluation](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-six-targets-scale-20261030/research/yamnet/scale/RESULTS.json)
- [Large-sample research report (Chinese original on a separate research branch)](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-six-targets-scale-20261030/research/yamnet/scale/REPORT.zh-CN.md)
- [Japanese emergency-siren reference results](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-jp-emergency-types-pilot-20261030/research/yamnet/japan/RESULTS.json)
- [Candidate results for a distant siren recording in Tokyo](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-jp-emergency-types-pilot-20261030/research/yamnet/japan/field/RESULTS.json)

## Why Thresholds Have Not Been Lowered

Reducing a score threshold does not necessarily improve safety. Primary dataset labels have not been individually audited, and event onset/offset, distance, and mixed-noise conditions have not been verified. A clip's peak score cannot by itself predict the false-alert and missed-alert rates of real-time detection. Without independent subtype ground-truth labels, claiming an optimal threshold for a specific vehicle type is not supported.

Future priorities include independent recordings of Japanese police cars, ambulances, and fire engines from additional sources; manual annotation of event timing; and tests of actual alert playback and latency on iPhone and earphones. All candidate thresholds remain controls for future experiments and are **not automatically deployed** to user devices.

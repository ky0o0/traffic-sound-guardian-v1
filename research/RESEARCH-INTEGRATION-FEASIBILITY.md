# Research integration feasibility: Semantic Hearing + PAWS

**Experimental only.** This branch does not alter production V1.5.4, YAMNet, the realtime microphone pipeline, or warning rules. No pretrained-model inference or real-device test was completed.

## Verified upstream sources

* [Semantic Hearing](https://github.com/vb000/SemanticHearing) (MIT): original PyTorch model `src.training.dcc_tf_binaural.Net`, `experiments/dc_waveformer/config.json` and author-provided `39.pt` checkpoint. The reference model has **20 labels**; `car_horn` and `siren` are supported, but **bicycle_bell is not**. The model's reference input is two-channel 44,100-Hz audio, so a mono Bluetooth mic is not a validated drop-in input.
* [PAWS Smartphone](https://github.com/Columbia-ICSL/PAWS-Smartphone) and [PAWS FrontEnd](https://github.com/Columbia-ICSL/PAWS-FrontEnd) (MIT): Android classifier components use hardware-derived acoustic features; the system needs special front-end microphone hardware. Its `BTData.java` constructs 10 features from `zcr`, `pwr`, and `ccr`. These are not YAMNet scores or generic mono PCM.

## First experiment

Run an **offline**, original-model preprocessing comparison, **not** a browser or real-time integration:

1. Clone SemanticHearing at inspected source revision `07e9786c7a741f0a7c722dcde66a2679ca068c50` in a separate research environment; use its pinned compatible Python/PyTorch dependencies.
2. Obtain the authors' `39.pt` from their original README and keep the checkpoint out of the web repo. Never deserialize untrusted PyTorch checkpoints.
3. Feed a genuine stereo, 44,100-Hz short WAV to the original code and request `car_horn` or `siren` using the official 20-element target label vector. Do not silently duplicate mono into fake binaural.
4. Export resulting audio to WAV. Upload **both original and processed audio** to existing AI Test Mode, with the same original recording group ID. Use independently verified ground-truth labels and disjoint original recording groups for validation/test splits.
5. Compare precision, recall, F1, false positives and elapsed time for original-versus-processed audio; do not assume preprocessing improves detection.

## PAWS feasibility gate

Before adapting its classifiers, establish the exact front-end feature calculation and model serialization, and verify whether the present iOS browser microphone can reproduce the required signals. Ordinary Bluetooth mono mic capture **does not** reproduce the research PAWS hardware or support validated localization.

## Status / limitations

* Inspected model architecture, labels, config and PAWS front-end README / Android feature code.
* Implemented and locally tested a stand-alone trial adapter (available as a downloadable prototype in the development conversation); four small tests passed, with synthetic stereo preflight and mono rejection. **The model checkpoint has not been downloaded or executed**, so there are no real extraction outputs or accuracy measurements.
* No production file changes, no deployed site change. Do not claim this is a safety device or validated hearing enhancement.

This document is for review before any production integration.
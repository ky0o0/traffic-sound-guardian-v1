# Semantic Hearing real recorded-audio pilot

Recovery of PR #14 on independent branch `research/sh-real-audio-recovery-20261030`, starting exactly at `52cef75d31bd17d82bbfca68ea2b7d3b921a5a01`. See `recovery_audit.json`. No main changes or deployment. The original experiment adapter is extended with timings and an optional unclipped float-WAV output; the upstream neural network is unchanged.

## Reproduce

Python 3.10, CPU; approximately 250 MB working audio files. `dependency-lock.txt` records the actual compatible environment including `setuptools==69.5.1` (older torchmetrics needs pkg_resources).

```sh
python -m pip install -r research/semantic_hearing/dependency-lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
git clone https://github.com/vb000/SemanticHearing.git /tmp/SemanticHearing
git -C /tmp/SemanticHearing checkout 07e9786c7a741f0a7c722dcde66a2679ca068c50
python -m unittest discover -s research/semantic_hearing -p 'test_*.py' -v
python -u research/semantic_hearing/real_audio.py --semantic-repo /tmp/SemanticHearing --checkpoint /tmp/39.pt --output /tmp/sh-real-audio
```

Use a fresh output directory for each attempt. Files are hash verified, model outputs are checked for finite values and exact stereo length, each case is saved immediately, and failures do not erase earlier results. No downloaded checkpoint is committed. `--prepare-only` prepares inputs without inference; `--limit 1` is a smaller execution check, **not** the full study.

## Audio and design

`real_sources.json` contains canonical public source pages, direct lossless BWF/WAV URLs, CC0 license evidence, authors, original formats, SHA-256 hashes, source labels and exact crop offsets. All accepted files have two differing recorded channels; no mono duplication, generated tones, or synthetic spatialization. Stereo/ORTF is **not** equivalent to microphones at human ears. Source labels come from publishers; no independent human frame-level annotations have been collected.

Six accepted recordings: two isolated car-horn recordings (0258, 0260), two natural siren scenes (2731, 2760), and two rain/thunder backgrounds (0124, 2717). Candidate 0886 is excluded despite its publisher's stereo label: its channels are nearly identical. Two sound-library horn files share an author and may be related; source IDs do not prove independent recording sessions. These are convenience samples from a public sound library, not a standard random test set; pretraining overlap is unknown.

36 inference cases, determined before model output inspection:
- 24 controlled additive mixes: four target recordings × two backgrounds × -5/0/+5 dB **whole-clip component** SNR.
- Four originals with their intended label.
- Four originals with the other label (descriptive controls; natural scenes may contain co-occurring sources).
- Four rain/background controls (two labels each).

All inputs are five seconds at 44.1 kHz. Source offsets are fixed in the manifest. Short horns are zero-padded on the right; they are not repeated. Both channels use identical gain and resampling parameters. `scipy.signal.resample_poly` converts 48 kHz to 44.1 kHz; it does not recover frequencies or spatial cues absent from the source. Each mixture is scaled jointly to peak 0.8, with exactly the same scaling applied to its target and background stems. SNR is whole-clip RMS, **not event-active SNR**, especially important for the 0.494 s horn. Original/control clips are peak-scaled to 0.8.

## Metrics and valid claims

SI-SDR uses zero-mean signals, fixed sample alignment, independent left/right projection, and the mean channel score. SI-SDR improvement is output minus input for the same reference. No post-hoc time alignment, gain fitting beyond the SI-SDR definition, or metric-driven crop selection. Gain-sensitive output SNR and output/reference energy are also reported because SI-SDR can hide severe attenuation.

- `isolated_recording_metrics`: the 12 horn mixes use the exact isolated recorded horn component as reference. These measure recovery of that recording including any inherent recording noise; the source is not certified anechoic or perfectly clean.
- `contaminated_stem_diagnostics`: the 12 siren mixes use an entire natural siren **scene** as the known added component. It contains engine/voices/other ambience. These numbers measure component-waveform fidelity only. They **cannot prove clean siren extraction**, and are never pooled with horn separation quality.
- Original scenes and controls have **no synchronized clean target**, so reference metrics are null. Output/input energy is descriptive only; reduced energy is not detection accuracy, target preservation, or successful noise separation. No Precision/Recall/F1, no safety or real-device efficacy claim.

Inference time measures only CPU model forward; process wall time additionally includes imports/loading/I/O. Two CPU threads are fixed. RTF = inference seconds / five-second input. Full offline forward is not streaming latency, mobile performance, Bluetooth latency, or the paper's smartphone benchmark.

## Saved evidence

Each run saves `plan.json`, `source_inventory.json`, `environment.json`, `results.json`, `run_summary.json`, and `wav_manifest.json`. Per case: input, reference and added-noise WAV where applicable, output float WAV, inference metadata and process/error logs. A SHA-256/size/format manifest covers **every WAV**, including full original downloads.

The GitHub workflow `SH real recorded audio` executes the entire experiment and uploads the complete run directory as an Actions artifact for 90 days. The repository stores compact result/evidence files, not hundreds of MB of redundant WAVs. After artifact expiry, obtain the legal CC0 sources through the manifest and reproduce using the exact pinned code/environment. Bitwise output may vary across CPU/library builds; source hashes are strict, and numerical metrics should be compared with tolerance.

## Primary sources

- [Official code and author checkpoint instructions](https://github.com/vb000/SemanticHearing/tree/07e9786c7a741f0a7c722dcde66a2679ca068c50)
- [Semantic Hearing paper](https://doi.org/10.1145/3586183.3606779)
- [SI-SDR definition and evaluation cautions](https://arxiv.org/abs/1811.02508)
- [BigSoundBank licensing](https://bigsoundbank.com/licenses.html); individual evidence in `real_sources.json`.

See `REAL_AUDIO_REPORT.md` for completed results and the precise verification boundary.

Verification note: FLOAT WAV PEAK chunks contain write-time timestamps. The two completed runs had exactly equal decoded input samples but different container-byte hashes. The checked-in evidence includes decoded little-endian float32 sample hashes and measured cross-run output tolerances.

#!/usr/bin/env python3
"""Offline experiment: official Semantic Hearing extraction. NOT website/realtime code."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys
import time

LABELS = ("alarm_clock","baby_cry","birds_chirping","cat","car_horn",
          "cock_a_doodle_doo","cricket","computer_typing","dog","glass_breaking",
          "gunshot","hammer","music","ocean","door_knock","singing",
          "siren","speech","thunderstorm","toilet_flush")
TARGETS = ("car_horn", "siren")
# Official author-hosted 39.pt, verified on GitHub Actions 2026-10-29.
OFFICIAL_CHECKPOINT_SHA256 = "f0328655691378a65516ec08add170bcf474ba41bb2d475af7a7c63bf2478a21"

def label_vector(target):
    if target not in TARGETS:
        raise ValueError("Only car_horn and siren are supported by this experiment")
    return [float(label == target) for label in LABELS]

def inspect_audio(path):
    import soundfile as sf
    info = sf.info(str(path))
    if info.channels != 2 or info.samplerate != 44100:
        raise ValueError("Requires genuine stereo 44,100-Hz audio; mono duplication is not validated")
    if not 0.975 <= info.duration <= 10.0:
        raise ValueError("Use a 0.975–10 s file for this experiment")
    return info

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def run(args):
    if not args.group_id.strip():
        raise ValueError("A nonempty original recording group ID is required")
    if args.input.resolve() == args.output.resolve():
        raise ValueError("Refusing to replace original recording")
    if args.output.exists() and not args.overwrite:
        raise FileExistsError("Output exists; pass --overwrite to replace")
    config = json.loads((args.semantic_repo / "experiments/dc_waveformer/config.json").read_text())
    if config["model"] != "src.training.dcc_tf_binaural" or config["model_params"]["label_len"] != len(LABELS):
        raise ValueError("Unexpected upstream model configuration")
    if not args.checkpoint.is_file():
        raise FileNotFoundError(args.checkpoint)
    info = inspect_audio(args.input)
    checkpoint_hash = sha256(args.checkpoint)
    if checkpoint_hash != OFFICIAL_CHECKPOINT_SHA256:
        raise ValueError("Checkpoint SHA-256 differs from the verified upstream 39.pt; refusing to deserialize")
    record = dict(status="preflight_only" if args.dry_run else "processed",
                  source_file=args.input.name, source_sha256=sha256(args.input),
                  output_file=args.output.name, target=args.target,
                  group_id=args.group_id, duration=info.duration,
                  checkpoint_sha256=checkpoint_hash,
                  checkpoint=args.checkpoint.name,
                  stereo_only=True, realtime=False)
    if not args.dry_run:
        load_started = time.perf_counter()
        import numpy as np
        import soundfile as sf
        import torch
        # Only load checkpoints obtained from the official, trusted research authors.
        sys.path.insert(0, str(args.semantic_repo.resolve()))
        # Upstream's *evaluation-only* metrics import matplotlib and
        # pyroomacoustics even when we only call Net.forward(). Those
        # modules are NOT involved in the neural-network inference path.
        # Install strict fail-closed placeholders for the two unused
        # evaluation functions; original model classes/weights stay intact.
        import types
        if "src.helpers.eval_utils" not in sys.modules:
            eval_stub = types.ModuleType("src.helpers.eval_utils")
            def _no_evaluation_metrics(*_args, **_kwargs):
                raise RuntimeError("Evaluation-only ITD/ILD functions are not available in the extraction adapter")
            eval_stub.itd_diff = _no_evaluation_metrics
            eval_stub.ild_diff = _no_evaluation_metrics
            sys.modules["src.helpers.eval_utils"] = eval_stub
        module = importlib.import_module(config["model"])
        model = module.Net(**config["model_params"])
        state = torch.load(str(args.checkpoint), map_location="cpu")
        model.load_state_dict(state["model_state_dict"], strict=True)
        model.eval()
        record["model_setup_seconds"] = time.perf_counter() - load_started
        audio, rate = sf.read(str(args.input), dtype="float32", always_2d=True)
        if rate != 44100 or audio.shape[1] != 2:
            raise ValueError("Unexpected audio format change")
        mixture = torch.from_numpy(np.ascontiguousarray(audio.T)).unsqueeze(0)
        target = torch.tensor([label_vector(args.target)], dtype=torch.float32)
        with torch.inference_mode():
            inference_started = time.perf_counter()
            result = model({"mixture": mixture, "label_vector": target})["x"]
            record["inference_seconds"] = time.perf_counter() - inference_started
        extracted = result.squeeze(0).cpu().numpy().T
        if extracted.ndim != 2 or extracted.shape[1] != 2 or abs(len(extracted)-len(audio)) > 64:
            raise RuntimeError("Unexpected output shape/duration")
        extracted = extracted[:len(audio)]
        if len(extracted) != len(audio) or not np.isfinite(extracted).all():
            raise RuntimeError("Misaligned or invalid model output")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        record["output_peak"] = float(np.max(np.abs(extracted)))
        record["output_out_of_range_samples"] = int(np.sum(np.abs(extracted) > 1))
        float_output = getattr(args, "float_output", False)
        sf.write(str(args.output), extracted if float_output else np.clip(extracted, -1, 1),
                 rate, subtype="FLOAT" if float_output else "PCM_16")
        record["output_subtype"] = "FLOAT" if float_output else "PCM_16"
        record["output_sha256"] = sha256(args.output)
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps(record, indent=2) + "\n")
    return record

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--semantic-repo", required=True, type=Path)
    p.add_argument("--checkpoint", required=True, type=Path)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--target", required=True, choices=TARGETS)
    p.add_argument("--group-id", required=True)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--overwrite", action="store_true")
    p.add_argument("--float-output", action="store_true", help="Save unclipped float WAV for numerical research")
    args = p.parse_args()
    print(json.dumps(run(args), indent=2))

if __name__ == "__main__":
    main()

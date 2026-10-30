#!/usr/bin/env python3
"""Round 4: empirical multi-target SH gate with pinned real WAV source material.

No classifier claims: these experiments assess conditioned extraction, NOT
unsupervised sound recognition, detection accuracy, or headphone playback.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import resource
import sys
import time

import numpy as np
import soundfile as sf
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from extract import LABELS
from round3.data import components, pcm_hash, write_json
from round3.model_io import load_model, offline, UPSTREAM
from round3.streaming import run_stream

RATE = 44100
BLOCK = 416
KINDS = ("none", "horn", "siren", "overlap", "horn_then_siren", "siren_then_horn")
TARGETS = ("car_horn", "siren", "car_horn+siren")
DURATION_S = 7.0


def label_for(names):
    """The official trained network has a 20-dim condition; multi-hot is unvalidated."""
    if not names or not set(names) <= {"car_horn", "siren"}:
        raise ValueError("Expected one or both known target classes")
    return torch.tensor([[float(k in names) for k in LABELS]], dtype=torch.float32)


def make_case(kind, background, horn_recording, siren_recording, horn_source):
    n = int(DURATION_S * RATE)
    # Genuine archived background, repeated to cover 7 s. The join is an artificial seam.
    stem = background[:220480].astype("float64")
    bg = np.tile(stem, (int(np.ceil(n / len(stem))), 1))[:n].copy()
    bg *= 0.16 / max(float(np.max(np.abs(bg))), 1e-10)
    horn = np.zeros((n, 2), dtype="float64")
    siren = np.zeros((n, 2), dtype="float64")
    events = []
    layout = {
        "none": [],
        "horn": [("car_horn", 2.0)],
        "siren": [("siren", 2.0)],
        "overlap": [("siren", 1.80), ("car_horn", 2.15)],
        "horn_then_siren": [("car_horn", 1.85), ("siren", 3.0)],
        "siren_then_horn": [("siren", 1.55), ("car_horn", 4.12)],
    }[kind]
    for name, second in layout:
        rec = horn_recording if name == "car_horn" else siren_recording
        rec = np.asarray(rec, dtype="float64")
        rec *= 0.25 / max(float(np.max(np.abs(rec))), 1e-10)
        start = int(round(second * RATE))
        stop = start + len(rec)
        if stop > n:
            raise ValueError("Target outside mixture")
        ref = horn if name == "car_horn" else siren
        ref[start:stop] += rec
        events.append(dict(label=name, start_sample=start, end_sample=stop,
                           source_id=horn_source if name == "car_horn" else "iusb_014"))
    mix = bg + horn + siren
    # One gain for all components, preserving exact relative mixing strengths.
    common_gain = min(1.0, 0.85 / max(float(np.max(np.abs(mix))), 1e-10))
    for a in (mix, bg, horn, siren):
        a *= common_gain
    return tuple(np.asarray(a, dtype="float32") for a in (mix, bg, horn, siren)), events, common_gain


def si_sdr(ref, estimate):
    t = np.asarray(ref, dtype="float64").ravel()
    e = np.asarray(estimate, dtype="float64").ravel()
    t -= np.mean(t)
    e -= np.mean(e)
    energy = float(np.dot(t, t))
    if energy < 1e-14:
        return None
    a = float(np.dot(t, e)) / energy
    projected = a * t
    residual = e - projected
    return float(10 * np.log10((np.dot(projected, projected) + 1e-20) /
                                (np.dot(residual, residual) + 1e-20)))


def joint_gains(horn, siren, background, observed, lo, hi):
    """Joint linear projection: separate target coefficients even when events overlap.

    This is an amplitude proxy, NOT an isolated perceptual intelligibility score.
    """
    refs = [horn, siren, background]
    names = ["horn", "siren", "background"]
    basis = []
    included = []
    for name, source in zip(names, refs):
        v = source[lo:hi].astype("float64").ravel()
        v -= np.mean(v)
        if np.linalg.norm(v) > 1e-8:
            basis.append(v)
            included.append(name)
    y = observed[lo:hi].astype("float64").ravel()
    y -= np.mean(y)
    if not basis:
        return {}
    mat = np.stack(basis, axis=1)
    coefs, *_ = np.linalg.lstsq(mat, y, rcond=None)
    return {name: dict(coefficient=float(v),
                       signed_gain_db=float(20*np.log10(max(abs(float(v)), 1e-12))),
                       phase_inverted=bool(v < 0))
            for name, v in zip(included, coefs)}


def assess(case, samples, events, output):
    mix, bg, horn, siren = samples
    target = horn.astype("float64") + siren.astype("float64")
    input_si = si_sdr(target, mix)
    output_si = si_sdr(target, output)
    rms = lambda x: float(np.sqrt(np.mean(np.square(x.astype("float64")))))
    total = dict(input_si_sdr_db=input_si, output_si_sdr_db=output_si,
                 si_sdri_db=(output_si - input_si) if input_si is not None and output_si is not None else None,
                 output_peak=float(np.max(np.abs(output))),
                 output_rms=rms(output),
                 output_to_input_rms_db=float(20*np.log10(max(rms(output), 1e-12)/max(rms(mix), 1e-12))),
                 whole_recording_joint_gains=joint_gains(horn, siren, bg, output, 0, len(mix)))
    event_results = []
    for e in events:
        lo = e["start_sample"]
        hi = min(len(mix), e["end_sample"] + round(0.1*RATE))
        early = min(e["end_sample"], lo + round(0.1*RATE))
        event_results.append(dict(label=e["label"], start_seconds=lo/RATE,
                                  duration_seconds=(e["end_sample"]-lo)/RATE,
                                  complete_window_joint_gains=joint_gains(horn, siren, bg, output, lo, hi),
                                  first100ms_joint_gains=joint_gains(horn, siren, bg, output, lo, early)))
    total["events"] = event_results
    if not events:
        total["no_target_background_rms_db_relative_to_input"] = total["output_to_input_rms_db"]
    return total


def run_one(model, sample, label):
    started = time.perf_counter()
    y, details = run_stream(model, label, sample, packet_samples=416)
    elapsed = time.perf_counter() - started
    traces = [x for x in details["traces"] if not x["eof"]]
    durations = np.array([x["step_seconds"] for x in traces])
    return y, dict(wall_seconds=elapsed, rtf=elapsed/(len(sample)/RATE),
                   forward_calls=len(details["traces"]),
                   median_step_ms=float(1000*np.median(durations)),
                   p95_step_ms=float(1000*np.quantile(durations, .95)),
                   p99_step_ms=float(1000*np.quantile(durations, .99)),
                   max_step_ms=float(1000*np.max(durations)),
                   exceeded_audio_block=int(np.sum(durations>BLOCK/RATE)),
                   state_bytes=details["neural_state_bytes"],
                   startup_wait_ms=1000*(BLOCK+32)/RATE)


def load_inputs(config):
    # Exact same verified R3 source archive, with every SHA checked by components().
    targets, noises, critical, inventory = components(config)
    return targets, noises, critical, inventory


def write_wav(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    if samples.ndim != 2 or samples.shape[1] != 2 or not np.isfinite(samples).all():
        raise ValueError("Invalid floating-point stereo output")
    sf.write(str(path), samples, RATE, subtype="FLOAT")


def evaluate(model, kind, noise_id, horn_id, targets, noises, dest):
    (mix, bg, horn, siren), events, common_gain = make_case(
        kind, noises[noise_id], targets[horn_id], targets["iusb_014"], horn_id)
    inputs_dir = dest/"inputs"
    for name, arr in (("mixture",mix),("background",bg),
                      ("car_horn_reference",horn),("siren_reference",siren)):
        write_wav(inputs_dir/(name+".wav"), arr)
    output = {}
    timings = {}
    for name, labels in (("car_horn",("car_horn",)),("siren",("siren",)),
                         ("multi_hot",("car_horn","siren"))):
        y, timing = run_one(model, mix, label_for(labels))
        output[name] = y
        timings[name] = timing
        write_wav(dest/(name+".wav"), y)
    raw = output["car_horn"].astype("float64") + output["siren"].astype("float64")
    output["dual_raw"] = raw.astype("float32")
    peak = float(np.max(np.abs(raw)))
    safe_gain = min(1.0, 0.95/max(peak,1e-10))
    output["dual_safe"] = (raw * safe_gain).astype("float32")
    for name in ("dual_raw", "dual_safe"):
        write_wav(dest/(name+".wav"), output[name])
    results = {name:assess(kind,(mix,bg,horn,siren),events,y) for name,y in output.items()}
    results["unprocessed_mixture"] = assess(kind,(mix,bg,horn,siren),events,mix)
    # Not measured wall-clock hardware parallelism: two actual independent serial calls.
    timings["dual_sequential_total_s"] = timings["car_horn"]["wall_seconds"] + timings["siren"]["wall_seconds"]
    timings["dual_parallel_ideal_lower_bound_s"] = max(timings["car_horn"]["wall_seconds"], timings["siren"]["wall_seconds"])
    info = dict(id=dest.name, kind=kind, background=noise_id, horn_source=horn_id,
                sample_rate=RATE, samples=len(mix), events=events,
                input_pcm_sha256=pcm_hash(mix), horn_ref_pcm_sha256=pcm_hash(horn),
                siren_ref_pcm_sha256=pcm_hash(siren),
                common_gain=common_gain, dual_raw_peak=peak, dual_safe_gain=safe_gain,
                timings=timings, evaluations=results)
    write_json(dest/"result.json",info)
    return info


def initial_equivalence(model, x):
    # A multi-hot condition accepted by the public API is not proof of extraction.
    label = label_for(("car_horn","siren"))
    a = offline(model, label, x)
    b, _ = run_one(model,x,label)
    diff = float(np.max(np.abs(a-b)))
    return dict(accepted=True, finite=bool(np.isfinite(a).all() and np.isfinite(b).all()),
                stream_offline_max_abs_sample_difference=diff,
                numerical_equivalence=diff<5e-5, input_samples=len(x))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--semantic-repo",type=Path,required=True)
    p.add_argument("--checkpoint",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--phase",choices=("gate","study"),default="gate")
    args = p.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    config = json.loads((HERE.parent/"round3/config.json").read_text())
    assert config["upstream_commit"] == UPSTREAM
    targets,noises,critical,inventory = load_inputs(config)
    write_json(args.output/"source_inventory.json",inventory)
    model,model_meta=load_model(args.semantic_repo,args.checkpoint)
    # Exactly same model object and official SHA-verified checkpoint for all conditions.
    note=dict(model=model_meta, official_commit=UPSTREAM, phase=args.phase,
              system=dict(python=sys.version,platform=platform.platform(),
                          torch=torch.__version__,numpy=np.__version__,
                          cpu=platform.processor(),threads=torch.get_num_threads()),
              limits="No autonomous classification, unknown sound classes, real microphone or headphone measurement. Multi-hot not known to be trained.")
    write_json(args.output/"environment.json",note)
    # Check on genuine audio (including both real source recordings), with ample history.
    prototype,_events,_gain = make_case("overlap",noises["bsb_0124"],
                                       targets["bsb_0260"],targets["iusb_014"],"bsb_0260")
    preflight=initial_equivalence(model,prototype[0][:round(3.4*RATE)])
    write_json(args.output/"preflight.json",preflight)
    if not (preflight["finite"] and preflight["numerical_equivalence"]):
        raise RuntimeError("Multi-hot stateful/whole-file numerical equivalence gate FAILED")
    if args.phase=="gate":
        cases=[("horn","bsb_0124","bsb_0260"),("siren","bsb_0124","bsb_0260"),
               ("overlap","bsb_0124","bsb_0260"),("none","bsb_0124","bsb_0260")]
    else:
        cases=[(k,bg, "bsb_0257" if bg=="iusb_road_00" else "bsb_0260")
               for bg in ("bsb_0124","iusb_road_00") for k in KINDS]
    output=[]
    for i,(kind,bg,horn_id) in enumerate(cases):
        cid=f"{i:02d}_{kind}_{bg}"
        t0=time.perf_counter()
        item=evaluate(model,kind,bg,horn_id,targets,noises,args.output/"cases"/cid)
        output.append(item)
        print(json.dumps(dict(case=cid,quality=dict(
            multi=item["evaluations"]["multi_hot"]["si_sdri_db"],
            dual=item["evaluations"]["dual_safe"]["si_sdri_db"],
            horn_only=item["evaluations"]["car_horn"]["si_sdri_db"],
            siren_only=item["evaluations"]["siren"]["si_sdri_db"]),
            rtf=item["timings"]["multi_hot"]["rtf"],elapsed_seconds=time.perf_counter()-t0),
            allow_nan=False),flush=True)
    write_json(args.output/"results.json",output)
    write_json(args.output/"summary.json",dict(phase=args.phase,cases=len(output),
        unique_original_sources=5,independent_scenes_not_established=True,
        pretrained_real_inferences=len(output)*3+2,
        rows=[dict(id=r["id"],kind=r["kind"],
                   rtf_multihot=r["timings"]["multi_hot"]["rtf"],
                   rtf_dual_serial=(r["timings"]["dual_sequential_total_s"]/DURATION_S),
                   multihot_si_sdri=r["evaluations"]["multi_hot"]["si_sdri_db"],
                   dual_safe_si_sdri=r["evaluations"]["dual_safe"]["si_sdri_db"],
                   multi_output_rms=r["evaluations"]["multi_hot"]["output_rms"]) for r in output],
        notice="SI-SDR quality only on known-signal mixture; null for no-target. No detector sensitivity/specificity or real device latency measured."))
    print("COMPLETED",args.phase,len(output),"actual 39.pt multi-target conditioned extraction trials",flush=True)


if __name__ == "__main__":
    main()

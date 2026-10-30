#!/usr/bin/env python3
"""Reproducible SH-only recorded-audio pilot; no classifier or website integration."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback
import urllib.request
from datetime import datetime, timezone

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from extract import OFFICIAL_CHECKPOINT_SHA256, sha256

UPSTREAM = '07e9786c7a741f0a7c722dcde66a2679ca068c50'
RATE = 44100
N = 5 * RATE
HERE = Path(__file__).resolve().parent


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    temp.replace(path)


def power(x):
    return float(np.mean(np.asarray(x, dtype=np.float64) ** 2))


def db_ratio(a, b):
    if b <= 0:
        return None
    return float(10 * np.log10(max(a, 1e-30) / b))


def si_sdr(reference, estimate):
    """Zero-mean, fixed alignment, separate channels; no best-lag search."""
    s = np.asarray(reference, dtype=np.float64)
    y = np.asarray(estimate, dtype=np.float64)
    if s.shape != y.shape or s.ndim != 2 or not np.isfinite(y).all():
        raise ValueError('Invalid metric shape or nonfinite output')
    s = s - s.mean(axis=0, keepdims=True)
    y = y - y.mean(axis=0, keepdims=True)
    den = np.sum(s*s, axis=0)
    if np.any(den <= 1e-20):
        raise ValueError('SI-SDR undefined for silent reference channel')
    projection = s * (np.sum(y*s, axis=0) / den)
    signal = np.sum(projection**2, axis=0)
    error = np.sum((y-projection)**2, axis=0)
    values = 10*np.log10(np.maximum(signal, 1e-30)/np.maximum(error, 1e-30))
    return [float(v) for v in values]


def reference_metrics(reference, mixture, output):
    a, b = si_sdr(reference, mixture), si_sdr(reference, output)
    return dict(input_si_sdr_db=a, output_si_sdr_db=b,
                si_sdri_db=float(np.mean(b)-np.mean(a)),
                output_snr_db=db_ratio(power(reference), power(output-reference)),
                output_to_reference_energy_db=db_ratio(power(output), power(reference)))


def mix_at_snr(target, noise, snr_db):
    if power(target) <= 0 or power(noise) <= 0:
        raise ValueError('Silent mixture component')
    noise_gain = math.sqrt(power(target)/(power(noise)*10**(snr_db/10)))
    t, n = target.copy(), noise * noise_gain
    common_gain = 0.8 / max(float(np.max(np.abs(t+n))), 1e-10)
    return ((t+n)*common_gain).astype('float32'), (t*common_gain).astype('float32'), (n*common_gain).astype('float32'), noise_gain, common_gain


def fetch_verified(url, destination, expected_hash):
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=120) as response:
                    data = response.read()
                if hashlib.sha256(data).hexdigest() != expected_hash:
                    raise ValueError('Downloaded checksum mismatch: ' + url)
                destination.write_bytes(data)
                break
            except Exception:
                if attempt == 2:
                    raise
    if sha256(destination) != expected_hash:
        raise ValueError('Cached checksum mismatch: ' + str(destination))


def prepare(root, manifest):
    clips = {}
    inventory = []
    for source in manifest['sources']:
        if not source['accepted']:
            continue
        path = root / 'originals' / (source['id'] + '.wav')
        fetch_verified(source['download_url'], path, source['sha256'])
        info = sf.info(path)
        x, sr = sf.read(path, always_2d=True, dtype='float32')
        if x.shape[1] != 2:
            raise ValueError('Nonstereo source: ' + source['id'])
        correlation = float(np.corrcoef(x.T)[0, 1])
        relative_difference = power(x[:, 0]-x[:, 1])/power(x)
        if relative_difference < 1e-6:
            raise ValueError('Near-dual-mono source: ' + source['id'])
        # Preserve both recorded channels; no artificial spatialization or duplication.
        if sr != RATE:
            divisor = math.gcd(sr, RATE)
            x = resample_poly(x, RATE//divisor, sr//divisor, axis=0).astype('float32')
        start = round(source['excerpt_start_seconds']*RATE)
        clip = x[start:start+N]
        padding = N-len(clip)
        if padding:
            clip = np.pad(clip, ((0,padding),(0,0)))
        if power(clip) == 0:
            raise ValueError('Silent excerpt')
        clips[source['id']] = clip
        row = dict(source, actual_sample_rate=sr, actual_channels=info.channels,
                   actual_frames=info.frames, actual_subtype=info.subtype,
                   lr_correlation=correlation, relative_difference_power=relative_difference,
                   output_rate=RATE, excerpt_samples=N, right_zero_padding_samples=padding)
        inventory.append(row)
        path = root/'excerpts'/(source['id']+'.wav')
        path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(path, clip, RATE, subtype='FLOAT')
    write_json(root/'source_inventory.json', inventory)
    return clips


def make_plan(root, manifest, clips):
    cases=[]
    sources={s['id']:s for s in manifest['sources']}
    targets=[s for s in manifest['sources'] if s['accepted'] and s['target']]
    backgrounds=[s for s in manifest['sources'] if s['accepted'] and not s['target']]
    def save_case(name, target, x, kind, source_ids, ref=None, noise=None, **extra):
        folder=root/'cases'/name
        folder.mkdir(parents=True,exist_ok=True)
        sf.write(folder/'input.wav', x, RATE, subtype='FLOAT')
        if ref is not None:
            sf.write(folder/'reference.wav', ref, RATE, subtype='FLOAT')
        if noise is not None:
            sf.write(folder/'added_noise.wav', noise, RATE, subtype='FLOAT')
        cases.append(dict(id=name,target=target,kind=kind,source_ids=source_ids,
                          duration_seconds=5,has_reference=ref is not None,**extra))
    for source in targets:
        sid=source['id']; x=clips[sid]
        gain=0.8/max(float(np.max(np.abs(x))),1e-10)
        save_case(sid+'_original', source['target'],x*gain,'recorded_scene', [sid], input_gain=gain)
        other='siren' if source['target']=='car_horn' else 'car_horn'
        save_case(sid+'_other_label',other,x*gain,'other_label_control',[sid],input_gain=gain)
        for bg in backgrounds:
            for snr in (-5,0,5):
                mix,ref,noise,ng,cg=mix_at_snr(x,clips[bg['id']],snr)
                save_case(f'{sid}_{bg["id"]}_snr{snr:+d}',source['target'],mix,
                          'controlled_mix',[sid,bg['id']],ref,noise,
                          reference_kind=source['reference_kind'],
                          nominal_snr_db=snr,noise_gain=ng,common_gain=cg,
                          measured_snr_db=db_ratio(power(ref),power(noise)))
    for bg in backgrounds:
        x=clips[bg['id']];gain=0.8/float(np.max(np.abs(x)))
        for target in ('car_horn','siren'):
            save_case(bg['id']+'_'+target,target,x*gain,'background_control',[bg['id']],input_gain=gain)
    write_json(root/'plan.json',cases)
    return cases


def inventory_files(root):
    rows=[]
    for p in sorted(root.rglob('*.wav')):
        info=sf.info(p)
        rows.append(dict(path=str(p.relative_to(root)),bytes=p.stat().st_size,
                         sha256=sha256(p),rate=info.samplerate,channels=info.channels,
                         frames=info.frames,subtype=info.subtype))
    write_json(root/'wav_manifest.json',rows)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--semantic-repo',required=True,type=Path)
    parser.add_argument('--checkpoint',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--prepare-only',action='store_true')
    parser.add_argument('--limit',type=int)
    args=parser.parse_args()
    root=args.output.resolve();root.mkdir(parents=True,exist_ok=True)
    if (root/'results.json').exists():
        raise FileExistsError('Use a fresh output directory; previous results are never silently replaced')
    source_manifest=json.loads((HERE/'real_sources.json').read_text())
    started=time.perf_counter()
    revision=subprocess.check_output(['git','-C',str(args.semantic_repo),'rev-parse','HEAD'],text=True).strip()
    if revision != UPSTREAM:
        raise ValueError('Upstream revision mismatch')
    fetch_verified('https://semantichearing.cs.washington.edu/39.pt',args.checkpoint,OFFICIAL_CHECKPOINT_SHA256)
    clips=prepare(root,source_manifest)
    cases=make_plan(root,source_manifest,clips)
    if args.limit is not None:
        cases=cases[:args.limit]
    env=os.environ.copy();env.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',OPENBLAS_NUM_THREADS='2')
    environment=dict(date_utc=datetime.now(timezone.utc).isoformat(),python=sys.version,
                     platform=platform.platform(),processor=platform.processor(),logical_cpu_count=os.cpu_count(),
                     torch_threads=2,upstream_revision=revision,checkpoint_sha256=sha256(args.checkpoint),
                     source_manifest_sha256=sha256(HERE/'real_sources.json'),
                     runner_sha256=sha256(Path(__file__)),adapter_sha256=sha256(HERE/'extract.py'),
                     package_freeze=subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True)
                     if __import__('importlib.util').util.find_spec('pip') else 'See dependency-lock.txt',
                     cpu_info=Path('/proc/cpuinfo').read_text().split('\n\n')[0] if Path('/proc/cpuinfo').exists() else None)
    write_json(root/'environment.json',environment)
    if args.prepare_only:
        inventory_files(root);return
    results=[]
    for case in cases:
        folder=root/'cases'/case['id'];t0=time.perf_counter();row=dict(case,status='failed')
        command=[sys.executable,str(HERE/'extract.py'),'--semantic-repo',str(args.semantic_repo.resolve()),
                 '--checkpoint',str(args.checkpoint.resolve()),'--input',str(folder/'input.wav'),
                 '--output',str(folder/'output.wav'),'--target',case['target'],'--group-id',case['source_ids'][0],
                 '--manifest',str(folder/'inference.json'),'--float-output']
        try:
            proc=subprocess.run(command,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
            (folder/'process.log').write_text(proc.stdout)
            if proc.returncode:
                raise RuntimeError('Inference exit code '+str(proc.returncode))
            inference=json.loads((folder/'inference.json').read_text())
            x,sr=sf.read(folder/'input.wav',always_2d=True);y,yr=sf.read(folder/'output.wav',always_2d=True)
            if x.shape != y.shape or sr != RATE or yr != RATE or not np.isfinite(y).all():
                raise ValueError('Output contract failed')
            row.update(status='processed',inference=inference,
                       rtf=inference['inference_seconds']/5,
                       output_to_input_energy_db=db_ratio(power(y),power(x)),
                       energy_interpretation='Descriptive level change only; not accuracy or target preservation')
            if case['has_reference']:
                ref,_=sf.read(folder/'reference.wav',always_2d=True)
                metrics=reference_metrics(ref,x,y)
                # A natural siren scene contains other sources. Never promote this
                # known-component fidelity diagnostic to clean-siren separation quality.
                key='isolated_recording_metrics' if case['reference_kind']=='isolated_recording' else 'contaminated_stem_diagnostics'
                row[key]=metrics
                row['clean_siren_quality_validated']=False
            else:
                row['reference_metrics']=None
                row['no_reference_reason']='No synchronized clean target stem; no SI-SDR or accuracy claim'
        except Exception as exc:
            row['error']=str(exc);(folder/'error.log').write_text(traceback.format_exc())
        row['wall_seconds']=time.perf_counter()-t0
        results.append(row)
        write_json(root/'results.json',results)
        print(json.dumps({k:row[k] for k in ('id','status','wall_seconds')},ensure_ascii=False),flush=True)
    inventory_files(root)
    write_json(root/'run_summary.json',dict(planned_cases=len(cases),processed=sum(r['status']=='processed' for r in results),
                                         failed=sum(r['status']=='failed' for r in results),wall_seconds=time.perf_counter()-started))
    if any(r['status']=='failed' for r in results):
        raise SystemExit(1)

if __name__=='__main__':
    main()

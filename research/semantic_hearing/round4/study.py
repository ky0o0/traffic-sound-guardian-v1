#!/usr/bin/env python3
"""Fourth-round fixed-label multi-target SH study. Only ORIGINAL 39.pt inference."""
import hashlib
import io
import json
import math
import os
import platform
import resource
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "round3"))
sys.path.insert(0, str(HERE.parent / "round2"))
sys.path.insert(0, str(HERE.parent))
from data import components, pcm_hash, write_json
from model_io import load_model, offline
from streaming import run_stream
from experiment import active_mask, describe_metrics, noise_gain_for_active_snr
from extract import LABELS, OFFICIAL_CHECKPOINT_SHA256

RATE = 44100
DURATION = 8
SAMPLES = RATE * DURATION
BLOCK = 416
LABELS_TO_TEST = ("car_horn", "siren")
METHODS = ("horn_only", "siren_only", "two_hot", "two_pass_sum")
CASES = (
    ("horn0260_rain", "bsb_0260", None, "bsb_0124", 2.0, None),
    ("siren_road", None, "iusb_014", "iusb_road_00", None, 2.0),
    ("sequential_rain", "bsb_0260", "iusb_014", "bsb_0124", 2.0, 4.2),
    ("overlap_rain", "bsb_0260", "iusb_014", "bsb_0124", 3.0, 2.0),
    ("overlap_road", "bsb_0257", "iusb_014", "iusb_road_00", 3.0, 2.0),
    ("background_road", None, None, "iusb_road_00", None, None),
)

def label_vector(*names):
    if not names or any(x not in LABELS_TO_TEST for x in names) or len(set(names)) != len(names):
        raise ValueError("Target names must be distinct car_horn/siren")
    return torch.tensor([[float(n in names) for n in LABELS]], dtype=torch.float32)

def schedule_sample(s):
    if s is None:
        return None
    n = round(s * RATE / BLOCK) * BLOCK
    if n < 0 or n >= SAMPLES:
        raise ValueError("Invalid event location")
    return n

def event_wave(target, position):
    x = np.zeros((SAMPLES, 2), dtype=np.float32)
    if target is None:
        return x, None
    event = target * (0.22 / max(float(np.max(np.abs(target))), 1e-10))
    start = schedule_sample(position)
    if start + len(event) > len(x):
        raise ValueError("Event exceeds input")
    x[start:start+len(event)] += event
    return x, dict(start_sample=start, end_sample=start+len(event),
                   start_seconds=start/RATE, end_seconds=(start+len(event))/RATE)

def compose(spec, targets, backgrounds):
    name, horn_source, siren_source, background_id, horn_t, siren_t = spec
    horn, horn_event = event_wave(targets[horn_source] if horn_source else None, horn_t)
    siren, siren_event = event_wave(targets[siren_source] if siren_source else None, siren_t)
    noise0 = backgrounds[background_id]
    if noise0.shape != (5*RATE, 2) or not np.isfinite(noise0).all():
        raise ValueError("Expected prior verified five-second stereo background")
    noise = np.tile(noise0, (math.ceil(SAMPLES / len(noise0)), 1))[:SAMPLES].copy()
    target = horn + siren
    if horn_event or siren_event:
        active = active_mask(target)
        noise *= noise_gain_for_active_snr(target, noise, active, 0)
    else:
        noise *= 0.22 / max(float(np.max(np.abs(noise))), 1e-10)
    mix = target + noise
    gain = min(1.0, 0.85 / max(float(np.max(np.abs(mix))), 1e-10))
    mix = (mix * gain).astype(np.float32)
    horn = (horn * gain).astype(np.float32)
    siren = (siren * gain).astype(np.float32)
    noise = (noise * gain).astype(np.float32)
    # Recombination may incur only expected floating-point rounding.
    if not np.allclose(mix, horn+siren+noise, atol=3e-7):
        raise ValueError("Mixing reference alignment failed")
    plan = dict(id=name, horn_source=horn_source, siren_source=siren_source,
                background_id=background_id, horn_event=horn_event, siren_event=siren_event,
                input_hash=pcm_hash(mix), horn_reference_hash=pcm_hash(horn),
                siren_reference_hash=pcm_hash(siren), noise_hash=pcm_hash(noise),
                input_peak=float(np.max(np.abs(mix))), gain=float(gain),
                length_samples=SAMPLES, input_has_background_history_seconds=min(
                    [e['start_seconds'] for e in (horn_event, siren_event) if e] or [DURATION]))
    return dict(input=mix, horn=horn, siren=siren, noise=noise, plan=plan)

def power(x):
    return float(np.mean(np.asarray(x, dtype=np.float64)**2))

def db_ratio(a,b):
    return float(10*np.log10(max(a,1e-30)/max(b,1e-30)))

def compact_quality(ref, mix, y, noise):
    mask=active_mask(ref)
    try:
        score=describe_metrics(ref.astype(np.float64), mix.astype(np.float64),
                               y.astype(np.float64), noise.astype(np.float64), mask)
        return dict(si_sdri_db=score['si_sdri_db'],
                    gain_db=float(np.mean(score['projected_gain_db'])),
                    gain_lr_db=score['projected_gain_db'],
                    output_snr_db=score['output_snr_db'],
                    active_output_snr_db=score['active_output_snr_db'],
                    input_snr_db=score['active_input_snr_db'])
    except (ValueError, ZeroDivisionError, FloatingPointError) as exc:
        return dict(quality_undefined=str(exc))

def event_metrics(scene, y, kind):
    ev=scene['plan'][kind+'_event']
    if ev is None:
        return None
    start=ev['start_sample']
    end=min(SAMPLES,ev['end_sample']+round(0.1*RATE))
    r=scene[kind][start:end]
    x=scene['input'][start:end]
    n=(x-r).astype(np.float32)
    score=compact_quality(r,x,y[start:end],n)
    early_end=min(start+round(.1*RATE),ev['end_sample'])
    early=compact_quality(scene[kind][start:early_end],scene['input'][start:early_end],
                          y[start:early_end],scene['input'][start:early_end]-scene[kind][start:early_end])
    return dict(event=ev, full=score, onset_first_100ms=early)

def aggregate(scene,y):
    ref=scene['horn']+scene['siren']
    if not np.any(ref):
        return None
    start=min(e['start_sample'] for e in (scene['plan']['horn_event'],scene['plan']['siren_event']) if e)
    stop=min(SAMPLES,max(e['end_sample'] for e in (scene['plan']['horn_event'],scene['plan']['siren_event']) if e)+round(.1*RATE))
    return compact_quality(ref[start:stop],scene['input'][start:stop],y[start:stop],scene['noise'][start:stop])

def process(model,scene, output_dir):
    x=scene['input'];out={};rtfs={};times={};signals={}
    for key,keys in (("horn_only",('car_horn',)),("siren_only",('siren',)),("two_hot",('car_horn','siren'))):
        label=label_vector(*keys)
        t=time.perf_counter()
        y,info=run_stream(model,label,x,packet_samples=32)
        elapsed=time.perf_counter()-t
        if y.shape!=x.shape or not np.isfinite(y).all():
            raise RuntimeError("Invalid streaming output")
        forward_rtf=sum(a['forward_seconds'] for a in info['traces'])/DURATION
        run_rtf=info['wall_seconds']/DURATION
        if any(tr['reset_components'] for tr in info['traces']):
            raise RuntimeError("Unexpected neural reset")
        signals[key]=y
        rtfs[key]=dict(forward_rtf=forward_rtf,loop_wall_rtf=run_rtf,
                       wall_seconds=elapsed,
                       neural_state_bytes=info['neural_state_bytes'],
                       first_step_ms=info['traces'][0]['step_seconds']*1000,
                       max_step_ms=max(t['step_seconds']*1000 for t in info['traces'] if not t['eof']))
        print(json.dumps(dict(case=scene['plan']['id'],method=key,rtf=round(run_rtf,3))),flush=True)
    signals['two_pass_sum']=(signals['horn_only']+signals['siren_only']).astype(np.float32)
    rtfs['two_pass_sum']=dict(forward_rtf=rtfs['horn_only']['forward_rtf']+rtfs['siren_only']['forward_rtf'],
                              loop_wall_rtf=rtfs['horn_only']['loop_wall_rtf']+rtfs['siren_only']['loop_wall_rtf'],
                              estimated_sequential_two_pass=True,
                              simultaneous_parallel_not_measured=True,
                              note="Sum of independent outputs with unmodified amplitudes; 2 separate model histories")
    for method,y in signals.items():
        out[method]=dict(horn=event_metrics(scene,y,'horn'),
                         siren=event_metrics(scene,y,'siren'),
                         combined=aggregate(scene,y),
                         output_peak=float(np.max(np.abs(y))),
                         out_of_range_samples=int(np.count_nonzero(np.abs(y)>1)),
                         all_signal_output_rms=float(np.sqrt(power(y))),
                         background_only_ratio_db=db_ratio(power(y),power(x)) if scene['plan']['id']=='background_road' else None)
    folder=output_dir/'wavs'/scene['plan']['id'];folder.mkdir(parents=True,exist_ok=True)
    sf.write(folder/'input.wav',x,RATE,subtype="FLOAT")
    sf.write(folder/'horn_reference.wav',scene['horn'],RATE,subtype="FLOAT")
    sf.write(folder/'siren_reference.wav',scene['siren'],RATE,subtype="FLOAT")
    for key,y in signals.items():
        sf.write(folder/(key+'.wav'),y,RATE,subtype="FLOAT")
    return dict(plan=scene['plan'],methods=out,performance=rtfs)

def quick_proof(model, scene):
    x=scene['input']
    lab=label_vector('car_horn','siren')
    y,info=run_stream(model,lab,x,packet_samples=32)
    batch=offline(model,lab,x)
    difference=float(np.max(np.abs(y-batch)))
    if difference>5e-5:
        raise RuntimeError("Multi-hot stateful/offline output mismatch "+str(difference))
    return dict(multihot_stream_vs_offline_max_abs_difference=difference,
                multihot_is_syntactically_accepted=True,
                correct_neural_history=info['neural_state_bytes'],
                verified_original_weights=True)

def make_listening_zip(root,outdir):
    # Permanent small selection; full six-case WAVs remain as Actions artifact.
    zip_path=outdir/'listening.zip'
    with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        z.writestr('README.txt',"FLOAT 44.1kHz stereo WAV; same unchanged level. "
                   "Original recording stems mixed synthetically; not a blind human listening test.\n")
        for name in ('overlap_rain', 'sequential_rain'):
            d=root/'wavs'/name
            for suffix in ('input','horn_reference','siren_reference','two_hot','two_pass_sum'):
                p=d/(suffix+'.wav')
                z.write(p,arcname=name+'/'+p.name)
    return dict(path=str(zip_path),sha256=hashlib.sha256(zip_path.read_bytes()).hexdigest(),
                bytes=zip_path.stat().st_size)

def fmt(v):
    if v is None:return '—'
    return f"{v:+.2f}"

def build_report(root, results, proof, meta):
    l=[
        "# Semantic Hearing 第四轮：单次多类别提取与双次提取对照",
        "",
        "**实验已真实执行，使用官方预训练39.pt，未训练或修改参数。**",
        "",
        "## 方法与核心问题",
        "",
        "- 官方网络输入为20维one-hot类别向量；本轮额外尝试两个位置设为1（two-hot）。这只是实验性输入，不能自动推断官方训练支持。",
        "- 比较：仅提取car_horn、仅提取siren、一次two-hot推理、两条独立有状态流分别提取再直接相加。",
        "- 所有方法在相同输入上连续逐416采样处理，每个独立推理流保持自己的encoder/decoder/output状态；没有YAMNet、自动分类或目标类别动态切换。",
        "- 从前轮永久保存的、已校验的5段真实录音构造6段8秒双声道混音：单类、先后出现、真正重叠、仅背景；但组合与背景循环是人工构造，不是独立现场录音。",
        "- 每段先有约2秒的真实录音背景，避免前轮最明显的冷启动混杂因素；只测试已在官方标签内的汽车喇叭与警笛，未覆盖自行车铃。",
        "- 全部使用原始振幅FLOAT输出，不为试听单独归一化。预训练门槛核对同一two-hot输入的整段与流式最大采样差。",
        "",
        "## 技术可运行性",
        "",
        f"- 原始预训练权重校验：{meta['checkpoint_sha256']}",
        f"- two-hot 单次连续推理能否运行：{'是' if proof['multihot_is_syntactically_accepted'] else '否'}。",
        f"- two-hot 连续／离线最大逐采样差：{proof['multihot_stream_vs_offline_max_abs_difference']:.8g}。",
        "",
        "## 核心音质结果",
        "",
        "下面是每个真实录音目标成分对应的**投影增益（dB，0表示幅度大致未减弱）**。不能只凭这个值判断可听性，需一起阅读SI-SDRi、SNR及原始WAV。",
        "",
        "| 混音 | 目标 | 仅喇叭 | 仅警笛 | 单次two-hot | 双次独立提取相加 |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for r in results:
        for target in ('horn','siren'):
            if r['plan'][target+'_event'] is None:continue
            vals=[r['methods'][method][target]['full'].get('gain_db') for method in METHODS]
            l.append("| {} | {} | {} | {} | {} | {} |".format(r['plan']['id'],target,*[fmt(x) for x in vals]))
    l.extend(["","**同一目标的SI-SDRi（dB）**：","","| 混音 | 目标 | 仅喇叭 | 仅警笛 | 单次two-hot | 双次提取相加 |","|---|---|---:|---:|---:|---:|"])
    for r in results:
        for target in ('horn','siren'):
            if r['plan'][target+'_event'] is None:continue
            vals=[r['methods'][method][target]['full'].get('si_sdri_db') for method in METHODS]
            l.append("| {} | {} | {} | {} | {} | {} |".format(r['plan']['id'],target,*[fmt(x) for x in vals]))
    l.extend(["","## 计算速度（实测服务器CPU，不是耳机端到端）","","| 混音 | 单次two-hot 实测循环RTF | 两次单目标合计RTF |","|---|---:|---:|"])
    for r in results:
        p=r['performance']
        l.append(f"| {r['plan']['id']} | {p['two_hot']['loop_wall_rtf']:.3f} | {p['two_pass_sum']['loop_wall_rtf']:.3f} |")
    l.extend(["", "两次分别提取再相加相当于两个独立状态流的计算量；顺序执行的合计RTF不等于已验证的并行实时播放延迟。一次two-hot是否有好的质量必须看每个目标结果，不是仅看它能运行。",
              "",
              "## 仅背景场景：错误保留输出的能量",
              "",
              "| 输出方案 | 输出／输入功率比 dB（越低越少保留） |","|---|---:|"])
    bg=next(r for r in results if r['plan']['id']=='background_road')
    for k in METHODS:
        l.append(f"| {k} | {bg['methods'][k]['background_only_ratio_db']:.2f} |")
    l.extend(["", "背景保留不等同于语义误报概率。该实验没有人类标签，也没有客观危险事件识别器。",
              "",
              "## 证据和重要边界",
              "",
              "- 本轮所有方法都预先指定类别，**不能证明SH能自动识别并决定现实中的危险声音**。two-hot能够运行不等于模型经过多标签训练。",
              "- 单次two-hot与两次提取相加都需评估警笛／喇叭的保真、目标间串扰、背景保留和第一100ms；没有测试真实耳机、双耳录音几何或蓝牙延迟。",
              "- 试听包中的输入、输出、两种目标参考使用相同振幅；只用主观试听不能取代正式盲听或可靠性实验。",
              "- 若单次two-hot任一目标明显退化，应视为该固定官方模型尚未证明可以单次可靠保留两个目标；若双次方案较好，则还需处理运算开销、声音相加失真及设备限制。",
              "",
              f"- 运行环境：{meta['environment']}, torch {meta['torch_version']}，两线程；模型加载 {meta['model_load_seconds']:.3f}s。",
              "- 全量每场景原始输入、参考和方法输出：GitHub Actions artifact。精选试听：evidence/listening.zip。",
              "- 完整机器可读数据：evidence/results.json。构造计划和哈希：evidence/plans.json。",
              "",
              "**本轮不修改正式TSG网站、YAMNet或Semantic Hearing模型权重；研究分支独立于主分支。**",
              ""])
    return "\n".join(l)

def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--semantic-repo',type=Path,required=True)
    parser.add_argument('--checkpoint',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--evidence',type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    args.evidence.mkdir(parents=True,exist_ok=True)
    config=json.loads((HERE.parent/'round3/config.json').read_text())
    target_stems, backgrounds, critical, inventory=components(config)
    model,model_info=load_model(args.semantic_repo,args.checkpoint)
    if model_info['checkpoint_sha256']!=OFFICIAL_CHECKPOINT_SHA256:
        raise RuntimeError("Unexpected pretrained weights")
    scenes=[compose(spec,target_stems,backgrounds) for spec in CASES]
    plans=[s['plan'] for s in scenes]
    write_json(args.output/'plans.json',plans)
    write_json(args.evidence/'plans.json',plans)
    proof=quick_proof(model,scenes[3])
    results=[process(model,scene,args.output) for scene in scenes]
    meta=dict(checkpoint_sha256=model_info['checkpoint_sha256'],
              official_source_commit=config['upstream_commit'],
              model_load_seconds=model_info['load_seconds'],
              python=platform.python_version(),torch_version=torch.__version__,
              environment=platform.platform(),cpu=platform.processor(),
              process_peak_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
              all_audio_from_existing_verified_archives=True,
              no_training_or_weights_update=True,
              reference_disclaimer="Edited and inserted ordinary stereo recording components; no independently verified binaural or semantic pure target",
              run_unit="six input scenes, three real stateful model passes per scene; two_pass_sum is arithmetic only")
    archive=make_listening_zip(args.output,args.evidence)
    meta['listening_zip']=archive
    report=build_report(args.output,results,proof,meta)
    for root in (args.output,args.evidence):
        write_json(root/'results.json',dict(gate=proof,results=results,meta=meta))
        (root/'REPORT.zh-CN.md').write_text(report,encoding="utf-8")
    print(json.dumps(dict(status="completed",gate=proof,meta=meta,scenes=len(results)),
                     ensure_ascii=False),flush=True)

if __name__=='__main__':
    main()

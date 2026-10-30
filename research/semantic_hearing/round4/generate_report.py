#!/usr/bin/env python3
"""Generate a transparent summary strictly from actual official-model outputs."""
import argparse
import json
from pathlib import Path
import numpy as np

METHODS=("unprocessed_mixture","car_horn","siren","multi_hot","dual_raw","dual_safe")


def f(x):
    return "N/A" if x is None else f"{float(x):.2f}"


def avg(it):
    vals=[float(v) for v in it if v is not None]
    return float(np.mean(vals)) if vals else None


def read_gain(row,method,label):
    r=row["evaluations"][method]
    # Whole-recording 3-source joint projection keeps both target coefficients
    # identifiable in overlap tests, but does not establish detection.
    obj=r["whole_recording_joint_gains"].get(label)
    return obj["signed_gain_db"] if obj else None


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--gate",type=Path,required=True)
    p.add_argument("--study",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    gate=json.loads((args.gate/"preflight.json").read_text())
    rows=json.loads((args.study/"results.json").read_text())
    if len(rows)!=12 or not gate["numerical_equivalence"]:
        raise RuntimeError("Not a validated complete 12-case study")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    overlap=[r for r in rows if r["kind"]=="overlap"]
    no_target=[r for r in rows if r["kind"]=="none"]
    s=[]
    s.append("# Semantic Hearing 第四轮：真实预训练模型的双类别条件试验")
    s.append("")
    s.append("**以下为已运行模型输出的机器生成实验摘要，不是主观试听、自动分类准确率或交通安全测试。**")
    s.append("")
    s.append("## 官方代码接口和实际数值门槛")
    s.append("")
    s.append("- 官方20维条件输入可以实测接受 car_horn 和 siren 同时为1的多热向量。")
    s.append("- 该多热向量不是官方证明经过多标签联合训练的输入，能运行不代表能有效提取。")
    s.append("- 与同样多热条件的整段forward对照，流式/整段最大绝对差：`" +
             str(gate["stream_offline_max_abs_sample_difference"]) + "`。")
    s.append("- 完整实验包括两种真实背景 × 六种受控混音条件，共12条构造音频；不同条件重用原录音。")
    s.append("")
    s.append("## 两种声音重叠时，保留各声音的幅度（dB）")
    s.append("")
    s.append("同一输入下以各自录音参考 + 真实背景作联合最小二乘投影；0dB约代表不衰减，负值代表减弱。可能存在相位翻转，数值不能直接解释为主观可听性。")
    s.append("")
    s.append("| 背景/喇叭来源 | 方法 | 喇叭投影增益 | 警笛投影增益 | 整体 SI-SDR 改善 | RTF |")
    s.append("|---|---|---:|---:|---:|---:|")
    for row in overlap:
        for m in ("unprocessed_mixture","car_horn","siren","multi_hot","dual_safe"):
            rtf=row["timings"][m]["rtf"] if m in row["timings"] else None
            s.append(f"| {row['background']} / {row['horn_source']} | {m} | "+
                     f"{f(read_gain(row,m,'horn'))} | {f(read_gain(row,m,'siren'))} | "+
                     f"{f(row['evaluations'][m]['si_sdri_db'])} | {f(rtf)} |")
    s.append("")
    s.append("## 无警告音时的残留声音")
    s.append("")
    s.append("RMS输出相对原背景越低，说明输出背景越小；这**不是**警告识别误报率。")
    s.append("")
    s.append("| 背景 | 喇叭单标签 | 警笛单标签 | 双类别单模型 | 双实例合成 |")
    s.append("|---|---:|---:|---:|---:|")
    for row in no_target:
        s.append("| "+row["background"]+" | "+" | ".join(
            f(row["evaluations"][m]["no_target_background_rms_db_relative_to_input"])
            for m in ("car_horn","siren","multi_hot","dual_safe"))+" |")
    s.append("")
    s.append("## 全部测试场景（全输入连续状态）")
    s.append("")
    s.append("| 输入情景 | 背景 | 双类别 SI-SDRi (dB) | 双实例 SI-SDRi (dB) | 双类别 RTF | 双实例串行总 RTF |")
    s.append("|---|---|---:|---:|---:|---:|")
    for r in rows:
        s.append(f"| {r['kind']} | {r['background']} | "+
                 f"{f(r['evaluations']['multi_hot']['si_sdri_db'])} | "+
                 f"{f(r['evaluations']['dual_safe']['si_sdri_db'])} | "+
                 f"{f(r['timings']['multi_hot']['rtf'])} | "+
                 f"{f(r['timings']['dual_sequential_total_s']/7.0)} |")
    s.append("")
    s.append("## 判断和局限")
    s.append("")
    s.append("本轮可以直接判断：**单模型多热条件**和**双个独立连续SH模型的合成**在记录下来的真实混音中各自保留了多少喇叭和警笛，以及CPU吞吐量差别。")
    s.append("")
    s.append("即使两种音频都被保留，SH也**没有自动输出“喇叭/警笛”分类结果**。想替代YAMNet的警告识别，需要另外验证可以可靠开启/关闭警告的判定逻辑，以及漏报/误报。")
    s.append("")
    s.append("测试素材为已有5个原始录音的受控混合（不是12个独立道路场景）；警笛参考声轨未验证完全纯净，背景被人工循环。")
    s.append("没有测试真正移动端、耳机输出、用户音乐、蓝牙、设备硬件延迟、功耗、长时间内存和主观可听性。")
    s.append("软件RTF不等于端到端警告识别延迟，更不等于警告已经能听到。")
    s.append("")
    s.append("完整每事件100ms投影、其他场景与逐模式统计，见工作流Artifact中的`study/results.json`与原幅度WAV。")
    s.append("")
    args.output.write_text("\n".join(s)+"\n",encoding="utf-8")
    print("REPORT_CREATED",args.output,len(rows),flush=True)


if __name__=="__main__":main()

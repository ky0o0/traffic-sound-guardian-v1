#!/usr/bin/env python3
"""Use ALL six real browser-generated YAMNet scores; do not invent accuracy."""
from pathlib import Path
from collections import Counter
import json,csv,gzip

ROOT=Path(__file__).resolve().parent
WORK=ROOT/".working"
manifest=json.loads((WORK/"manifest.json").read_text())
data=json.loads((WORK/"raw-results.json").read_text())
audio={x["id"]:x for x in manifest["clips"]}
clips=data["clips"]
CATS={
  "bell":"Bicycle bell",
  "horn":"Vehicle horn, car horn, honking",
  "siren":"Siren",
  "police":"Police car (siren)",
  "ambulance":"Ambulance (siren)",
  "fire":"Fire engine, fire truck (siren)"}
if not clips or len(clips)!=len(audio):raise RuntimeError("Missing real YAMNet clips")
rows=[];full=[]
for c in clips:
    src=audio[c["id"]]
    windows=c["result"]["windows"]
    if not windows:raise RuntimeError("No real windows")
    peaks={k:max(float(w["scores"][v]) for w in windows) for k,v in CATS.items()}
    if any(v<0 or v>1 for v in peaks.values()):raise RuntimeError("Invalid scores")
    for w in windows:
        full.append(dict(id=c["id"],source_group=src["original_recording_group"],
                         source_label=src["label"],sound_kind=src["sound_kind"],
                         start=w["start"],end=w["end"],inference_ms=w["inferenceMs"],
                         worker_round_trip_ms=w["roundTripMs"],
                         **{"score_"+k:w["scores"][v] for k,v in CATS.items()}))
    rows.append(dict(id=c["id"],source_label=src["label"],
                     sound_kind=src["sound_kind"],dataset=src["dataset"],
                     source_group=src["original_recording_group"],
                     source_url=src["source_url"],download_url=src["url"],
                     sha256=src["sha256"],license=src["license"],
                     duration=c["duration"],windows=len(windows),peaks=peaks,
                     exact_label_meets_0_10=bool(src["label"] in peaks and peaks[src["label"]]>=.1),
                     any_siren_meets_0_10=any(peaks[k]>=.1 for k in ("siren","police","ambulance","fire"))))
with gzip.open(ROOT/"WINDOW_SCORES.csv.gz","wt",newline="",encoding="utf8") as f:
    writer=csv.DictWriter(f,fieldnames=list(full[0]))
    writer.writeheader();writer.writerows(full)
with gzip.open(ROOT/"SCORES.json.gz","wt",encoding="utf8") as f:
    json.dump(data,f,ensure_ascii=False)
bytype={}
for k in ("police","ambulance","fire","none"):
    selections=[r for r in rows if r["source_label"]==k]
    bytype[k]=dict(clips=len(selections),
      synthesized=sum("SYNTHETIC" in r["sound_kind"] for r in selections),
      independent_source_groups=len(set(r["source_group"] for r in selections)),
      exact_at_010=sum(r["exact_label_meets_0_10"] for r in selections),
      siren_group_at_010=sum(r["any_siren_meets_0_10"] for r in selections))
thresholds=[i/100 for i in range(1,51)]
curves={k:[dict(threshold=t,
                 matching=sum(r["peaks"][k]>=t for r in rows if r["source_label"]==k),
                 total=sum(r["source_label"]==k for r in rows),
                 any_siren_matching=sum(any(r["peaks"][n]>=t for n in ("siren","police","ambulance","fire")) for r in rows if r["source_label"]==k))
            for t in thresholds] for k in ("police","ambulance","fire")}
result=dict(status="EXPLORATORY_CREATOR_LABELS_SYNTHETIC_MIXED",
            class_names=CATS,source_counts=bytype,windows=len(full),
            source_rows=rows,threshold_sweep=curves,
            notes=["OtoLogic sirens are synthesized and NOT real Japanese street recordings.",
                   "OtoLogic near/far/dry versions are correlated source variants.",
                   "Taira Komori creator-labelled sounds cannot be asserted to be unmodified street recordings.",
                   "Source labels not independently audited.",
                   "No event timestamps/false-alarm rate/real microphone or headphone latency measured.",
                   "No YAMNet production thresholds changed.",
                   "Six scores are original uncalibrated YAMNet outputs, not sound pressure level."])
(ROOT/"RESULTS.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
lines=["# 日本紧急车辆警笛：YAMNet 三个细分类别试运行",
       "",
       "**已经用 TSG V1.6 原版 YAMNet 进行真实推理，但作者标注并非人工审核过的交通现场真值。OtoLogic 警笛为合成音效，不能称为真实道路录音。**",
       "",
       "实际分析音频："+str(len(rows))+"段，完整六类窗口分数："+str(len(full))+"个。",
       "",
       "| 来源标注类别 | 完成音频 | 明确合成音效 | 独立原始素材组 | 对应类别达到0.10 | 任意四个警笛标签达到0.10 |",
       "|---|---:|---:|---:|---:|---:|"]
for k in bytype:
    x=bytype[k]
    lines.append("| "+k+" | "+" | ".join(str(x[n]) for n in ("clips","synthesized","independent_source_groups","exact_at_010","siren_group_at_010"))+" |")
lines.extend(["",
 "这一表只表示来源作者标签对应的**文件级检出**，不是经过独立核查的准确率。特别是警车类别在本次素材中为合成音效。",
 "",
 "## 每段录音的六类原始峰值",
 "",
 "| 文件 | 性质 | 来源类别 | 通用Siren | Police | Ambulance | Fire |",
 "|---|---|---|---:|---:|---:|---:|"])
for r in rows:
    p=r["peaks"]
    lines.append("| "+r["id"]+" | "+("合成" if "SYNTHETIC" in r["sound_kind"] else "音效素材")+" | "+r["source_label"]+
                 " | "+" | ".join(format(p[x],".3f") for x in ("siren","police","ambulance","fire"))+" |")
lines.extend(["",
 "## 阈值与实验限制",
 "",
 "每个0.975秒窗口的完整六类Score已保存到 WINDOW_SCORES.csv.gz；0.01到0.50的逐类检出数保存到RESULTS.json。",
 "一段近处/远处/干声是同一原始音效的不同处理，不能用于夸大独立样本数。",
 "要测真正日本街头的准确率，还需独立采集日本街道真实警车、救护车和消防车录音，并且核对事件起止时间和是否存在背景声。",
 "**此阶段不改变正式网站的六个阈值。**",
 "",
 "## 来源",
 "",
 "- 日本 Taira Komori：[环境音效和车辆经过录音](https://taira-komori.net/enviroment01.html)，允许教育研究，禁止素材本身再分发。",
 "- 日本 OtoLogic：[警车、救护车、消防车合成音效](https://otologic.jp/free/se/transportation02.html)，作者明确说明使用合成器。",
 ""])
(ROOT/"REPORT.zh-CN.md").write_text("\n".join(lines),encoding="utf8")
print(json.dumps({"processed":len(rows),"windows":len(full),"by_type":bytype},ensure_ascii=False),flush=True)
